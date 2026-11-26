import { Router } from 'express';
import { z } from 'zod';
import { CITIES } from '../../shared/data.ts';
import {
  clearSessionCookie,
  createSession,
  destroySession,
  hashPassword,
  me,
  requireAuth,
  setSessionCookie,
  tokenFromCookieHeader,
  verifyPassword,
} from '../auth.ts';
import { getUser, joinChat, joinCommunity, toMe, toUserPublic } from '../core.ts';
import { db, type ChatRow, type UserRow } from '../db.ts';
import { emitToUser } from '../realtime.ts';
import { HttpError, bad, intParam, likeEscape, now, parse, rateLimiter, strQuery, zProfile, zUploadUrl, zWorld } from '../util.ts';

export const router = Router();

const authLimit = rateLimiter(15, 60_000);
const adminEmails = new Set(
  (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
);

const cityKeys = new Set(CITIES.map((c) => c.key));
const zCity = z
  .string()
  .nullable()
  .optional()
  .refine((v) => v == null || cityKeys.has(v), 'unknown city');
const zYear = z
  .number()
  .int()
  .min(1948)
  .max(new Date().getFullYear() + 5)
  .nullable()
  .optional();
const zUsername = z
  .string()
  .trim()
  .regex(/^[a-zA-Z0-9_.]{3,30}$/, 'username: 3-30 letters, digits, _ or .');

function uniqueUsername(name: string): string {
  const base =
    name
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '.')
      .replace(/^\.+|\.+$/g, '')
      .slice(0, 20) || 'olim';
  const padded = base.length < 3 ? `${base}.olim` : base;
  const exists = db.prepare('SELECT 1 FROM users WHERE username = ?');
  if (!exists.get(padded)) return padded;
  for (let i = 0; i < 50; i++) {
    const candidate = `${padded}${Math.floor(10 + Math.random() * 9990)}`;
    if (!exists.get(candidate)) return candidate;
  }
  return `${padded}${Date.now()}`;
}

/** Auto-join the built-in groups that match a profile, so nobody lands on an empty app. */
export function autoJoin(user: UserRow) {
  const keys = [`${user.world}:welcome`, `${user.world}:events`];
  if (user.city) keys.push(`${user.world}:city:${user.city}`);
  if (user.profile) keys.push(`${user.world}:profile:${user.profile}`);
  const stmt = db.prepare('SELECT * FROM chats WHERE seed_key = ?');
  for (const key of keys) {
    const chat = stmt.get(key) as ChatRow | undefined;
    if (!chat) continue;
    joinChat(chat, user.id);
    if (chat.community_id) joinCommunity(chat.community_id, user.id);
  }
}

router.post('/auth/register', async (req, res) => {
  if (!authLimit(req.ip ?? 'ip')) throw new HttpError(429, 'too_many_requests');
  const body = parse(
    z.object({
      email: z.email().max(200),
      password: z.string().min(8).max(200),
      name: z.string().trim().min(2).max(60),
      world: zWorld,
      profile: zProfile.nullable().optional(),
      city: zCity,
      aliyahYear: zYear,
    }),
    req.body,
  );
  const email = body.email.trim().toLowerCase();
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) throw bad('email_taken', 409);
  const t = now();
  const info = db
    .prepare(
      `INSERT INTO users (email, username, password_hash, name, profile, city, world, aliyah_year, is_admin, created_at, last_seen)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      email,
      uniqueUsername(body.name),
      await hashPassword(body.password),
      body.name,
      body.profile ?? null,
      body.city ?? null,
      body.world,
      body.aliyahYear ?? null,
      adminEmails.has(email) ? 1 : 0,
      t,
      t,
    );
  const user = getUser(Number(info.lastInsertRowid))!;
  autoJoin(user);
  setSessionCookie(req, res, createSession(user.id));
  res.status(201).json({ me: toMe(user) });
});

router.post('/auth/login', async (req, res) => {
  if (!authLimit(req.ip ?? 'ip')) throw new HttpError(429, 'too_many_requests');
  const body = parse(z.object({ email: z.string().max(200), password: z.string().max(200) }), req.body);
  const user = db.prepare('SELECT * FROM users WHERE email = ? AND is_system = 0').get(body.email.trim().toLowerCase()) as
    | UserRow
    | undefined;
  // Always run a hash comparison so that timing does not reveal whether the email exists.
  const ok = await verifyPassword(body.password, user?.password_hash ?? 'scrypt$AAAA$AAAA');
  if (!user || !ok) throw new HttpError(401, 'invalid_credentials');
  if (user.banned) throw new HttpError(403, 'banned');
  if (adminEmails.has(user.email.toLowerCase()) && !user.is_admin) {
    db.prepare('UPDATE users SET is_admin = 1 WHERE id = ?').run(user.id);
    user.is_admin = 1;
  }
  setSessionCookie(req, res, createSession(user.id));
  res.json({ me: toMe(user) });
});

router.post('/auth/logout', (req, res) => {
  const token = tokenFromCookieHeader(req.headers.cookie);
  if (token) destroySession(token);
  clearSessionCookie(res);
  res.json({ ok: true });
});

router.get('/me', (req, res) => {
  res.json({ me: req.user ? toMe(req.user) : null });
});

router.patch('/me', requireAuth, async (req, res) => {
  const user = me(req);
  const body = parse(
    z.object({
      name: z.string().trim().min(2).max(60).optional(),
      username: zUsername.optional(),
      bio: z.string().trim().max(300).optional(),
      avatar: zUploadUrl.nullable().optional(),
      profile: zProfile.nullable().optional(),
      city: zCity,
      world: zWorld.optional(),
      aliyahYear: zYear,
      password: z.string().min(8).max(200).optional(),
      currentPassword: z.string().max(200).optional(),
    }),
    req.body,
  );
  if (body.username && body.username.toLowerCase() !== user.username.toLowerCase()) {
    if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(body.username)) throw bad('username_taken', 409);
  }
  let passwordHash = user.password_hash;
  if (body.password) {
    if (!(await verifyPassword(body.currentPassword ?? '', user.password_hash))) throw new HttpError(403, 'wrong_password');
    passwordHash = await hashPassword(body.password);
  }
  const next = {
    name: body.name ?? user.name,
    username: body.username ?? user.username,
    bio: body.bio ?? user.bio,
    avatar: body.avatar === undefined ? user.avatar : body.avatar,
    profile: body.profile === undefined ? user.profile : body.profile,
    city: body.city === undefined ? user.city : body.city,
    world: body.world ?? user.world,
    aliyah_year: body.aliyahYear === undefined ? user.aliyah_year : body.aliyahYear,
  };
  db.prepare(
    `UPDATE users SET name=?, username=?, bio=?, avatar=?, profile=?, city=?, world=?, aliyah_year=?, password_hash=? WHERE id=?`,
  ).run(next.name, next.username, next.bio, next.avatar, next.profile, next.city, next.world, next.aliyah_year, passwordHash, user.id);
  const updated = getUser(user.id)!;
  // Entering a new world for the first time: join its welcome groups too.
  if (body.world && body.world !== user.world) autoJoin(updated);
  emitToUser(user.id, 'me:update', toMe(updated));
  res.json({ me: toMe(updated) });
});

// ───────────── other users ─────────────

router.get('/users/search', requireAuth, (req, res) => {
  const q = strQuery(req, 'q', 40);
  if (q.length < 2) return res.json({ users: [] });
  const like = `%${likeEscape(q)}%`;
  const rows = db
    .prepare(
      `SELECT * FROM users WHERE is_system = 0 AND banned = 0 AND id != ?
       AND (name LIKE ? ESCAPE '\\' OR username LIKE ? ESCAPE '\\') ORDER BY last_seen DESC LIMIT 20`,
    )
    .all(me(req).id, like, like) as UserRow[];
  res.json({ users: rows.map(toUserPublic) });
});

router.get('/users/:id', requireAuth, (req, res) => {
  const user = getUser(intParam(req, 'id'));
  if (!user || user.banned) throw new HttpError(404, 'user_not_found');
  const shared = db
    .prepare(
      `SELECT c.id, c.name, c.emoji FROM chats c
       JOIN chat_members a ON a.chat_id = c.id AND a.user_id = ?
       JOIN chat_members b ON b.chat_id = c.id AND b.user_id = ?
       WHERE c.type = 'group' ORDER BY c.member_count DESC LIMIT 12`,
    )
    .all(user.id, me(req).id);
  res.json({ user: toUserPublic(user), sharedGroups: shared });
});

router.post('/users/:id/block', requireAuth, (req, res) => {
  const id = intParam(req, 'id');
  if (id === me(req).id) throw bad('invalid_target');
  if (!getUser(id)) throw new HttpError(404, 'user_not_found');
  db.prepare('INSERT OR IGNORE INTO blocks (user_id, blocked_id) VALUES (?,?)').run(me(req).id, id);
  res.json({ me: toMe(me(req)) });
});

router.delete('/users/:id/block', requireAuth, (req, res) => {
  db.prepare('DELETE FROM blocks WHERE user_id = ? AND blocked_id = ?').run(me(req).id, intParam(req, 'id'));
  res.json({ me: toMe(me(req)) });
});

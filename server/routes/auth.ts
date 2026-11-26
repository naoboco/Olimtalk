import fs from 'node:fs';
import path from 'node:path';
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { CITIES } from '../../shared/data.ts';
import {
  clearSessionCookie,
  createSession,
  destroyOtherSessions,
  destroySession,
  hashPassword,
  me,
  requireAuth,
  setSessionCookie,
  tokenFromRequest,
  verifyPassword,
  wantsToken,
} from '../auth.ts';
import { getUser, joinChat, toMe, toUserPublic } from '../core.ts';
import { UPLOAD_DIR, db, tx, type ChatRow, type UserRow } from '../db.ts';
import { emitToChat, emitToUser, kick } from '../realtime.ts';
import { HttpError, bad, intParam, likeEscape, now, parse, rateLimiter, strQuery, zProfile, zUploadUrl, zWorld } from '../util.ts';

export const router = Router();

// Per address: generous enough for a whole meetup signing up on the same Wi-Fi.
const authLimit = rateLimiter(Number(process.env.AUTH_RATE_LIMIT || 40), 60_000);
// Per account: slows down password guessing whatever the address.
const loginLimit = rateLimiter(10, 10 * 60_000);
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
  }
}

/** Start a session: a cookie for the website, the token itself for the mobile apps. */
function openSession(req: Request, res: Response, user: UserRow): { me: ReturnType<typeof toMe>; token?: string } {
  const token = createSession(user.id);
  if (wantsToken(req)) return { me: toMe(user), token };
  setSessionCookie(req, res, token);
  return { me: toMe(user) };
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
  res.status(201).json(openSession(req, res, user));
});

router.post('/auth/login', async (req, res) => {
  if (!authLimit(req.ip ?? 'ip')) throw new HttpError(429, 'too_many_requests');
  const body = parse(z.object({ email: z.string().max(200), password: z.string().max(200) }), req.body);
  if (!loginLimit(body.email.trim().toLowerCase())) throw new HttpError(429, 'too_many_requests');
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
  res.json(openSession(req, res, user));
});

router.post('/auth/logout', (req, res) => {
  const token = tokenFromRequest(req);
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
    destroyOtherSessions(user.id, tokenFromRequest(req));
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
  emitToUser(user.id, 'me:update', toMe(updated));
  res.json({ me: toMe(updated) });
});

/** Delete uploaded files that nothing references any more. */
function removeOrphanUploads(urls: string[]) {
  const used = db.prepare(
    `SELECT 1 WHERE EXISTS (SELECT 1 FROM messages WHERE attachment LIKE ? ESCAPE '\\')
        OR EXISTS (SELECT 1 FROM stories WHERE media LIKE ? ESCAPE '\\')
        OR EXISTS (SELECT 1 FROM users WHERE avatar = ?)
        OR EXISTS (SELECT 1 FROM chats WHERE avatar = ?)
        OR EXISTS (SELECT 1 FROM communities WHERE avatar = ?)`,
  );
  for (const url of new Set(urls)) {
    if (!/^\/uploads\/[A-Za-z0-9_-]+\.[a-z0-9]{1,5}$/.test(url)) continue;
    const like = `%"${likeEscape(url)}"%`;
    if (used.get(like, like, url, url, url)) continue;
    fs.rm(path.join(UPLOAD_DIR, path.basename(url)), { force: true }, () => undefined);
  }
}

/**
 * Permanently delete the account and everything its owner posted.
 * Both app stores require this to be possible from inside the app.
 */
router.post('/me/delete', requireAuth, async (req, res) => {
  const user = me(req);
  const body = parse(z.object({ password: z.string().max(200) }), req.body);
  if (!(await verifyPassword(body.password, user.password_hash))) throw new HttpError(403, 'wrong_password');

  const urls: string[] = [];
  if (user.avatar) urls.push(user.avatar);
  const collect = (rows: { json: string | null }[]) => {
    for (const r of rows) {
      try {
        const url = r.json ? (JSON.parse(r.json) as { url?: string }).url : undefined;
        if (url) urls.push(url);
      } catch {
        /* ignore malformed rows */
      }
    }
  };
  collect(db.prepare('SELECT attachment AS json FROM messages WHERE user_id = ? AND attachment IS NOT NULL').all(user.id) as { json: string }[]);
  collect(db.prepare('SELECT media AS json FROM stories WHERE user_id = ? AND media IS NOT NULL').all(user.id) as { json: string }[]);

  const groups = db
    .prepare("SELECT c.id, m.role FROM chat_members m JOIN chats c ON c.id = m.chat_id WHERE m.user_id = ? AND c.type = 'group'")
    .all(user.id) as { id: number; role: string }[];
  const dms = (
    db.prepare("SELECT c.id FROM chat_members m JOIN chats c ON c.id = m.chat_id WHERE m.user_id = ? AND c.type = 'dm'").all(user.id) as {
      id: number;
    }[]
  ).map((r) => r.id);

  tx(() => {
    db.prepare(
      `UPDATE chats SET member_count = MAX(member_count - 1, 0)
       WHERE type = 'group' AND id IN (SELECT chat_id FROM chat_members WHERE user_id = ?)`,
    ).run(user.id);
    db.prepare(
      `UPDATE communities SET member_count = MAX(member_count - 1, 0)
       WHERE id IN (SELECT community_id FROM community_members WHERE user_id = ?)`,
    ).run(user.id);
    // Groups this person created stay alive: the longest-standing admin or member takes over.
    const heir = db.prepare(
      `SELECT user_id FROM chat_members WHERE chat_id = ? AND user_id != ?
       ORDER BY CASE role WHEN 'admin' THEN 0 ELSE 1 END, joined_at LIMIT 1`,
    );
    const promote = db.prepare("UPDATE chat_members SET role = 'owner' WHERE chat_id = ? AND user_id = ?");
    for (const g of groups) {
      if (g.role !== 'owner') continue;
      const next = heir.get(g.id, user.id) as { user_id: number } | undefined;
      if (next) promote.run(g.id, next.user_id);
    }
    // Private conversations disappear with the account.
    const dropChat = db.prepare('DELETE FROM chats WHERE id = ?');
    for (const id of dms) dropChat.run(id);
    // Everything else (messages, stories, reactions, memberships, sessions…) cascades.
    db.prepare('DELETE FROM users WHERE id = ?').run(user.id);
  });

  // Close this person's own connections first, so that only the others are notified.
  kick(user.id);
  for (const id of dms) emitToChat(id, 'chat:deleted', { chatId: id });
  for (const g of groups) emitToChat(g.id, 'chat:update', { chatId: g.id });
  removeOrphanUploads(urls);
  clearSessionCookie(res);
  res.json({ ok: true });
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

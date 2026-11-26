import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { CITIES } from '../../shared/data.ts';
import { PUBLIC_KEY_RE } from '../../shared/e2e.ts';
import {
  clearSessionCookie,
  createSession,
  destroyOtherSessions,
  destroySession,
  listSessions,
  revokeSession,
  hashPassword,
  me,
  requireAuth,
  setSessionCookie,
  tokenFromRequest,
  verifyPassword,
  wantsToken,
} from '../auth.ts';
import { attachmentUrls, getUser, joinChat, removeOrphanUploads, toMe, toUserPublic } from '../core.ts';
import { db, tx, type ChatRow, type UserRow } from '../db.ts';
import { emitToChat, emitToUser, kick } from '../realtime.ts';
import { removeUploadFiles } from './connect.ts';
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
// End-to-end encryption material. The server stores it but cannot use it: the private
// key arrives already encrypted with a key derived from the password on the device.
const zPublicKey = z.string().regex(PUBLIC_KEY_RE);
const zWrappedKey = z
  .string()
  .min(40)
  .max(2000)
  .regex(/^[A-Za-z0-9+/=]+$/);

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
  const token = createSession(user.id, req.get('user-agent') ?? '');
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
      publicKey: zPublicKey.optional(),
      encryptedPrivateKey: zWrappedKey.optional(),
    }),
    req.body,
  );
  if (!body.publicKey !== !body.encryptedPrivateKey) throw bad('invalid_input');
  const email = body.email.trim().toLowerCase();
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) throw bad('email_taken', 409);
  const t = now();
  const info = db
    .prepare(
      `INSERT INTO users (email, username, password_hash, name, profile, city, world, aliyah_year, is_admin, created_at, last_seen,
         e2e_public, e2e_private)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
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
      body.publicKey ?? null,
      body.encryptedPrivateKey ?? null,
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
      // With a new password come the private key and the vault re-encrypted for it.
      encryptedPrivateKey: zWrappedKey.optional(),
      vault: z.string().max(40_000).nullable().optional(),
      hidePresence: z.boolean().optional(),
      noReceipts: z.boolean().optional(),
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
    // The old password could unwrap the old copy of the private key: never keep it.
    if (user.e2e_private && !body.encryptedPrivateKey) throw bad('keys_required');
    db.prepare('UPDATE users SET e2e_private = ?, vault = ? WHERE id = ?').run(
      body.encryptedPrivateKey ?? null,
      body.vault === undefined ? null : body.vault,
      user.id,
    );
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
    `UPDATE users SET name=?, username=?, bio=?, avatar=?, profile=?, city=?, world=?, aliyah_year=?, password_hash=?,
       hide_presence=?, no_receipts=? WHERE id=?`,
  ).run(
    next.name,
    next.username,
    next.bio,
    next.avatar,
    next.profile,
    next.city,
    next.world,
    next.aliyah_year,
    passwordHash,
    body.hidePresence === undefined ? user.hide_presence : +body.hidePresence,
    body.noReceipts === undefined ? user.no_receipts : +body.noReceipts,
    user.id,
  );
  const updated = getUser(user.id)!;
  emitToUser(user.id, 'me:update', toMe(updated));
  res.json({ me: toMe(updated) });
});

// ───────────── end-to-end encryption keys ─────────────

router.get('/me/keys', requireAuth, (req, res) => {
  const user = me(req);
  res.json({ publicKey: user.e2e_public, encryptedPrivateKey: user.e2e_private });
});

/** Publish a key pair: the first time, or after the person chose to reset their encryption. */
router.put('/me/keys', requireAuth, (req, res) => {
  const user = me(req);
  const body = parse(z.object({ publicKey: zPublicKey, encryptedPrivateKey: zWrappedKey }), req.body);
  db.prepare('UPDATE users SET e2e_public = ?, e2e_private = ? WHERE id = ?').run(body.publicKey, body.encryptedPrivateKey, user.id);
  if (body.publicKey !== user.e2e_public) {
    // The people this person talks to privately must learn the new key.
    const dms = db
      .prepare("SELECT c.id FROM chat_members m JOIN chats c ON c.id = m.chat_id WHERE m.user_id = ? AND c.type = 'dm'")
      .all(user.id) as { id: number }[];
    for (const dm of dms) emitToChat(dm.id, 'chat:update', { chatId: dm.id });
  }
  res.json({ me: toMe(getUser(user.id)!) });
});

// ───────────── settings vault (ciphertext only) ─────────────

router.get('/me/vault', requireAuth, (req, res) => {
  res.json({ vault: me(req).vault });
});

router.put('/me/vault', requireAuth, (req, res) => {
  const body = parse(z.object({ vault: z.string().max(40_000).nullable() }), req.body);
  db.prepare('UPDATE users SET vault = ? WHERE id = ?').run(body.vault, me(req).id);
  res.json({ ok: true });
});

// ───────────── connected devices ─────────────

router.get('/me/sessions', requireAuth, (req, res) => {
  res.json({ sessions: listSessions(me(req).id, tokenFromRequest(req)) });
});

router.delete('/me/sessions/:id', requireAuth, (req, res) => {
  const user = me(req);
  if (!revokeSession(user.id, String(req.params.id))) throw new HttpError(404, 'not_found');
  // Drop the live connections; devices that are still signed in reconnect on their own.
  kick(user.id);
  res.json({ sessions: listSessions(user.id, tokenFromRequest(req)) });
});

/**
 * Permanently delete the account and everything its owner posted.
 * Both app stores require this to be possible from inside the app.
 */
router.post('/me/delete', requireAuth, async (req, res) => {
  const user = me(req);
  const body = parse(z.object({ password: z.string().max(200) }), req.body);
  if (!(await verifyPassword(body.password, user.password_hash))) throw new HttpError(403, 'wrong_password');

  const urls = [
    ...(user.avatar ? [user.avatar] : []),
    ...attachmentUrls(db.prepare('SELECT attachment AS json FROM messages WHERE user_id = ? AND attachment IS NOT NULL').all(user.id) as { json: string }[]),
    ...attachmentUrls(db.prepare('SELECT media AS json FROM stories WHERE user_id = ? AND media IS NOT NULL').all(user.id) as { json: string }[]),
  ];

  const mailFiles = (db.prepare('SELECT body FROM emails WHERE user_id = ?').all(user.id) as { body: string }[]).map((r) => r.body);

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
  removeUploadFiles(mailFiles);
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

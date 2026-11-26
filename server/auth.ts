import crypto from 'node:crypto';
import { promisify } from 'node:util';
import type { NextFunction, Request, Response } from 'express';
import { parseCookie, stringifySetCookie } from 'cookie';
import { db, type UserRow } from './db.ts';
import { HttpError, now } from './util.ts';

const scrypt = promisify(crypto.scrypt) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

export const COOKIE = 'ot_session';
const SESSION_TTL = 1000 * 60 * 60 * 24 * 60; // 60 days

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, saltB64, hashB64] = stored.split('$');
  if (algo !== 'scrypt' || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = await scrypt(password, Buffer.from(saltB64, 'base64'), expected.length);
  return crypto.timingSafeEqual(expected, actual);
}

const sha = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

export function createSession(userId: number, userAgent = ''): string {
  const token = crypto.randomBytes(32).toString('base64url');
  const t = now();
  db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at, id, user_agent, last_used) VALUES (?,?,?,?,?,?,?)').run(
    sha(token),
    userId,
    t,
    t + SESSION_TTL,
    crypto.randomBytes(9).toString('base64url'),
    userAgent.slice(0, 300),
    t,
  );
  return token;
}

export interface SessionInfo {
  id: string;
  userAgent: string;
  createdAt: number;
  lastUsed: number;
  current: boolean;
}

/** The devices signed in to an account, most recently used first. */
export function listSessions(userId: number, currentToken: string | undefined): SessionInfo[] {
  const current = currentToken ? sha(currentToken) : '';
  const rows = db
    .prepare('SELECT id, token_hash, user_agent, created_at, last_used FROM sessions WHERE user_id = ? AND expires_at > ? ORDER BY last_used DESC')
    .all(userId, now()) as { id: string | null; token_hash: string; user_agent: string; created_at: number; last_used: number }[];
  return rows.map((r) => ({
    id: r.id ?? r.token_hash.slice(0, 12),
    userAgent: r.user_agent,
    createdAt: r.created_at,
    lastUsed: r.last_used || r.created_at,
    current: r.token_hash === current,
  }));
}

/** Sign one device out. Returns false when it does not belong to this account. */
export function revokeSession(userId: number, id: string): boolean {
  return db.prepare('DELETE FROM sessions WHERE user_id = ? AND (id = ? OR substr(token_hash, 1, 12) = ?)').run(userId, id, id).changes > 0;
}

export function destroySession(token: string) {
  db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha(token));
}

/** After a password change: sign out every other device. */
export function destroyOtherSessions(userId: number, keepToken: string | undefined) {
  db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?').run(userId, keepToken ? sha(keepToken) : '');
}

export function userFromToken(token: string | undefined): UserRow | undefined {
  if (!token) return undefined;
  const row = db
    .prepare(
      `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > ? AND u.banned = 0`,
    )
    .get(sha(token), now()) as UserRow | undefined;
  // Remember when each device was last active (at most one write every few minutes).
  if (row) db.prepare('UPDATE sessions SET last_used = ? WHERE token_hash = ? AND last_used < ?').run(now(), sha(token), now() - 5 * 60_000);
  return row;
}

export function tokenFromCookieHeader(header: string | undefined): string | undefined {
  if (!header) return undefined;
  return parseCookie(header)[COOKIE];
}

/** The session token of a request: `Authorization: Bearer …` (mobile apps) or the cookie (web). */
export function tokenFromRequest(req: Request): string | undefined {
  const header = req.headers.authorization;
  if (header && /^Bearer\s+\S/i.test(header)) return header.replace(/^Bearer\s+/i, '').trim();
  return tokenFromCookieHeader(req.headers.cookie);
}

/**
 * The native apps load their interface from the device, not from this server,
 * so cookies do not apply to them: they ask for the token itself.
 */
export function wantsToken(req: Request): boolean {
  return req.get('x-olimtalk-client') === 'app';
}

export function setSessionCookie(req: Request, res: Response, token: string) {
  res.setHeader(
    'Set-Cookie',
    stringifySetCookie({
      name: COOKIE,
      value: token,
      httpOnly: true,
      sameSite: 'lax',
      secure: req.secure,
      path: '/',
      maxAge: SESSION_TTL / 1000,
    }),
  );
}

export function clearSessionCookie(res: Response) {
  res.setHeader('Set-Cookie', stringifySetCookie({ name: COOKIE, value: '', httpOnly: true, sameSite: 'lax', path: '/', maxAge: 0 }));
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: UserRow;
  }
}

/** Attach req.user when a valid session cookie is present. Never rejects. */
export function loadUser(req: Request, _res: Response, next: NextFunction) {
  req.user = userFromToken(tokenFromRequest(req));
  next();
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(new HttpError(401, 'unauthorized'));
  next();
}

/** The authenticated user (use only behind requireAuth). */
export function me(req: Request): UserRow {
  if (!req.user) throw new HttpError(401, 'unauthorized');
  return req.user;
}

// Purge expired sessions occasionally.
setInterval(() => db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now()), 1000 * 60 * 60).unref();

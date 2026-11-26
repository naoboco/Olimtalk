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

export function createSession(userId: number): string {
  const token = crypto.randomBytes(32).toString('base64url');
  const t = now();
  db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?,?,?,?)').run(
    sha(token),
    userId,
    t,
    t + SESSION_TTL,
  );
  return token;
}

export function destroySession(token: string) {
  db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha(token));
}

export function userFromToken(token: string | undefined): UserRow | undefined {
  if (!token) return undefined;
  const row = db
    .prepare(
      `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > ? AND u.banned = 0`,
    )
    .get(sha(token), now()) as UserRow | undefined;
  return row;
}

export function tokenFromCookieHeader(header: string | undefined): string | undefined {
  if (!header) return undefined;
  return parseCookie(header)[COOKIE];
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
  req.user = userFromToken(tokenFromCookieHeader(req.headers.cookie));
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

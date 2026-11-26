import type { Request } from 'express';
import { z } from 'zod';
import { customAlphabet } from 'nanoid';

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message?: string,
  ) {
    super(message || code);
  }
}

export const bad = (code: string, status = 400) => new HttpError(status, code);

export const now = () => Date.now();

const codeAlphabet = customAlphabet('23456789abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ', 12);
export const inviteCode = () => codeAlphabet();

/** Parse `value` with a zod schema or throw a 400. */
export function parse<T extends z.ZodType>(schema: T, value: unknown): z.infer<T> {
  const r = schema.safeParse(value);
  if (!r.success) {
    const first = r.error.issues[0];
    throw new HttpError(400, 'invalid_input', `${first?.path.join('.') || 'input'}: ${first?.message}`);
  }
  return r.data;
}

export function intParam(req: Request, name: string): number {
  const v = Number(req.params[name]);
  if (!Number.isSafeInteger(v) || v <= 0) throw bad('invalid_id');
  return v;
}

export function intQuery(req: Request, name: string): number | undefined {
  const raw = req.query[name];
  if (raw === undefined || raw === '') return undefined;
  const v = Number(raw);
  if (!Number.isSafeInteger(v) || v < 0) throw bad('invalid_query');
  return v;
}

export function strQuery(req: Request, name: string, max = 100): string {
  const raw = req.query[name];
  return typeof raw === 'string' ? raw.trim().slice(0, max) : '';
}

/** Simple fixed-window in-memory rate limiter. Returns true when the call is allowed. */
export function rateLimiter(max: number, windowMs: number) {
  const hits = new Map<string, { n: number; reset: number }>();
  setInterval(() => {
    const t = now();
    for (const [k, v] of hits) if (v.reset < t) hits.delete(k);
  }, windowMs).unref();
  return (key: string | number): boolean => {
    const t = now();
    const k = String(key);
    const h = hits.get(k);
    if (!h || h.reset < t) {
      hits.set(k, { n: 1, reset: t + windowMs });
      return true;
    }
    h.n++;
    return h.n <= max;
  };
}

/** Escape a user string for use in a SQL LIKE pattern (with ESCAPE '\'). */
export function likeEscape(s: string): string {
  return s.replace(/[\\%_]/g, (c) => '\\' + c);
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export const zWorld = z.enum(['fr', 'ru', 'es', 'en']);
export const zProfile = z.enum(['student', 'entrepreneur', 'employee', 'medical', 'legal']);
export const zCategory = z.enum(['city', 'event', 'sport', 'profile', 'general']);
/** Uploaded file URL produced by our own /api/upload endpoint. */
export const zUploadUrl = z.string().regex(/^\/uploads\/[A-Za-z0-9_-]+\.[a-z0-9]{1,5}$/);

export const zAttachment = z.object({
  url: zUploadUrl,
  name: z.string().max(200),
  size: z.number().int().nonnegative(),
  mime: z.string().max(100),
  kind: z.enum(['image', 'video', 'audio', 'file']),
  width: z.number().int().positive().max(20000).optional(),
  height: z.number().int().positive().max(20000).optional(),
  duration: z.number().nonnegative().max(86400).optional(),
  voice: z.boolean().optional(),
});

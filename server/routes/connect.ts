// "Connexions": what a person plugs into OlimTalk — their calendar and their mailbox.
// (Their own AI needs nothing here: it is called straight from their device.)
//
//  - Calendar out: a private feed address (.ics) that Google Calendar, Outlook, Apple
//    Calendar or any other agenda can subscribe to, listing the events they attend.
//  - Calendar in: reading the private .ics address of their own agenda. The apps fetch it
//    directly; the website cannot (browsers forbid it), so it goes through /ics/fetch,
//    which keeps nothing.
//  - Mailbox: a private forwarding address. Whatever the provider (Gmail, Outlook, …),
//    a forwarded e-mail is sealed with the person's public key the moment it arrives.
import crypto from 'node:crypto';
import dns from 'node:dns';
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import path from 'node:path';
import express, { Router, type Request } from 'express';
import { simpleParser } from 'mailparser';
import { customAlphabet } from 'nanoid';
import { z } from 'zod';
import { seal, sealJson } from '../../shared/e2e.ts';
import { me, requireAuth } from '../auth.ts';
import { UPLOAD_DIR, db, type EventRow, type UserRow } from '../db.ts';
import { emitToUser } from '../realtime.ts';
import { HttpError, bad, configuredOrigin, intParam, intQuery, now, parse, rateLimiter } from '../util.ts';

export const router = Router();

const secretToken = customAlphabet('23456789abcdefghijkmnpqrstuvwxyz', 20);
const publicOrigin = (req: Request) => configuredOrigin() || `${req.protocol}://${req.get('host')}`;

// ───────────────────────── calendar feed (OlimTalk → any agenda) ─────────────────────────

const icsText = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const icsDate = (ts: number) => new Date(ts).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

/** RFC 5545: lines are at most 75 bytes; longer ones continue on the next line after a space. */
function fold(line: string): string {
  const out: string[] = [];
  let current = '';
  let bytes = 0;
  for (const ch of line) {
    const size = Buffer.byteLength(ch);
    if (bytes + size > (out.length ? 74 : 75)) {
      out.push(current);
      current = '';
      bytes = 0;
    }
    current += ch;
    bytes += size;
  }
  out.push(current);
  return out.join('\r\n ');
}

export function buildCalendar(user: UserRow, origin: string): string {
  const rows = db
    .prepare(
      `SELECT e.*, r.status AS rsvp, c.name AS chat_name, c.invite_code FROM events e
       JOIN event_rsvps r ON r.event_id = e.id AND r.user_id = ? AND r.status IN ('going','maybe')
       JOIN chats c ON c.id = e.chat_id
       WHERE e.starts_at > ?
         AND (c.private = 0 OR EXISTS (SELECT 1 FROM chat_members cm WHERE cm.chat_id = c.id AND cm.user_id = ?))
       ORDER BY e.starts_at LIMIT 500`,
    )
    .all(user.id, now() - 30 * 86_400_000, user.id) as (EventRow & { rsvp: string; chat_name: string; invite_code: string | null })[];
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//OlimTalk//Events//FR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:OlimTalk'];
  for (const e of rows) {
    const url = e.invite_code ? `${origin}/join/${e.invite_code}` : origin;
    lines.push(
      'BEGIN:VEVENT',
      `UID:event-${e.id}@olimtalk`,
      `DTSTAMP:${icsDate(e.created_at)}`,
      `DTSTART:${icsDate(e.starts_at)}`,
      `DTEND:${icsDate(e.ends_at ?? e.starts_at + 2 * 3_600_000)}`,
      `SUMMARY:${icsText(e.title)}`,
      `DESCRIPTION:${icsText([e.description, `${e.chat_name} · OlimTalk`, url].filter(Boolean).join('\n\n'))}`,
      ...(e.location ? [`LOCATION:${icsText(e.location)}`] : []),
      `URL:${url}`,
      `STATUS:${e.rsvp === 'going' ? 'CONFIRMED' : 'TENTATIVE'}`,
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

function calendarToken(user: UserRow, reset = false): string {
  if (user.cal_token && !reset) return user.cal_token;
  const token = secretToken();
  db.prepare('UPDATE users SET cal_token = ? WHERE id = ?').run(token, user.id);
  return token;
}

const feedUrl = (req: Request, token: string) => `${publicOrigin(req)}/api/cal/${token}.ics`;

router.get('/me/calendar-feed', requireAuth, (req, res) => {
  res.json({ url: feedUrl(req, calendarToken(me(req))) });
});

/** A new address: whoever had the old one stops receiving updates. */
router.post('/me/calendar-feed/reset', requireAuth, (req, res) => {
  res.json({ url: feedUrl(req, calendarToken(me(req), true)) });
});

// Public by design: calendar apps cannot log in. The long random token is the secret.
router.get('/cal/:file', (req, res) => {
  const match = /^([a-z0-9]{20})\.ics$/.exec(String(req.params.file));
  const user = match ? (db.prepare('SELECT * FROM users WHERE cal_token = ? AND banned = 0').get(match[1]) as UserRow | undefined) : undefined;
  if (!user) throw new HttpError(404, 'not_found');
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Cache-Control', 'private, max-age=300');
  res.send(buildCalendar(user, publicOrigin(req)));
});

// ───────────────────────── reading someone's own agenda (.ics address) ─────────────────────────

const ALLOW_PRIVATE = process.env.ICS_ALLOW_PRIVATE === '1'; // tests only
const blocked = new net.BlockList();
for (const [range, bits] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const)
  blocked.addSubnet(range, bits, 'ipv4');
for (const [range, bits] of [
  ['::', 127], // unspecified and loopback
  ['64:ff9b::', 96],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
] as const)
  blocked.addSubnet(range, bits, 'ipv6');

/** Loopback, private, link-local, carrier-grade NAT, multicast… and anything that is not an address. */
export function isPrivateAddress(address: string): boolean {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
  if (mapped) return blocked.check(mapped[1]!, 'ipv4');
  if (net.isIPv4(address)) return blocked.check(address, 'ipv4');
  if (net.isIPv6(address)) return blocked.check(address, 'ipv6');
  return true;
}

/** Never let this server be used to reach machines of its own network. */
export const isPublicAddress = (address: string) => ALLOW_PRIVATE || !isPrivateAddress(address);

// The check runs on the address actually used for the connection, not on an earlier lookup.
const guardedLookup: net.LookupFunction = (hostname, options, callback) => {
  dns.lookup(hostname, { ...(options as dns.LookupAllOptions), all: true }, (err, addresses) => {
    if (err) return callback(err, '', 4);
    const list = addresses as dns.LookupAddress[];
    if (!list.length || list.some((a) => !isPublicAddress(a.address))) {
      return callback(Object.assign(new Error('address not allowed'), { code: 'EBLOCKED' }), '', 4);
    }
    if ((options as dns.LookupAllOptions).all) (callback as unknown as (e: null, a: dns.LookupAddress[]) => void)(null, list);
    else callback(null, list[0]!.address, list[0]!.family);
  });
};

const MAX_ICS = 3 * 1024 * 1024;

function fetchText(target: URL, redirects = 0): Promise<string> {
  return new Promise((resolve, reject) => {
    if (target.protocol !== 'https:' && !(ALLOW_PRIVATE && target.protocol === 'http:')) return reject(bad('invalid_url'));
    if (net.isIP(target.hostname.replace(/^\[|\]$/g, '')) && !isPublicAddress(target.hostname.replace(/^\[|\]$/g, ''))) return reject(bad('invalid_url'));
    const client = target.protocol === 'https:' ? https : http;
    const req = client.get(
      target,
      { lookup: guardedLookup, timeout: 12_000, headers: { Accept: 'text/calendar, text/plain;q=0.8, */*;q=0.5', 'User-Agent': 'OlimTalk-Calendar/1.0' } },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume();
          if (redirects >= 3) return reject(bad('calendar_unreachable'));
          let next: URL;
          try {
            next = new URL(res.headers.location, target);
          } catch {
            return reject(bad('calendar_unreachable'));
          }
          return fetchText(next, redirects + 1).then(resolve, reject);
        }
        if (status !== 200) {
          res.resume();
          return reject(bad('calendar_unreachable'));
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_ICS) {
            req.destroy();
            reject(bad('calendar_too_large'));
          } else chunks.push(chunk);
        });
        res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        res.on('error', () => reject(bad('calendar_unreachable')));
      },
    );
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', () => reject(bad('calendar_unreachable')));
  });
}

const icsLimit = rateLimiter(60, 10 * 60_000);

router.post('/ics/fetch', requireAuth, async (req, res) => {
  if (!icsLimit(me(req).id)) throw new HttpError(429, 'too_many_requests');
  const body = parse(z.object({ url: z.string().trim().min(8).max(2000) }), req.body);
  let target: URL;
  try {
    target = new URL(body.url.replace(/^webcal:\/\//i, 'https://'));
  } catch {
    throw bad('invalid_url');
  }
  const text = await fetchText(target);
  if (!/^\uFEFF?\s*BEGIN:VCALENDAR/i.test(text)) throw bad('not_a_calendar');
  res.json({ ics: text });
});

// ───────────────────────── mailbox (forwarding address) ─────────────────────────

const MAIL_DOMAIN = (process.env.MAIL_DOMAIN || '').trim().toLowerCase();
const INBOUND_SECRET = process.env.INBOUND_MAIL_SECRET || '';
const MAX_MAIL = 10 * 1024 * 1024;
const MAX_ATTACHMENTS = 8 * 1024 * 1024;
const KEEP_EMAILS = 200;
const mailLimit = rateLimiter(60, 60 * 60_000);

export const mailEnabled = () => MAIL_DOMAIN !== '';

function mailToken(user: UserRow, reset = false): string {
  if (user.mail_token && !reset) return user.mail_token;
  const token = secretToken();
  db.prepare('UPDATE users SET mail_token = ? WHERE id = ?').run(token, user.id);
  return token;
}

const mailboxOf = (user: UserRow, reset = false) => ({
  enabled: mailEnabled(),
  address: mailEnabled() ? `${mailToken(user, reset)}@${MAIL_DOMAIN}` : null,
});

router.get('/me/mailbox', requireAuth, (req, res) => {
  res.json(mailboxOf(me(req)));
});

router.post('/me/mailbox/reset', requireAuth, (req, res) => {
  res.json(mailboxOf(me(req), true));
});

export function removeUploadFiles(urls: string[]) {
  for (const url of urls) {
    if (/^\/uploads\/[A-Za-z0-9_-]+\.[a-z0-9]{1,5}$/.test(url)) fs.rm(path.join(UPLOAD_DIR, path.basename(url)), { force: true }, () => undefined);
  }
}

export type IngestResult = 'stored' | 'unknown_recipient' | 'no_key' | 'too_large' | 'rate_limited' | 'disabled';

/** Does this address belong to someone? (Used to refuse unknown recipients early.) */
export function recipientOf(address: string): UserRow | undefined {
  const [local, domain] = address.trim().toLowerCase().split('@');
  if (!mailEnabled() || domain !== MAIL_DOMAIN || !local || !/^[a-z0-9]{20}$/.test(local)) return undefined;
  return db.prepare('SELECT * FROM users WHERE mail_token = ? AND banned = 0').get(local) as UserRow | undefined;
}

/**
 * Store one incoming e-mail for its recipient, sealed with their public key.
 * After this function returns, the server holds nothing it can read.
 */
export async function ingestEmail(recipient: string, raw: Buffer): Promise<IngestResult> {
  if (!mailEnabled()) return 'disabled';
  if (raw.length > MAX_MAIL) return 'too_large';
  const user = recipientOf(recipient);
  if (!user) return 'unknown_recipient';
  if (!user.e2e_public) return 'no_key';
  if (!mailLimit(user.id)) return 'rate_limited';

  const mail = await simpleParser(raw, { skipHtmlToText: false, skipTextToHtml: true, skipImageLinks: true });
  const from = mail.from?.value[0];
  const text = (mail.text || '').replace(/\n{3,}/g, '\n\n').trim();
  const sender = { name: from?.name || '', address: from?.address || '' };
  const date = (mail.date ?? new Date()).getTime();
  const subject = (mail.subject || '').slice(0, 500);

  let budget = MAX_ATTACHMENTS;
  const attachments = (mail.attachments ?? [])
    .filter((a) => !a.related) // skip inline images of the HTML version
    .slice(0, 20)
    .map((a) => {
      const keep = a.size <= budget;
      if (keep) budget -= a.size;
      return {
        name: (a.filename || 'fichier').slice(0, 200),
        mime: a.contentType || 'application/octet-stream',
        size: a.size,
        data: keep ? a.content.toString('base64') : null, // null: too large to keep
      };
    });

  const header = await sealJson(user.e2e_public, {
    from: sender,
    subject,
    date,
    snippet: text.slice(0, 180),
    attachments: attachments.length,
  });
  const body = await seal(user.e2e_public, Buffer.from(JSON.stringify({ from: sender, subject, date, text: text.slice(0, 400_000), attachments })));

  const name = `${crypto.randomBytes(16).toString('base64url')}.bin`;
  await fs.promises.writeFile(path.join(UPLOAD_DIR, name), body);
  const info = db
    .prepare('INSERT INTO emails (user_id, received_at, size, header, body) VALUES (?,?,?,?,?)')
    .run(user.id, now(), raw.length, header, `/uploads/${name}`);

  // Keep the mailbox bounded: the oldest e-mails beyond the limit are erased.
  const old = db.prepare('SELECT id, body FROM emails WHERE user_id = ? ORDER BY id DESC LIMIT -1 OFFSET ?').all(user.id, KEEP_EMAILS) as {
    id: number;
    body: string;
  }[];
  if (old.length) {
    db.prepare(`DELETE FROM emails WHERE id IN (${old.map(() => '?').join(',')})`).run(...old.map((o) => o.id));
    removeUploadFiles(old.map((o) => o.body));
  }
  emitToUser(user.id, 'mail:new', { id: Number(info.lastInsertRowid) });
  return 'stored';
}

interface EmailRow {
  id: number;
  received_at: number;
  size: number;
  header: string;
  body: string;
  read: number;
}

router.get('/mail', requireAuth, (req, res) => {
  const before = intQuery(req, 'before') ?? Number.MAX_SAFE_INTEGER;
  const rows = db
    .prepare('SELECT id, received_at, size, header, body, read FROM emails WHERE user_id = ? AND id < ? ORDER BY id DESC LIMIT 31')
    .all(me(req).id, before) as EmailRow[];
  const unread = (db.prepare('SELECT COUNT(*) n FROM emails WHERE user_id = ? AND read = 0').get(me(req).id) as { n: number }).n;
  res.json({
    emails: rows.slice(0, 30).map((r) => ({ id: r.id, receivedAt: r.received_at, size: r.size, header: r.header, body: r.body, read: !!r.read })),
    hasMore: rows.length > 30,
    unread,
  });
});

router.patch('/mail/:id', requireAuth, (req, res) => {
  const body = parse(z.object({ read: z.boolean() }), req.body);
  const info = db.prepare('UPDATE emails SET read = ? WHERE id = ? AND user_id = ?').run(+body.read, intParam(req, 'id'), me(req).id);
  if (!info.changes) throw new HttpError(404, 'not_found');
  res.json({ ok: true });
});

router.delete('/mail/:id', requireAuth, (req, res) => {
  const row = db.prepare('SELECT body FROM emails WHERE id = ? AND user_id = ?').get(intParam(req, 'id'), me(req).id) as { body: string } | undefined;
  if (!row) throw new HttpError(404, 'not_found');
  db.prepare('DELETE FROM emails WHERE id = ?').run(intParam(req, 'id'));
  removeUploadFiles([row.body]);
  res.json({ ok: true });
});

// Incoming e-mail over HTTP: for hosts that cannot receive SMTP directly. An e-mail
// service (Mailgun, SendGrid, a Cloudflare e-mail worker…) posts the raw message here.
router.post('/inbound/email', express.raw({ type: () => true, limit: MAX_MAIL }), async (req, res) => {
  const given = Buffer.from(String(req.get('x-inbound-secret') ?? ''));
  const expected = Buffer.from(INBOUND_SECRET);
  if (!INBOUND_SECRET || given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) throw new HttpError(404, 'not_found');
  const to = typeof req.query.to === 'string' ? req.query.to : '';
  if (!Buffer.isBuffer(req.body) || !req.body.length) throw bad('empty_message');
  const result = await ingestEmail(to, req.body);
  res.status(result === 'stored' ? 201 : result === 'unknown_recipient' ? 404 : result === 'too_large' ? 413 : 422).json({ result });
});

// Automatic translation.
//
//  - Group messages (public or private groups) are translated here, once per language, and the result is kept: the
//    next reader of that language gets it at no cost.
//  - Private messages are end-to-end encrypted, so this server cannot translate them by
//    itself. A person may choose to have the messages they receive translated anyway:
//    their device then sends the decrypted text to /translate/text, which keeps nothing.
import crypto from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import type { Lang } from '../../shared/types.ts';
import { me, requireAuth } from '../auth.ts';
import { assertCanRead, getChat } from '../core.ts';
import { db, type MessageRow } from '../db.ts';
import { TranslationError, translate, translationEnabled } from '../translate.ts';
import { bad, now, parse, rateLimiter, zWorld } from '../util.ts';

export const router = Router();

// Each new translation costs whoever runs the server: a ceiling per person and per hour.
const allowed = rateLimiter(Number(process.env.TRANSLATE_HOURLY_LIMIT) || 600, 3_600_000);

const hashOf = (text: string) => crypto.createHash('sha256').update(text).digest('base64url').slice(0, 32);

const cached = db.prepare('SELECT text, source_hash FROM translations WHERE message_id = ? AND lang = ?');
const store = db.prepare(
  `INSERT INTO translations (message_id, lang, source_hash, text, created_at) VALUES (?, ?, ?, ?, ?)
   ON CONFLICT(message_id, lang) DO UPDATE SET source_hash = excluded.source_hash, text = excluded.text, created_at = excluded.created_at`,
);
const current = db.prepare('SELECT text, deleted_at FROM messages WHERE id = ?');

// Two people opening the same conversation at the same moment share one translation.
const inFlight = new Map<string, Promise<string | null>>();

function translateMessage(row: MessageRow, lang: Lang, hash: string): Promise<string | null> {
  const key = `${row.id}:${lang}:${hash}`;
  let pending = inFlight.get(key);
  if (!pending) {
    pending = translate(row.text, lang)
      .then((text) => {
        // Keep it only if the message is still there and still says the same thing: a
        // message deleted or edited meanwhile must leave no translation behind.
        const latest = current.get(row.id) as { text: string; deleted_at: number | null } | undefined;
        if (latest && !latest.deleted_at && latest.text === row.text) store.run(row.id, lang, hash, text, now());
        return text;
      })
      .finally(() => inFlight.delete(key));
    inFlight.set(key, pending);
  }
  return pending;
}

/** Translations of public messages, by id. `text: null` means "no translation needed". */
router.post('/translate/messages', requireAuth, async (req, res) => {
  const user = me(req);
  if (!translationEnabled()) throw bad('translation_unavailable');
  const body = parse(z.object({ ids: z.array(z.number().int().positive()).min(1).max(40), lang: zWorld.optional() }), req.body);
  const lang = (body.lang ?? user.world) as Lang;
  const ids = [...new Set(body.ids)];
  const rows = db.prepare(`SELECT * FROM messages WHERE id IN (${ids.map(() => '?').join(',')})`).all(...ids) as MessageRow[];

  const readable = new Map<number, boolean>();
  const canRead = (chatId: number) => {
    let ok = readable.get(chatId);
    if (ok === undefined) {
      try {
        assertCanRead(getChat(chatId), user);
        ok = true;
      } catch {
        ok = false;
      }
      readable.set(chatId, ok);
    }
    return ok;
  };

  const translations: { id: number; text: string | null }[] = [];
  const failed: number[] = [];
  const jobs: Promise<void>[] = [];
  let limited = false;
  for (const row of rows) {
    // Private messages are ciphertext here: there is nothing this server could translate.
    if (row.deleted_at || row.enc || row.type === 'system' || !row.text.trim() || !canRead(row.chat_id)) continue;
    const hash = hashOf(row.text);
    const known = cached.get(row.id, lang) as { text: string | null; source_hash: string } | undefined;
    if (known && known.source_hash === hash) {
      translations.push({ id: row.id, text: known.text });
      continue;
    }
    if (!allowed(user.id)) {
      limited = true;
      continue;
    }
    jobs.push(
      translateMessage(row, lang, hash).then(
        (text) => void translations.push({ id: row.id, text }),
        (error) => {
          if (!(error instanceof TranslationError)) console.error('[olimtalk] translation:', error);
          failed.push(row.id);
        },
      ),
    );
  }
  await Promise.all(jobs);
  res.json({ translations, failed, limited });
});

/**
 * Translate a text the person's own device sends — how private messages get translated
 * for someone who asked for it. Nothing is stored or logged.
 */
router.post('/translate/text', requireAuth, async (req, res) => {
  const user = me(req);
  if (!translationEnabled()) throw bad('translation_unavailable');
  if (!user.translate_private) throw bad('private_translation_off', 403);
  const body = parse(z.object({ text: z.string().min(1).max(4000), lang: zWorld.optional() }), req.body);
  if (!allowed(user.id)) throw bad('too_many_requests', 429);
  try {
    res.json({ text: await translate(body.text, (body.lang ?? user.world) as Lang) });
  } catch (error) {
    if (!(error instanceof TranslationError)) console.error('[olimtalk] translation:', error);
    throw bad('translation_failed', 502);
  }
});

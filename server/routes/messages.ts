import { Router } from 'express';
import { z } from 'zod';
import type { MessagePatchEvent, MessageType, PollEvent, ReactionEvent } from '../../shared/types.ts';
import { me, requireAuth } from '../auth.ts';
import {
  assertCanRead,
  createMessage,
  eraseMessage,
  getChat,
  getMembership,
  isBlockedEitherWay,
  isChatAdmin,
  pollState,
  resolveMentions,
  serializeMessages,
  systemMessage,
} from '../core.ts';
import { db, qs, type ChatRow, type MessageRow, type UserRow } from '../db.ts';
import { emitToChat } from '../realtime.ts';
import { HttpError, bad, intParam, intQuery, likeEscape, now, parse, rateLimiter, strQuery, zAttachment } from '../util.ts';

export const router = Router();

const sendLimit = rateLimiter(30, 20_000);
const PAGE = 40;

function getMessage(id: number): MessageRow {
  const row = db.prepare('SELECT * FROM messages WHERE id = ?').get(id) as MessageRow | undefined;
  if (!row) throw new HttpError(404, 'message_not_found');
  return row;
}

/** Check that `user` may post in `chat` and return nothing; throws otherwise. */
export function assertCanSend(chat: ChatRow, user: UserRow) {
  const member = getMembership(chat.id, user.id);
  if (!member) throw new HttpError(403, 'not_a_member');
  if (chat.type === 'group' && chat.send_policy === 'admins' && !isChatAdmin(chat, user)) {
    throw new HttpError(403, 'admins_only');
  }
  if (chat.type === 'dm') {
    const peer = db.prepare('SELECT user_id FROM chat_members WHERE chat_id = ? AND user_id != ?').get(chat.id, user.id) as
      | { user_id: number }
      | undefined;
    if (peer && isBlockedEitherWay(user.id, peer.user_id)) throw new HttpError(403, 'blocked');
  }
  if (!sendLimit(user.id)) throw new HttpError(429, 'too_many_requests');
}

const notHidden = 'NOT EXISTS (SELECT 1 FROM hidden_messages h WHERE h.message_id = m.id AND h.user_id = ?)';

// ───────────── history ─────────────

router.get('/chats/:id/messages', requireAuth, (req, res) => {
  const user = me(req);
  const chat = getChat(intParam(req, 'id'));
  assertCanRead(chat, user);
  const before = intQuery(req, 'before');
  const after = intQuery(req, 'after');
  const around = intQuery(req, 'around');
  let rows: MessageRow[];
  let hasOlder = false;
  let hasNewer = false;
  const base = `SELECT m.* FROM messages m WHERE m.chat_id = ? AND ${notHidden}`;
  if (around) {
    const older = db.prepare(`${base} AND m.id <= ? ORDER BY m.id DESC LIMIT ?`).all(chat.id, user.id, around, PAGE / 2 + 1) as MessageRow[];
    const newer = db.prepare(`${base} AND m.id > ? ORDER BY m.id ASC LIMIT ?`).all(chat.id, user.id, around, PAGE / 2 + 1) as MessageRow[];
    hasOlder = older.length > PAGE / 2;
    hasNewer = newer.length > PAGE / 2;
    rows = [...older.slice(0, PAGE / 2).reverse(), ...newer.slice(0, PAGE / 2)];
  } else if (after) {
    const newer = db.prepare(`${base} AND m.id > ? ORDER BY m.id ASC LIMIT ?`).all(chat.id, user.id, after, PAGE + 1) as MessageRow[];
    hasNewer = newer.length > PAGE;
    hasOlder = true;
    rows = newer.slice(0, PAGE);
  } else {
    const older = db
      .prepare(`${base} AND m.id < ? ORDER BY m.id DESC LIMIT ?`)
      .all(chat.id, user.id, before ?? Number.MAX_SAFE_INTEGER, PAGE + 1) as MessageRow[];
    hasOlder = older.length > PAGE;
    hasNewer = false;
    rows = older.slice(0, PAGE).reverse();
  }
  res.json({ messages: serializeMessages(rows, user.id), hasOlder, hasNewer });
});

router.get('/chats/:id/pins', requireAuth, (req, res) => {
  const user = me(req);
  const chat = getChat(intParam(req, 'id'));
  assertCanRead(chat, user);
  const rows = db
    .prepare('SELECT * FROM messages WHERE chat_id = ? AND pinned_at IS NOT NULL AND deleted_at IS NULL ORDER BY pinned_at DESC LIMIT 50')
    .all(chat.id) as MessageRow[];
  res.json({ messages: serializeMessages(rows, user.id) });
});

router.get('/chats/:id/search', requireAuth, (req, res) => {
  const user = me(req);
  const chat = getChat(intParam(req, 'id'));
  assertCanRead(chat, user);
  const q = strQuery(req, 'q', 80);
  if (q.length < 2) return res.json({ messages: [] });
  const rows = db
    .prepare(
      `SELECT m.* FROM messages m WHERE m.chat_id = ? AND m.deleted_at IS NULL AND m.type != 'system'
       AND m.text LIKE ? ESCAPE '\\' AND ${notHidden} ORDER BY m.id DESC LIMIT 40`,
    )
    .all(chat.id, `%${likeEscape(q)}%`, user.id) as MessageRow[];
  res.json({ messages: serializeMessages(rows, user.id) });
});

router.get('/chats/:id/media', requireAuth, (req, res) => {
  const user = me(req);
  const chat = getChat(intParam(req, 'id'));
  assertCanRead(chat, user);
  const rows = db
    .prepare(
      `SELECT m.* FROM messages m WHERE m.chat_id = ? AND m.deleted_at IS NULL AND m.type IN ('image','video','file')
       AND ${notHidden} ORDER BY m.id DESC LIMIT 60`,
    )
    .all(chat.id, user.id) as MessageRow[];
  res.json({ messages: serializeMessages(rows, user.id) });
});

router.get('/starred', requireAuth, (req, res) => {
  const user = me(req);
  const rows = db
    .prepare(
      `SELECT m.* FROM stars s JOIN messages m ON m.id = s.message_id
       WHERE s.user_id = ? AND m.deleted_at IS NULL ORDER BY s.created_at DESC LIMIT 100`,
    )
    .all(user.id) as MessageRow[];
  const chatIds = [...new Set(rows.map((r) => r.chat_id))];
  const chats = chatIds.length
    ? (db.prepare(`SELECT id, name, emoji, type FROM chats WHERE id IN (${qs(chatIds.length)})`).all(...chatIds) as {
        id: number;
        name: string;
        emoji: string;
        type: string;
      }[])
    : [];
  res.json({ messages: serializeMessages(rows, user.id), chats });
});

// ───────────── send ─────────────

/** Ciphertext produced on the sender's device. Opaque to the server. */
const zEnc = z.string().min(20).max(60_000);

const zSend = z.object({
  enc: zEnc.optional(),
  forwarded: z.boolean().optional(),
  text: z.string().max(8000).default(''),
  attachment: zAttachment.nullable().optional(),
  replyToId: z.number().int().positive().nullable().optional(),
  poll: z
    .object({
      question: z.string().trim().min(1).max(300),
      options: z.array(z.string().trim().min(1).max(120)).min(2).max(12),
      multiple: z.boolean().default(false),
    })
    .optional(),
});

router.post('/chats/:id/messages', requireAuth, (req, res) => {
  const user = me(req);
  const chat = getChat(intParam(req, 'id'));
  assertCanSend(chat, user);
  const body = parse(zSend, req.body);
  const text = body.text.trim();
  if (chat.type === 'dm') {
    // Private conversations are end-to-end encrypted: the server refuses to store plaintext.
    if (!body.enc || text || body.poll) throw bad('encryption_required');
    // A file can only be an opaque encrypted blob; its real name and type are inside the ciphertext.
    if (body.attachment && body.attachment.mime !== 'application/octet-stream') throw bad('encryption_required');
  } else if (body.enc) {
    // Groups are public: hidden content has no place there.
    throw bad('invalid_input');
  }
  if (!text && !body.attachment && !body.poll && !body.enc) throw bad('empty_message');
  if (body.replyToId) {
    const target = getMessage(body.replyToId);
    if (target.chat_id !== chat.id) throw bad('invalid_reply');
  }
  let type: MessageType = 'text';
  if (body.poll) type = 'poll';
  else if (body.attachment && !body.enc) type = body.attachment.kind;
  const mentions = text ? resolveMentions(chat.id, text) : [];
  const message = createMessage({
    chat,
    userId: user.id,
    type,
    text,
    attachment: body.poll ? null : (body.attachment ?? null),
    replyToId: body.replyToId ?? null,
    forwarded: !!body.forwarded,
    enc: body.enc ?? null,
    meta: { ...(body.poll ? { poll: body.poll } : {}), ...(mentions.length ? { mentions } : {}) },
  });
  res.status(201).json({ message });
});

// ───────────── edit / delete ─────────────

router.patch('/messages/:id', requireAuth, (req, res) => {
  const user = me(req);
  const row = getMessage(intParam(req, 'id'));
  if (row.user_id !== user.id || row.deleted_at) throw new HttpError(403, 'forbidden');
  if (row.type === 'poll' || row.type === 'event' || row.type === 'system') throw bad('not_editable');
  if (row.enc) {
    // An encrypted message is replaced by a new ciphertext written on the author's device.
    const { enc } = parse(z.object({ enc: zEnc }), req.body);
    const t = now();
    db.prepare('UPDATE messages SET enc = ?, edited_at = ? WHERE id = ?').run(enc, t, row.id);
    const patch: MessagePatchEvent = { chatId: row.chat_id, id: row.id, patch: { enc, editedAt: t } };
    emitToChat(row.chat_id, 'message:patch', patch);
    res.json({ ok: true });
    return;
  }
  const body = parse(z.object({ text: z.string().trim().max(8000) }), req.body);
  if (!body.text && !row.attachment) throw bad('empty_message');
  const t = now();
  const meta = row.meta ? (JSON.parse(row.meta) as Record<string, unknown>) : {};
  const mentions = resolveMentions(row.chat_id, body.text);
  if (mentions.length) meta.mentions = mentions;
  else delete meta.mentions;
  db.prepare('UPDATE messages SET text = ?, edited_at = ?, meta = ? WHERE id = ?').run(
    body.text,
    t,
    Object.keys(meta).length ? JSON.stringify(meta) : null,
    row.id,
  );
  db.prepare('DELETE FROM translations WHERE message_id = ?').run(row.id);
  const patch: MessagePatchEvent = { chatId: row.chat_id, id: row.id, patch: { text: body.text, editedAt: t, mentions } };
  emitToChat(row.chat_id, 'message:patch', patch);
  res.json({ ok: true });
});

router.delete('/messages/:id', requireAuth, (req, res) => {
  const user = me(req);
  const row = getMessage(intParam(req, 'id'));
  const chat = getChat(row.chat_id);
  assertCanRead(chat, user);
  const scope = strQuery(req, 'scope') === 'all' ? 'all' : 'me';
  if (scope === 'me') {
    db.prepare('INSERT OR IGNORE INTO hidden_messages (user_id, message_id) VALUES (?,?)').run(user.id, row.id);
    return res.json({ ok: true });
  }
  if (row.user_id !== user.id && !isChatAdmin(chat, user)) throw new HttpError(403, 'forbidden');
  if (row.type === 'system') throw bad('invalid_target');
  eraseMessage(row);
  if (row.type === 'event') db.prepare('DELETE FROM events WHERE message_id = ?').run(row.id);
  const patch: MessagePatchEvent = {
    chatId: row.chat_id,
    id: row.id,
    patch: { deleted: true, text: '', attachment: null, pinnedAt: null },
  };
  emitToChat(row.chat_id, 'message:patch', patch);
  res.json({ ok: true });
});

// ───────────── reactions, pins, stars ─────────────

router.post('/messages/:id/react', requireAuth, (req, res) => {
  const user = me(req);
  const row = getMessage(intParam(req, 'id'));
  const chat = getChat(row.chat_id);
  if (!getMembership(chat.id, user.id)) throw new HttpError(403, 'not_a_member');
  if (row.deleted_at || row.type === 'system') throw bad('invalid_target');
  const body = parse(z.object({ emoji: z.string().min(1).max(16).nullable() }), req.body);
  if (body.emoji) {
    db.prepare(
      `INSERT INTO reactions (message_id, user_id, emoji, created_at) VALUES (?,?,?,?)
       ON CONFLICT (message_id, user_id) DO UPDATE SET emoji = excluded.emoji, created_at = excluded.created_at`,
    ).run(row.id, user.id, body.emoji, now());
  } else {
    db.prepare('DELETE FROM reactions WHERE message_id = ? AND user_id = ?').run(row.id, user.id);
  }
  const reactions = db
    .prepare('SELECT emoji, COUNT(*) count FROM reactions WHERE message_id = ? GROUP BY emoji ORDER BY count DESC, MIN(created_at)')
    .all(row.id) as { emoji: string; count: number }[];
  const event: ReactionEvent = { chatId: chat.id, id: row.id, userId: user.id, emoji: body.emoji, reactions };
  emitToChat(chat.id, 'message:reaction', event);
  res.json({ ok: true });
});

router.post('/messages/:id/pin', requireAuth, (req, res) => {
  const user = me(req);
  const row = getMessage(intParam(req, 'id'));
  const chat = getChat(row.chat_id);
  if (!getMembership(chat.id, user.id) && !user.is_admin) throw new HttpError(403, 'not_a_member');
  if (chat.type === 'group' && chat.pin_policy === 'admins' && !isChatAdmin(chat, user)) throw new HttpError(403, 'admins_only');
  if (row.deleted_at || row.type === 'system') throw bad('invalid_target');
  const body = parse(z.object({ pinned: z.boolean() }), req.body);
  const t = body.pinned ? now() : null;
  db.prepare('UPDATE messages SET pinned_at = ?, pinned_by = ? WHERE id = ?').run(t, body.pinned ? user.id : null, row.id);
  const patch: MessagePatchEvent = { chatId: chat.id, id: row.id, patch: { pinnedAt: t } };
  emitToChat(chat.id, 'message:patch', patch);
  if (body.pinned) systemMessage(chat, user.id, { kind: 'pinned', actor: user.name });
  res.json({ ok: true });
});

router.post('/messages/:id/star', requireAuth, (req, res) => {
  const user = me(req);
  const row = getMessage(intParam(req, 'id'));
  assertCanRead(getChat(row.chat_id), user);
  const body = parse(z.object({ starred: z.boolean() }), req.body);
  if (body.starred) db.prepare('INSERT OR IGNORE INTO stars (user_id, message_id, created_at) VALUES (?,?,?)').run(user.id, row.id, now());
  else db.prepare('DELETE FROM stars WHERE user_id = ? AND message_id = ?').run(user.id, row.id);
  res.json({ ok: true });
});

// ───────────── forward ─────────────

router.post('/messages/:id/forward', requireAuth, (req, res) => {
  const user = me(req);
  const row = getMessage(intParam(req, 'id'));
  assertCanRead(getChat(row.chat_id), user);
  if (row.deleted_at || row.type === 'poll' || row.type === 'event' || row.type === 'system') throw bad('not_forwardable');
  // The server cannot read an encrypted message, nor write into an encrypted conversation:
  // in both cases the sender's device decrypts / re-encrypts and sends it itself.
  if (row.enc) throw bad('encryption_required');
  const body = parse(z.object({ chatIds: z.array(z.number().int().positive()).min(1).max(10) }), req.body);
  const sent: number[] = [];
  for (const chatId of [...new Set(body.chatIds)]) {
    const target = getChat(chatId);
    if (target.type === 'dm') throw bad('encryption_required');
    assertCanSend(target, user);
    createMessage({
      chat: target,
      userId: user.id,
      type: row.type as MessageType,
      text: row.text,
      attachment: row.attachment ? JSON.parse(row.attachment) : null,
      forwarded: true,
    });
    sent.push(chatId);
  }
  res.json({ sent });
});

// ───────────── polls ─────────────

router.post('/messages/:id/vote', requireAuth, (req, res) => {
  const user = me(req);
  const row = getMessage(intParam(req, 'id'));
  const chat = getChat(row.chat_id);
  if (!getMembership(chat.id, user.id)) throw new HttpError(403, 'not_a_member');
  if (row.type !== 'poll' || row.deleted_at || !row.meta) throw bad('invalid_target');
  const poll = (JSON.parse(row.meta) as { poll: { options: string[]; multiple: boolean } }).poll;
  const body = parse(z.object({ options: z.array(z.number().int().nonnegative()).max(12) }), req.body);
  const options = [...new Set(body.options)].filter((i) => i < poll.options.length);
  if (!poll.multiple && options.length > 1) throw bad('single_choice');
  db.transaction(() => {
    db.prepare('DELETE FROM poll_votes WHERE message_id = ? AND user_id = ?').run(row.id, user.id);
    const insert = db.prepare('INSERT INTO poll_votes (message_id, user_id, option_idx) VALUES (?,?,?)');
    for (const i of options) insert.run(row.id, user.id, i);
  })();
  const state = pollState(row.id, poll.options.length, null);
  const event: PollEvent = { chatId: chat.id, id: row.id, userId: user.id, votes: options, counts: state.counts, voters: state.voters };
  emitToChat(chat.id, 'message:poll', event);
  res.json({ ok: true });
});

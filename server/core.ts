// Domain logic shared by the route handlers: serialisation, membership, posting.
import type {
  Attachment,
  Chat,
  Community,
  EventData,
  Me,
  Message,
  MessagePreview,
  MessageRef,
  MessageType,
  PollData,
  Role,
  Story,
  SystemInfo,
  UserPublic,
  World,
} from '../shared/types.ts';
import fs from 'node:fs';
import path from 'node:path';
import {
  UPLOAD_DIR,
  db,
  qs,
  type ChatRow,
  type CommunityRow,
  type EventRow,
  type MemberRow,
  type MessageRow,
  type StoryRow,
  type UserRow,
} from './db.ts';
import { emitToChat, isOnline, subscribe, unsubscribe } from './realtime.ts';
import { HttpError, likeEscape, now } from './util.ts';

// ───────────────────────── users ─────────────────────────

export function toUserPublic(u: UserRow): UserPublic {
  return {
    id: u.id,
    name: u.name,
    username: u.username,
    avatar: u.avatar,
    bio: u.bio,
    profile: (u.profile as UserPublic['profile']) ?? null,
    city: u.city,
    world: u.world as World,
    aliyahYear: u.aliyah_year,
    // People can choose not to show when they are or were online.
    lastSeen: u.hide_presence ? 0 : u.last_seen,
    online: u.hide_presence ? false : isOnline(u.id),
    isSystem: !!u.is_system,
    publicKey: u.e2e_public,
  };
}

export function toMe(u: UserRow): Me {
  const blocked = (db.prepare('SELECT blocked_id FROM blocks WHERE user_id = ?').all(u.id) as { blocked_id: number }[]).map(
    (r) => r.blocked_id,
  );
  return {
    ...toUserPublic(u),
    lastSeen: u.last_seen,
    online: true,
    email: u.email,
    isAdmin: !!u.is_admin,
    blocked,
    hidePresence: !!u.hide_presence,
    noReceipts: !!u.no_receipts,
  };
}

export function getUser(id: number): UserRow | undefined {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
}

function usersById(ids: number[]): Map<number, UserRow> {
  const map = new Map<number, UserRow>();
  const unique = [...new Set(ids)];
  if (!unique.length) return map;
  const rows = db.prepare(`SELECT * FROM users WHERE id IN (${qs(unique.length)})`).all(...unique) as UserRow[];
  for (const r of rows) map.set(r.id, r);
  return map;
}

export function isBlockedEitherWay(a: number, b: number): boolean {
  return !!db
    .prepare('SELECT 1 FROM blocks WHERE (user_id = ? AND blocked_id = ?) OR (user_id = ? AND blocked_id = ?)')
    .get(a, b, b, a);
}

// ───────────────────────── messages ─────────────────────────

function parseJson<T>(s: string | null): T | null {
  if (!s) return null;
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

interface Meta {
  poll?: { question: string; options: string[]; multiple: boolean };
  eventId?: number;
  system?: SystemInfo;
  mentions?: number[];
}

export function toEventData(rows: EventRow[], viewerId: number | null): Map<number, EventData> {
  const out = new Map<number, EventData>();
  if (!rows.length) return out;
  const ids = rows.map((r) => r.id);
  const counts = db
    .prepare(`SELECT event_id, status, COUNT(*) n FROM event_rsvps WHERE event_id IN (${qs(ids.length)}) GROUP BY event_id, status`)
    .all(...ids) as { event_id: number; status: string; n: number }[];
  const mine = viewerId
    ? (db
        .prepare(`SELECT event_id, status FROM event_rsvps WHERE user_id = ? AND event_id IN (${qs(ids.length)})`)
        .all(viewerId, ...ids) as { event_id: number; status: string }[])
    : [];
  const chatIds = [...new Set(rows.map((r) => r.chat_id))];
  const chats = db
    .prepare(`SELECT id, name, emoji, invite_code FROM chats WHERE id IN (${qs(chatIds.length)})`)
    .all(...chatIds) as { id: number; name: string; emoji: string; invite_code: string | null }[];
  for (const r of rows) {
    const chat = chats.find((c) => c.id === r.chat_id);
    out.set(r.id, {
      id: r.id,
      chatId: r.chat_id,
      chatName: chat?.name ?? '',
      chatEmoji: chat?.emoji ?? '🎉',
      inviteCode: chat?.invite_code ?? null,
      world: (r.world ?? 'fr') as World,
      title: r.title,
      description: r.description,
      location: r.location,
      startsAt: r.starts_at,
      endsAt: r.ends_at,
      going: counts.find((c) => c.event_id === r.id && c.status === 'going')?.n ?? 0,
      maybe: counts.find((c) => c.event_id === r.id && c.status === 'maybe')?.n ?? 0,
      myStatus: (mine.find((m) => m.event_id === r.id)?.status as EventData['myStatus']) ?? null,
      createdBy: r.created_by,
    });
  }
  return out;
}

export function pollState(messageId: number, optionCount: number, viewerId: number | null) {
  const rows = db
    .prepare('SELECT option_idx, COUNT(*) n FROM poll_votes WHERE message_id = ? GROUP BY option_idx')
    .all(messageId) as { option_idx: number; n: number }[];
  const counts = Array.from({ length: optionCount }, (_, i) => rows.find((r) => r.option_idx === i)?.n ?? 0);
  const voters = (
    db.prepare('SELECT COUNT(DISTINCT user_id) n FROM poll_votes WHERE message_id = ?').get(messageId) as { n: number }
  ).n;
  const myVotes = viewerId
    ? (
        db.prepare('SELECT option_idx FROM poll_votes WHERE message_id = ? AND user_id = ?').all(messageId, viewerId) as {
          option_idx: number;
        }[]
      ).map((r) => r.option_idx)
    : [];
  return { counts, voters, myVotes };
}

/**
 * Serialise message rows. With `viewerId = null` the output is viewer-neutral
 * (used for realtime broadcasts): `mine`, `starred` and `myVotes` are empty.
 */
export function serializeMessages(rows: MessageRow[], viewerId: number | null): Message[] {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const replyIds = rows.map((r) => r.reply_to_id).filter((x): x is number => !!x);
  const replies = replyIds.length
    ? (db.prepare(`SELECT * FROM messages WHERE id IN (${qs(replyIds.length)})`).all(...replyIds) as MessageRow[])
    : [];
  const users = usersById([...rows.map((r) => r.user_id), ...replies.map((r) => r.user_id)]);

  const reactionRows = db
    .prepare(
      `SELECT message_id, emoji, COUNT(*) n, MAX(user_id = ?) mine FROM reactions
       WHERE message_id IN (${qs(ids.length)}) GROUP BY message_id, emoji ORDER BY n DESC, MIN(created_at)`,
    )
    .all(viewerId ?? 0, ...ids) as { message_id: number; emoji: string; n: number; mine: number }[];

  const starred = new Set<number>(
    viewerId
      ? (
          db.prepare(`SELECT message_id FROM stars WHERE user_id = ? AND message_id IN (${qs(ids.length)})`).all(viewerId, ...ids) as {
            message_id: number;
          }[]
        ).map((r) => r.message_id)
      : [],
  );

  const metas = new Map<number, Meta>();
  const eventIds: number[] = [];
  for (const r of rows) {
    const meta = parseJson<Meta>(r.meta) ?? {};
    metas.set(r.id, meta);
    if (meta.eventId) eventIds.push(meta.eventId);
  }
  const events = eventIds.length
    ? toEventData(db.prepare(`SELECT * FROM events WHERE id IN (${qs(eventIds.length)})`).all(...eventIds) as EventRow[], viewerId)
    : new Map<number, EventData>();

  return rows.map((r) => {
    const u = users.get(r.user_id);
    const meta = metas.get(r.id)!;
    const deleted = !!r.deleted_at;
    const reply = r.reply_to_id ? replies.find((x) => x.id === r.reply_to_id) : undefined;
    const msg: Message = {
      id: r.id,
      chatId: r.chat_id,
      userId: r.user_id,
      user: {
        id: r.user_id,
        name: u?.name ?? '—',
        username: u?.username ?? '',
        avatar: u?.avatar ?? null,
        isSystem: !!u?.is_system,
      },
      type: r.type as MessageType,
      text: deleted ? '' : r.text,
      attachment: deleted ? null : parseJson<Attachment>(r.attachment),
      replyTo: reply && !deleted ? toRef(reply, users.get(reply.user_id)) : null,
      forwarded: !!r.forwarded,
      editedAt: r.edited_at,
      deleted,
      createdAt: r.created_at,
      pinnedAt: deleted ? null : r.pinned_at,
      reactions: deleted
        ? []
        : reactionRows.filter((x) => x.message_id === r.id).map((x) => ({ emoji: x.emoji, count: x.n, mine: !!x.mine })),
      starred: starred.has(r.id),
      mentions: meta.mentions ?? [],
      enc: deleted ? null : r.enc,
    };
    if (!deleted && r.type === 'poll' && meta.poll) {
      const poll: PollData = { ...meta.poll, ...pollState(r.id, meta.poll.options.length, viewerId) };
      msg.poll = poll;
    }
    if (!deleted && r.type === 'event' && meta.eventId) {
      const ev = events.get(meta.eventId);
      if (ev) msg.event = ev;
    }
    if (r.type === 'system' && meta.system) msg.system = meta.system;
    return msg;
  });
}

/** Previews carry the ciphertext of short encrypted messages so the reader's device can decrypt them. */
const previewEnc = (r: MessageRow) => (r.enc && !r.deleted_at && r.enc.length <= 6000 ? r.enc : null);

function toRef(r: MessageRow, u: UserRow | undefined): MessageRef {
  const deleted = !!r.deleted_at;
  return {
    id: r.id,
    userId: r.user_id,
    userName: u?.name ?? '—',
    type: r.type as MessageType,
    text: deleted ? '' : previewText(r),
    deleted,
    enc: previewEnc(r),
    encrypted: !!r.enc,
  };
}

function previewText(r: MessageRow): string {
  if (r.enc) return '';
  if (r.type === 'poll') return parseJson<Meta>(r.meta)?.poll?.question ?? '';
  if (r.type === 'event') return r.text;
  if (r.text) return r.text.slice(0, 160);
  return parseJson<Attachment>(r.attachment)?.name ?? '';
}

function toPreview(r: MessageRow & { user_name: string }): MessagePreview {
  const deleted = !!r.deleted_at;
  const p: MessagePreview = {
    id: r.id,
    userId: r.user_id,
    userName: r.user_name,
    type: r.type as MessageType,
    text: deleted ? '' : previewText(r),
    deleted,
    createdAt: r.created_at,
    enc: previewEnc(r),
    encrypted: !!r.enc,
  };
  if (r.type === 'system') p.system = parseJson<Meta>(r.meta)?.system;
  return p;
}

// ───────────────────────── chats ─────────────────────────

export function getChat(id: number): ChatRow {
  const chat = db.prepare('SELECT * FROM chats WHERE id = ?').get(id) as ChatRow | undefined;
  if (!chat) throw new HttpError(404, 'chat_not_found');
  return chat;
}

export function getMembership(chatId: number, userId: number): MemberRow | undefined {
  return db.prepare('SELECT * FROM chat_members WHERE chat_id = ? AND user_id = ?').get(chatId, userId) as MemberRow | undefined;
}

/** Platform admins act as admins in every group. */
export function effectiveRole(member: MemberRow | undefined, user: UserRow): Role | null {
  if (user.is_admin) return member?.role === 'owner' ? 'owner' : 'admin';
  return member?.role ?? null;
}

export function isChatAdmin(chat: ChatRow, user: UserRow): boolean {
  if (chat.type === 'dm') return false;
  const role = effectiveRole(getMembership(chat.id, user.id), user);
  return role === 'owner' || role === 'admin';
}

/** DMs are private: only their two members may read them. Groups are public. */
export function assertCanRead(chat: ChatRow, user: UserRow): MemberRow | undefined {
  const member = getMembership(chat.id, user.id);
  if (chat.type === 'dm' && !member) throw new HttpError(403, 'forbidden');
  return member;
}

/** Serialise chats for a viewer (membership flags, unread count, last message, DM peer). */
export function serializeChats(chats: ChatRow[], viewer: UserRow | null): Chat[] {
  if (!chats.length) return [];
  const ids = chats.map((c) => c.id);
  const members = new Map<number, MemberRow>();
  if (viewer) {
    const rows = db
      .prepare(`SELECT * FROM chat_members WHERE user_id = ? AND chat_id IN (${qs(ids.length)})`)
      .all(viewer.id, ...ids) as MemberRow[];
    for (const r of rows) members.set(r.chat_id, r);
  }

  const lastIds = chats.map((c) => c.last_message_id).filter((x): x is number => !!x);
  const lastRows = lastIds.length
    ? (db
        .prepare(
          `SELECT m.*, u.name AS user_name FROM messages m JOIN users u ON u.id = m.user_id WHERE m.id IN (${qs(lastIds.length)})`,
        )
        .all(...lastIds) as (MessageRow & { user_name: string })[])
    : [];

  const communityIds = [...new Set(chats.map((c) => c.community_id).filter((x): x is number => !!x))];
  const communities = communityIds.length
    ? (db.prepare(`SELECT id, name FROM communities WHERE id IN (${qs(communityIds.length)})`).all(...communityIds) as {
        id: number;
        name: string;
      }[])
    : [];

  // DM peers
  const dmIds = chats.filter((c) => c.type === 'dm').map((c) => c.id);
  const peers = new Map<number, { user: UserRow; lastRead: number }>();
  if (viewer && dmIds.length) {
    const rows = db
      .prepare(
        `SELECT m.chat_id, m.last_read_id, u.* FROM chat_members m JOIN users u ON u.id = m.user_id
         WHERE m.chat_id IN (${qs(dmIds.length)}) AND m.user_id != ?`,
      )
      .all(...dmIds, viewer.id) as (UserRow & { chat_id: number; last_read_id: number })[];
    for (const r of rows) peers.set(r.chat_id, { user: r, lastRead: r.last_read_id });
  }

  const unreadStmt = db.prepare(
    `SELECT COUNT(*) n FROM (SELECT 1 FROM messages WHERE chat_id = ? AND id > ? AND user_id != ?
       AND deleted_at IS NULL AND type != 'system' LIMIT 999)`,
  );

  return chats.map((c) => {
    const m = members.get(c.id);
    const last = lastRows.find((r) => r.id === c.last_message_id);
    const peer = peers.get(c.id);
    const chat: Chat = {
      id: c.id,
      type: c.type,
      world: c.world as World | null,
      name: c.type === 'dm' ? (peer?.user.name ?? '') : c.name,
      description: c.description,
      emoji: c.emoji,
      avatar: c.type === 'dm' ? (peer?.user.avatar ?? null) : c.avatar,
      category: c.category as Chat['category'],
      city: c.city,
      profile: c.profile as Chat['profile'],
      communityId: c.community_id,
      communityName: communities.find((x) => x.id === c.community_id)?.name ?? null,
      isAnnouncement: !!c.is_announcement,
      inviteCode: c.invite_code,
      memberCount: c.member_count,
      sendPolicy: c.send_policy,
      pinPolicy: c.pin_policy,
      createdAt: c.created_at,
      lastActivity: c.last_activity,
      isMember: !!m,
      role: viewer ? effectiveRole(m, viewer) : null,
      muted: !!m?.muted,
      pinned: !!m?.pinned,
      archived: !!m?.archived,
      unread: m && viewer ? (unreadStmt.get(c.id, m.last_read_id, viewer.id) as { n: number }).n : 0,
      lastReadId: m?.last_read_id ?? 0,
      lastMessage: last ? toPreview(last) : null,
    };
    if (c.type === 'dm' && peer) {
      chat.peer = toUserPublic(peer.user);
      // Someone who turned read receipts off does not reveal what they have read.
      chat.peerLastReadId = peer.user.no_receipts ? 0 : peer.lastRead;
    }
    return chat;
  });
}

export function serializeChat(chat: ChatRow, viewer: UserRow | null): Chat {
  return serializeChats([chat], viewer)[0]!;
}

/** Add a user to a chat. Returns true when the user was not yet a member. */
export function joinChat(chat: ChatRow, userId: number, role: Role = 'member'): boolean {
  const info = db
    .prepare('INSERT OR IGNORE INTO chat_members (chat_id, user_id, role, joined_at, last_read_id) VALUES (?,?,?,?,?)')
    .run(chat.id, userId, role, now(), chat.last_message_id ?? 0);
  if (!info.changes) return false;
  db.prepare('UPDATE chats SET member_count = member_count + 1 WHERE id = ?').run(chat.id);
  subscribe(userId, chat.id);
  // Like any messenger with communities: members of a group also get the community's announcements.
  if (chat.community_id) joinCommunity(chat.community_id, userId);
  if (chat.type === 'group') emitToChat(chat.id, 'chat:members', { chatId: chat.id, memberCount: chat.member_count + 1 });
  return true;
}

export function leaveChat(chat: ChatRow, userId: number): boolean {
  const info = db.prepare('DELETE FROM chat_members WHERE chat_id = ? AND user_id = ?').run(chat.id, userId);
  if (!info.changes) return false;
  db.prepare('UPDATE chats SET member_count = MAX(member_count - 1, 0) WHERE id = ?').run(chat.id);
  unsubscribe(userId, chat.id);
  emitToChat(chat.id, 'chat:members', { chatId: chat.id, memberCount: Math.max(chat.member_count - 1, 0) });
  return true;
}

// ───────────────────────── communities ─────────────────────────

export function getCommunity(id: number): CommunityRow {
  const c = db.prepare('SELECT * FROM communities WHERE id = ?').get(id) as CommunityRow | undefined;
  if (!c) throw new HttpError(404, 'community_not_found');
  return c;
}

export function communityRole(communityId: number, user: UserRow): Role | null {
  const row = db.prepare('SELECT role FROM community_members WHERE community_id = ? AND user_id = ?').get(communityId, user.id) as
    | { role: Role }
    | undefined;
  if (user.is_admin) return row?.role === 'owner' ? 'owner' : 'admin';
  return row?.role ?? null;
}

function joinCommunityOnly(communityId: number, userId: number, role: Role = 'member'): boolean {
  const info = db
    .prepare('INSERT OR IGNORE INTO community_members (community_id, user_id, role, joined_at) VALUES (?,?,?,?)')
    .run(communityId, userId, role, now());
  if (info.changes) db.prepare('UPDATE communities SET member_count = member_count + 1 WHERE id = ?').run(communityId);
  return !!info.changes;
}

/** Join a community and its announcement group. Safe to call repeatedly. */
export function joinCommunity(communityId: number, userId: number, role: Role = 'member') {
  joinCommunityOnly(communityId, userId, role);
  const ann = db.prepare('SELECT * FROM chats WHERE community_id = ? AND is_announcement = 1').all(communityId) as ChatRow[];
  for (const chat of ann) joinChat(chat, userId, role === 'member' ? 'member' : role);
}

export function serializeCommunities(rows: CommunityRow[], viewer: UserRow | null): Community[] {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const counts = db
    .prepare(`SELECT community_id, COUNT(*) n FROM chats WHERE community_id IN (${qs(ids.length)}) GROUP BY community_id`)
    .all(...ids) as { community_id: number; n: number }[];
  const mine = viewer
    ? (db
        .prepare(`SELECT community_id, role FROM community_members WHERE user_id = ? AND community_id IN (${qs(ids.length)})`)
        .all(viewer.id, ...ids) as { community_id: number; role: Role }[])
    : [];
  return rows.map((r) => {
    const m = mine.find((x) => x.community_id === r.id);
    return {
      id: r.id,
      world: r.world as World,
      name: r.name,
      description: r.description,
      emoji: r.emoji,
      avatar: r.avatar,
      inviteCode: r.invite_code,
      memberCount: r.member_count,
      groupCount: counts.find((c) => c.community_id === r.id)?.n ?? 0,
      isMember: !!m,
      role: viewer?.is_admin ? (m?.role === 'owner' ? 'owner' : 'admin') : (m?.role ?? null),
    };
  });
}

// ───────────────────────── posting ─────────────────────────

export interface NewMessage {
  chat: ChatRow;
  userId: number;
  type?: MessageType;
  text?: string;
  attachment?: Attachment | null;
  meta?: Meta | null;
  replyToId?: number | null;
  forwarded?: boolean;
  /** Ciphertext of an end-to-end encrypted message (private conversations). */
  enc?: string | null;
  silent?: boolean; // do not broadcast (seeding)
}

/** Insert a message, bump the chat, broadcast it. Returns the viewer-neutral message. */
export function createMessage(m: NewMessage): Message {
  const t = now();
  const info = db
    .prepare(
      `INSERT INTO messages (chat_id, user_id, type, text, attachment, meta, reply_to_id, forwarded, created_at, enc)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      m.chat.id,
      m.userId,
      m.type ?? 'text',
      m.text ?? '',
      m.attachment ? JSON.stringify(m.attachment) : null,
      m.meta && Object.keys(m.meta).length ? JSON.stringify(m.meta) : null,
      m.replyToId ?? null,
      m.forwarded ? 1 : 0,
      t,
      m.enc ?? null,
    );
  const id = Number(info.lastInsertRowid);
  db.prepare('UPDATE chats SET last_message_id = ?, last_activity = ? WHERE id = ?').run(id, t, m.chat.id);
  db.prepare('UPDATE chat_members SET last_read_id = ? WHERE chat_id = ? AND user_id = ?').run(id, m.chat.id, m.userId);
  // Sending a message brings an archived conversation back for everyone in a DM.
  if (m.chat.type === 'dm') db.prepare('UPDATE chat_members SET archived = 0 WHERE chat_id = ?').run(m.chat.id);
  const row = db.prepare('SELECT * FROM messages WHERE id = ?').get(id) as MessageRow;
  const msg = serializeMessages([row], null)[0]!;
  if (!m.silent) emitToChat(m.chat.id, 'message:new', msg);
  return msg;
}

export function systemMessage(chat: ChatRow, userId: number, system: SystemInfo, silent = false): Message {
  return createMessage({ chat, userId, type: 'system', meta: { system }, silent });
}

/** Resolve @username mentions against the members of a chat. */
export function resolveMentions(chatId: number, text: string): number[] {
  const found = [...text.matchAll(/(?:^|\s)@([a-zA-Z0-9_.]{3,30})/g)].map((m) => m[1]!.toLowerCase());
  // "@name." at the end of a sentence: also try the name without the trailing dots.
  const names = [...new Set(found.flatMap((n) => [n, n.replace(/\.+$/, '')]))].filter((n) => n.length >= 3).slice(0, 40);
  if (!names.length) return [];
  const rows = db
    .prepare(
      `SELECT u.id FROM users u JOIN chat_members m ON m.user_id = u.id AND m.chat_id = ?
       WHERE lower(u.username) IN (${qs(names.length)})`,
    )
    .all(chatId, ...names) as { id: number }[];
  return rows.map((r) => r.id);
}

// ───────────────────────── uploaded files ─────────────────────────

/** Extract the "/uploads/…" addresses from rows holding an attachment as JSON. */
export function attachmentUrls(rows: { json: string | null }[]): string[] {
  const urls: string[] = [];
  for (const r of rows) {
    const url = parseJson<{ url?: string }>(r.json)?.url;
    if (url) urls.push(url);
  }
  return urls;
}

/**
 * Delete uploaded files that nothing references any more. Call it after the rows
 * that pointed to them are gone (a forwarded copy keeps the file alive).
 */
export function removeOrphanUploads(urls: string[]) {
  if (!urls.length) return;
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
 * Really erase a message: its text, attachment and poll are removed from the
 * database (only the "deleted" marker stays), and its file from the disk.
 */
export function eraseMessage(row: MessageRow) {
  db.prepare('UPDATE messages SET deleted_at = ?, text = \'\', attachment = NULL, meta = NULL, enc = NULL, pinned_at = NULL, pinned_by = NULL WHERE id = ?').run(
    now(),
    row.id,
  );
  db.prepare('DELETE FROM reactions WHERE message_id = ?').run(row.id);
  db.prepare('DELETE FROM poll_votes WHERE message_id = ?').run(row.id);
  db.prepare('DELETE FROM stars WHERE message_id = ?').run(row.id);
  removeOrphanUploads(attachmentUrls([{ json: row.attachment }]));
}

// ───────────────────────── stories ─────────────────────────

export function serializeStories(rows: StoryRow[], viewerId: number): Story[] {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const seen = new Set(
    (
      db.prepare(`SELECT story_id FROM story_views WHERE user_id = ? AND story_id IN (${qs(ids.length)})`).all(viewerId, ...ids) as {
        story_id: number;
      }[]
    ).map((r) => r.story_id),
  );
  const counts = db
    .prepare(`SELECT story_id, COUNT(*) n FROM story_views WHERE story_id IN (${qs(ids.length)}) GROUP BY story_id`)
    .all(...ids) as { story_id: number; n: number }[];
  return rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    type: r.type,
    text: r.text,
    bg: r.bg,
    media: parseJson<Attachment>(r.media),
    createdAt: r.created_at,
    expiresAt: r.expires_at,
    viewed: r.user_id === viewerId || seen.has(r.id),
    // Only the author sees how many people viewed a story.
    views: r.user_id === viewerId ? (counts.find((c) => c.story_id === r.id)?.n ?? 0) : 0,
  }));
}

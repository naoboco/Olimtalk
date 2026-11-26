import { Router } from 'express';
import { z } from 'zod';
import { CITIES } from '../../shared/data.ts';
import type { InvitePreview, JoinRequest, Member, Role } from '../../shared/types.ts';
import { me, requireAuth } from '../auth.ts';
import {
  assertCanRead,
  canRead,
  canSee,
  communityRole,
  effectiveRole,
  findableSql,
  getChat,
  getCommunity,
  getMembership,
  getUser,
  hasRequested,
  isBlockedEitherWay,
  isChatAdmin,
  joinChat,
  joinCommunity,
  leaveChat,
  serializeChat,
  serializeChats,
  serializeCommunities,
  systemMessage,
  toUserPublic,
} from '../core.ts';
import { db, tx, type ChatRow, type CommunityRow, type UserRow } from '../db.ts';
import { dropOutsiders, emitToChat, emitToUser, subscribe } from '../realtime.ts';
import {
  HttpError,
  bad,
  intParam,
  intQuery,
  inviteCode,
  likeEscape,
  now,
  parse,
  rateLimiter,
  strQuery,
  zCategory,
  zProfile,
  zUploadUrl,
  zWorld,
} from '../util.ts';

export const router = Router();

const createLimit = rateLimiter(10, 60 * 60_000);
const requestLimit = rateLimiter(30, 60 * 60_000);
const cityKeys = new Set(CITIES.map((c) => c.key));
const zEmoji = z.string().min(1).max(16);

// ───────────── my conversations ─────────────

router.get('/chats', requireAuth, (req, res) => {
  const user = me(req);
  const rows = db
    .prepare(
      `SELECT c.* FROM chat_members m JOIN chats c ON c.id = m.chat_id
       WHERE m.user_id = ? ORDER BY c.last_activity DESC LIMIT 500`,
    )
    .all(user.id) as ChatRow[];
  res.json({ chats: serializeChats(rows, user) });
});

router.get('/chats/:id', requireAuth, (req, res) => {
  const chat = getChat(intParam(req, 'id'));
  if (chat.type === 'dm') assertCanRead(chat, me(req));
  // A private group that is not listed does not exist for those who have nothing to do with it.
  else if (!canSee(chat, me(req))) throw new HttpError(404, 'chat_not_found');
  res.json({ chat: serializeChat(chat, me(req)) });
});

// ───────────── create / edit groups ─────────────

router.post('/chats', requireAuth, (req, res) => {
  const user = me(req);
  if (!createLimit(user.id)) throw new HttpError(429, 'too_many_requests');
  const body = parse(
    z.object({
      name: z.string().trim().min(3).max(80),
      description: z.string().trim().max(1000).default(''),
      emoji: zEmoji.default('💬'),
      avatar: zUploadUrl.nullable().optional(),
      category: zCategory.default('general'),
      city: z.string().nullable().optional(),
      profile: zProfile.nullable().optional(),
      world: zWorld.optional(),
      communityId: z.number().int().positive().nullable().optional(),
      // Anyone may create a private group: entering it then needs an administrator's agreement.
      private: z.boolean().default(false),
      listed: z.boolean().default(true),
    }),
    req.body,
  );
  if (body.city && !cityKeys.has(body.city)) throw bad('unknown_city');
  let world = body.world ?? user.world;
  if (body.communityId) {
    const community = getCommunity(body.communityId);
    const role = communityRole(community.id, user);
    if (role !== 'owner' && role !== 'admin') throw new HttpError(403, 'forbidden');
    world = community.world;
  }
  const chat = tx(() => {
    const t = now();
    const info = db
      .prepare(
        `INSERT INTO chats (type, world, name, description, emoji, avatar, category, city, profile, community_id,
           invite_code, created_by, last_activity, created_at, private, listed)
         VALUES ('group',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        world,
        body.name,
        body.description,
        body.emoji,
        body.avatar ?? null,
        body.category,
        body.city ?? null,
        body.profile ?? null,
        body.communityId ?? null,
        inviteCode(),
        user.id,
        t,
        t,
        +body.private,
        body.private ? +body.listed : 1,
      );
    const created = getChat(Number(info.lastInsertRowid));
    joinChat(created, user.id, 'owner');
    systemMessage(getChat(created.id), user.id, { kind: 'created', actor: user.name, value: body.name });
    return getChat(created.id);
  });
  res.status(201).json({ chat: serializeChat(chat, user) });
});

router.patch('/chats/:id', requireAuth, (req, res) => {
  const user = me(req);
  const chat = getChat(intParam(req, 'id'));
  if (!isChatAdmin(chat, user)) throw new HttpError(403, 'forbidden');
  const body = parse(
    z.object({
      name: z.string().trim().min(3).max(80).optional(),
      description: z.string().trim().max(1000).optional(),
      emoji: zEmoji.optional(),
      avatar: zUploadUrl.nullable().optional(),
      category: zCategory.optional(),
      city: z.string().nullable().optional(),
      sendPolicy: z.enum(['all', 'admins']).optional(),
      pinPolicy: z.enum(['all', 'admins']).optional(),
      private: z.boolean().optional(),
      listed: z.boolean().optional(),
    }),
    req.body,
  );
  if (body.city && !cityKeys.has(body.city)) throw bad('unknown_city');
  // The built-in groups and the announcement groups of communities are public by nature.
  if (body.private && (chat.seed_key || chat.is_announcement)) throw bad('must_stay_public');
  const isPrivate = body.private ?? !!chat.private;
  db.prepare(
    `UPDATE chats SET name=?, description=?, emoji=?, avatar=?, category=?, city=?, send_policy=?, pin_policy=?, private=?, listed=? WHERE id=?`,
  ).run(
    body.name ?? chat.name,
    body.description ?? chat.description,
    body.emoji ?? chat.emoji,
    body.avatar === undefined ? chat.avatar : body.avatar,
    body.category ?? chat.category,
    body.city === undefined ? chat.city : body.city,
    body.sendPolicy ?? chat.send_policy,
    body.pinPolicy ?? chat.pin_policy,
    +isPrivate,
    isPrivate ? +(body.listed ?? !!chat.listed) : 1,
    chat.id,
  );
  const updated = getChat(chat.id);
  if (body.name && body.name !== chat.name) systemMessage(updated, user.id, { kind: 'renamed', actor: user.name, value: body.name });
  if (isPrivate && !chat.private) {
    // Now private: whoever was reading without being a member stops receiving it.
    dropOutsiders(chat.id);
  } else if (!isPrivate && chat.private) {
    // Now public: those who were waiting for an answer simply come in.
    for (const r of db.prepare('SELECT user_id FROM join_requests WHERE chat_id = ?').all(chat.id) as { user_id: number }[]) admit(getChat(chat.id), r.user_id);
  }
  emitToChat(chat.id, 'chat:update', { chatId: chat.id });
  res.json({ chat: serializeChat(getChat(chat.id), user) });
});

router.post('/chats/:id/invite/reset', requireAuth, (req, res) => {
  const user = me(req);
  const chat = getChat(intParam(req, 'id'));
  if (!isChatAdmin(chat, user)) throw new HttpError(403, 'forbidden');
  db.prepare('UPDATE chats SET invite_code = ? WHERE id = ?').run(inviteCode(), chat.id);
  emitToChat(chat.id, 'chat:update', { chatId: chat.id });
  res.json({ chat: serializeChat(getChat(chat.id), user) });
});

router.delete('/chats/:id', requireAuth, (req, res) => {
  const user = me(req);
  const chat = getChat(intParam(req, 'id'));
  if (chat.type !== 'group') throw bad('invalid_target');
  const role = effectiveRole(getMembership(chat.id, user.id), user);
  if (role !== 'owner' && !user.is_admin) throw new HttpError(403, 'forbidden');
  if (chat.seed_key && !user.is_admin) throw new HttpError(403, 'forbidden');
  emitToChat(chat.id, 'chat:deleted', { chatId: chat.id });
  db.prepare('DELETE FROM chats WHERE id = ?').run(chat.id);
  res.json({ ok: true });
});

// ───────────── membership ─────────────

/** Let someone who asked into a private group, and tell them. */
function admit(chat: ChatRow, userId: number) {
  db.prepare('DELETE FROM join_requests WHERE chat_id = ? AND user_id = ?').run(chat.id, userId);
  if (joinChat(chat, userId)) emitToUser(userId, 'chat:approved', { chatId: chat.id, name: chat.name });
}

const chatAdmins = (chatId: number) =>
  (db.prepare("SELECT user_id FROM chat_members WHERE chat_id = ? AND role IN ('owner', 'admin')").all(chatId) as { user_id: number }[]).map((r) => r.user_id);

/**
 * Enter a group. A public group is joined at once; for a private one the person's request
 * waits for an administrator. Returns true when it is a request.
 */
function enter(chat: ChatRow, user: UserRow): boolean {
  if (chat.type !== 'group') throw new HttpError(403, 'forbidden');
  // (the moderation team already has access everywhere)
  if (!chat.private || user.is_admin || getMembership(chat.id, user.id)) {
    joinChat(chat, user.id);
    return false;
  }
  if (!hasRequested(chat.id, user.id)) {
    if (!requestLimit(user.id)) throw new HttpError(429, 'too_many_requests');
    db.prepare('INSERT OR IGNORE INTO join_requests (chat_id, user_id, created_at) VALUES (?,?,?)').run(chat.id, user.id, now());
    for (const adminId of chatAdmins(chat.id)) emitToUser(adminId, 'chat:request', { chatId: chat.id, chatName: chat.name, userName: user.name });
  }
  return true;
}

router.post('/chats/:id/join', requireAuth, (req, res) => {
  const user = me(req);
  const chat = getChat(intParam(req, 'id'));
  if (chat.type === 'group' && !canSee(chat, user)) throw new HttpError(404, 'chat_not_found');
  const requested = enter(chat, user);
  res.json({ chat: serializeChat(getChat(chat.id), user), requested });
});

/** Take back my request to enter a private group. */
router.delete('/chats/:id/join', requireAuth, (req, res) => {
  const user = me(req);
  const chat = getChat(intParam(req, 'id'));
  const info = db.prepare('DELETE FROM join_requests WHERE chat_id = ? AND user_id = ?').run(chat.id, user.id);
  if (info.changes) for (const adminId of chatAdmins(chat.id)) emitToUser(adminId, 'chat:update', { chatId: chat.id });
  res.json({ ok: true });
});

/** For the administrators of a private group: who is asking to enter. */
router.get('/chats/:id/requests', requireAuth, (req, res) => {
  const user = me(req);
  const chat = getChat(intParam(req, 'id'));
  if (!isChatAdmin(chat, user)) throw new HttpError(403, 'forbidden');
  const rows = db
    .prepare('SELECT u.*, r.created_at AS r_created FROM join_requests r JOIN users u ON u.id = r.user_id WHERE r.chat_id = ? ORDER BY r.created_at LIMIT 200')
    .all(chat.id) as (UserRow & { r_created: number })[];
  const requests: JoinRequest[] = rows.map((r) => ({ user: toUserPublic(r), createdAt: r.r_created }));
  res.json({ requests });
});

router.post('/chats/:id/requests/:userId', requireAuth, (req, res) => {
  const user = me(req);
  const chat = getChat(intParam(req, 'id'));
  const targetId = intParam(req, 'userId');
  if (!isChatAdmin(chat, user)) throw new HttpError(403, 'forbidden');
  const body = parse(z.object({ action: z.enum(['approve', 'decline']) }), req.body);
  if (!hasRequested(chat.id, targetId)) throw new HttpError(404, 'request_not_found');
  if (body.action === 'approve') admit(chat, targetId);
  else {
    db.prepare('DELETE FROM join_requests WHERE chat_id = ? AND user_id = ?').run(chat.id, targetId);
    // No announcement of a refusal: the person's screen simply goes back to "ask to join".
    emitToUser(targetId, 'chat:update', { chatId: chat.id });
  }
  for (const adminId of chatAdmins(chat.id)) emitToUser(adminId, 'chat:update', { chatId: chat.id });
  res.json({ chat: serializeChat(getChat(chat.id), user) });
});

router.post('/chats/:id/leave', requireAuth, (req, res) => {
  const user = me(req);
  const chat = getChat(intParam(req, 'id'));
  if (chat.type !== 'group') throw bad('invalid_target');
  const member = getMembership(chat.id, user.id);
  if (!member) return res.json({ ok: true });
  tx(() => {
    leaveChat(chat, user.id);
    // If the owner leaves, hand the group over to the longest-standing admin / member.
    if (member.role === 'owner') {
      const heir = db
        .prepare(
          `SELECT user_id FROM chat_members WHERE chat_id = ?
           ORDER BY CASE role WHEN 'admin' THEN 0 ELSE 1 END, joined_at LIMIT 1`,
        )
        .get(chat.id) as { user_id: number } | undefined;
      if (heir) db.prepare("UPDATE chat_members SET role = 'owner' WHERE chat_id = ? AND user_id = ?").run(chat.id, heir.user_id);
    }
  });
  res.json({ ok: true });
});

router.get('/chats/:id/members', requireAuth, (req, res) => {
  const chat = getChat(intParam(req, 'id'));
  assertCanRead(chat, me(req));
  const q = strQuery(req, 'q', 40);
  const offset = intQuery(req, 'offset') ?? 0;
  const like = `%${likeEscape(q)}%`;
  const rows = db
    .prepare(
      `SELECT u.*, m.role AS m_role, m.joined_at AS m_joined FROM chat_members m JOIN users u ON u.id = m.user_id
       WHERE m.chat_id = ? AND (? = '' OR u.name LIKE ? ESCAPE '\\' OR u.username LIKE ? ESCAPE '\\')
       ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, m.joined_at
       LIMIT 51 OFFSET ?`,
    )
    .all(chat.id, q, like, like, offset) as (UserRow & { m_role: Role; m_joined: number })[];
  const members: Member[] = rows.slice(0, 50).map((r) => ({ user: toUserPublic(r), role: r.m_role, joinedAt: r.m_joined }));
  res.json({ members, hasMore: rows.length > 50 });
});

router.patch('/chats/:id/members/:userId', requireAuth, (req, res) => {
  const user = me(req);
  const chat = getChat(intParam(req, 'id'));
  const targetId = intParam(req, 'userId');
  const body = parse(z.object({ role: z.enum(['admin', 'member']) }), req.body);
  const myRole = effectiveRole(getMembership(chat.id, user.id), user);
  if (myRole !== 'owner' && myRole !== 'admin') throw new HttpError(403, 'forbidden');
  const target = getMembership(chat.id, targetId);
  if (!target) throw new HttpError(404, 'member_not_found');
  if (target.role === 'owner') throw new HttpError(403, 'forbidden');
  db.prepare('UPDATE chat_members SET role = ? WHERE chat_id = ? AND user_id = ?').run(body.role, chat.id, targetId);
  emitToUser(targetId, 'chat:update', { chatId: chat.id });
  res.json({ ok: true });
});

router.delete('/chats/:id/members/:userId', requireAuth, (req, res) => {
  const user = me(req);
  const chat = getChat(intParam(req, 'id'));
  const targetId = intParam(req, 'userId');
  if (!isChatAdmin(chat, user)) throw new HttpError(403, 'forbidden');
  const target = getMembership(chat.id, targetId);
  if (!target) return res.json({ ok: true });
  if (target.role === 'owner') throw new HttpError(403, 'forbidden');
  emitToUser(targetId, 'chat:removed', { chatId: chat.id });
  leaveChat(chat, targetId);
  res.json({ ok: true });
});

router.patch('/chats/:id/prefs', requireAuth, (req, res) => {
  const user = me(req);
  const chat = getChat(intParam(req, 'id'));
  const member = getMembership(chat.id, user.id);
  if (!member) throw new HttpError(403, 'not_a_member');
  const body = parse(
    z.object({ muted: z.boolean().optional(), pinned: z.boolean().optional(), archived: z.boolean().optional() }),
    req.body,
  );
  db.prepare('UPDATE chat_members SET muted=?, pinned=?, archived=? WHERE chat_id=? AND user_id=?').run(
    body.muted === undefined ? member.muted : +body.muted,
    body.pinned === undefined ? member.pinned : +body.pinned,
    body.archived === undefined ? member.archived : +body.archived,
    chat.id,
    user.id,
  );
  res.json({ chat: serializeChat(chat, user) });
});

router.post('/chats/:id/read', requireAuth, (req, res) => {
  const user = me(req);
  const chat = getChat(intParam(req, 'id'));
  const body = parse(z.object({ messageId: z.number().int().nonnegative() }), req.body);
  const lastId = Math.min(body.messageId, chat.last_message_id ?? 0);
  const info = db
    .prepare('UPDATE chat_members SET last_read_id = ? WHERE chat_id = ? AND user_id = ? AND last_read_id < ?')
    .run(lastId, chat.id, user.id, lastId);
  // Read receipts are only shared in private conversations, and only by people who left them on.
  if (info.changes && chat.type === 'dm' && !user.no_receipts) emitToChat(chat.id, 'read', { chatId: chat.id, userId: user.id, lastReadId: lastId });
  res.json({ ok: true });
});

// ───────────── direct messages ─────────────

router.post('/dm', requireAuth, (req, res) => {
  const user = me(req);
  const body = parse(z.object({ userId: z.number().int().positive() }), req.body);
  if (body.userId === user.id) throw bad('invalid_target');
  const peer = getUser(body.userId);
  if (!peer || peer.is_system || peer.banned) throw new HttpError(404, 'user_not_found');
  const key = [user.id, peer.id].sort((a, b) => a - b).join(':');
  let chat = db.prepare('SELECT * FROM chats WHERE dm_key = ?').get(key) as ChatRow | undefined;
  if (!chat) {
    if (isBlockedEitherWay(user.id, peer.id)) throw new HttpError(403, 'blocked');
    chat = tx(() => {
      const t = now();
      const info = db
        .prepare("INSERT INTO chats (type, dm_key, last_activity, created_at, member_count) VALUES ('dm',?,?,?,0)")
        .run(key, t, t);
      const id = Number(info.lastInsertRowid);
      const insert = db.prepare("INSERT INTO chat_members (chat_id, user_id, role, joined_at) VALUES (?,?,'member',?)");
      insert.run(id, user.id, t);
      insert.run(id, peer.id, t);
      db.prepare('UPDATE chats SET member_count = 2 WHERE id = ?').run(id);
      return getChat(id);
    });
    subscribe(user.id, chat.id);
    subscribe(peer.id, chat.id);
  }
  res.json({ chat: serializeChat(chat, user) });
});

// ───────────── explore ─────────────

router.get('/explore', requireAuth, (req, res) => {
  const user = me(req);
  const world = parse(zWorld, strQuery(req, 'world') || user.world);
  const category = strQuery(req, 'category');
  const q = strQuery(req, 'q', 60);
  const offset = intQuery(req, 'offset') ?? 0;
  // Private groups appear only when they are listed (or are mine); their content stays hidden.
  const where = ["c.type = 'group'", 'c.world = ?', 'c.is_announcement = 0', findableSql('c')];
  const params: (string | number)[] = [world, user.id];
  if (category) {
    where.push('c.category = ?');
    params.push(parse(zCategory, category));
  }
  if (q) {
    where.push("(c.name LIKE ? ESCAPE '\\' OR c.description LIKE ? ESCAPE '\\')");
    const like = `%${likeEscape(q)}%`;
    params.push(like, like);
  }
  const rows = db
    .prepare(
      `SELECT c.* FROM chats c WHERE ${where.join(' AND ')}
       ORDER BY c.member_count DESC, (c.seed_key IS NULL), c.id LIMIT 41 OFFSET ?`,
    )
    .all(...params, offset) as ChatRow[];
  let communities: CommunityRow[] = [];
  if (!offset && !category) {
    const like = `%${likeEscape(q)}%`;
    communities = db
      .prepare(
        `SELECT * FROM communities WHERE world = ? AND (? = '' OR name LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\')
         ORDER BY member_count DESC, id LIMIT 30`,
      )
      .all(world, q, like, like) as CommunityRow[];
  }
  res.json({
    groups: serializeChats(rows.slice(0, 40), user),
    hasMore: rows.length > 40,
    communities: serializeCommunities(communities, user),
  });
});

// ───────────── invite links (work for logged-out visitors too) ─────────────

export function findInvite(code: string): { chat?: ChatRow; community?: CommunityRow } {
  const chat = db.prepare("SELECT * FROM chats WHERE invite_code = ? AND type = 'group'").get(code) as ChatRow | undefined;
  if (chat) return { chat };
  const community = db.prepare('SELECT * FROM communities WHERE invite_code = ?').get(code) as CommunityRow | undefined;
  return community ? { community } : {};
}

router.get('/invite/:code', (req, res) => {
  const found = findInvite(String(req.params.code));
  const viewer = req.user ?? null;
  let preview: InvitePreview;
  if (found.chat) preview = { kind: 'chat', chat: serializeChat(found.chat, viewer) };
  else if (found.community) {
    const community = serializeCommunities([found.community], viewer)[0]!;
    const groups = db
      .prepare(`SELECT * FROM chats c WHERE c.community_id = ? AND ${findableSql('c')} ORDER BY c.is_announcement DESC, c.member_count DESC LIMIT 6`)
      .all(found.community.id, viewer?.id ?? 0) as ChatRow[];
    community.groups = serializeChats(groups, viewer);
    preview = { kind: 'community', community };
  } else throw new HttpError(404, 'invite_not_found');
  res.json(preview);
});

router.post('/invite/:code/join', requireAuth, (req, res) => {
  const user = me(req);
  const found = findInvite(String(req.params.code));
  if (found.chat) {
    // Holding the link of a private group lets you ask; an administrator still decides.
    const requested = enter(found.chat, user);
    return res.json({ kind: 'chat', chat: serializeChat(getChat(found.chat.id), user), requested });
  }
  if (found.community) {
    joinCommunity(found.community.id, user.id);
    return res.json({ kind: 'community', community: serializeCommunities([getCommunity(found.community.id)], user)[0] });
  }
  throw new HttpError(404, 'invite_not_found');
});

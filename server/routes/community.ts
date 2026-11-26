import { Router } from 'express';
import { z } from 'zod';
import type { EventData, RsvpEvent, StoryGroup } from '../../shared/types.ts';
import { me, requireAuth } from '../auth.ts';
import {
  communityRole,
  createMessage,
  getChat,
  getCommunity,
  getMembership,
  joinChat,
  joinCommunity,
  serializeChats,
  serializeCommunities,
  serializeStories,
  toEventData,
  toUserPublic,
} from '../core.ts';
import { db, qs, tx, type ChatRow, type CommunityRow, type EventRow, type StoryRow, type UserRow } from '../db.ts';
import { emitToAll, emitToChat } from '../realtime.ts';
import {
  HttpError,
  bad,
  intParam,
  inviteCode,
  now,
  parse,
  rateLimiter,
  strQuery,
  zAttachment,
  zUploadUrl,
  zWorld,
} from '../util.ts';
import { assertCanSend } from './messages.ts';

export const router = Router();

const createLimit = rateLimiter(5, 60 * 60_000);
const storyLimit = rateLimiter(20, 60 * 60_000);

// ───────────────────────── communities ─────────────────────────

function communityWithGroups(row: CommunityRow, viewer: UserRow) {
  const community = serializeCommunities([row], viewer)[0]!;
  const groups = db
    .prepare('SELECT * FROM chats WHERE community_id = ? ORDER BY is_announcement DESC, member_count DESC, id LIMIT 200')
    .all(row.id) as ChatRow[];
  community.groups = serializeChats(groups, viewer);
  return community;
}

router.get('/communities', requireAuth, (req, res) => {
  const user = me(req);
  const mine = strQuery(req, 'mine') === '1';
  const rows = mine
    ? (db
        .prepare(
          `SELECT c.* FROM communities c JOIN community_members m ON m.community_id = c.id
           WHERE m.user_id = ? ORDER BY c.name`,
        )
        .all(user.id) as CommunityRow[])
    : (db
        .prepare('SELECT * FROM communities WHERE world = ? ORDER BY member_count DESC, id LIMIT 100')
        .all(parse(zWorld, strQuery(req, 'world') || user.world)) as CommunityRow[]);
  res.json({ communities: serializeCommunities(rows, user) });
});

router.get('/communities/:id', requireAuth, (req, res) => {
  res.json({ community: communityWithGroups(getCommunity(intParam(req, 'id')), me(req)) });
});

router.post('/communities', requireAuth, (req, res) => {
  const user = me(req);
  if (!createLimit(user.id)) throw new HttpError(429, 'too_many_requests');
  const body = parse(
    z.object({
      name: z.string().trim().min(3).max(80),
      description: z.string().trim().max(1000).default(''),
      emoji: z.string().min(1).max(16).default('🌍'),
      avatar: zUploadUrl.nullable().optional(),
      world: zWorld.optional(),
      announcementName: z.string().trim().min(3).max(80),
    }),
    req.body,
  );
  const row = tx(() => {
    const t = now();
    const world = body.world ?? user.world;
    const info = db
      .prepare(
        `INSERT INTO communities (world, name, description, emoji, avatar, invite_code, created_by, created_at)
         VALUES (?,?,?,?,?,?,?,?)`,
      )
      .run(world, body.name, body.description, body.emoji, body.avatar ?? null, inviteCode(), user.id, t);
    const id = Number(info.lastInsertRowid);
    // Every community gets an announcement group where only admins can post.
    db.prepare(
      `INSERT INTO chats (type, world, name, description, emoji, category, community_id, is_announcement, invite_code,
         send_policy, created_by, last_activity, created_at)
       VALUES ('group',?,?,?,?,'general',?,1,?,'admins',?,?,?)`,
    ).run(world, body.announcementName, body.description, '📢', id, inviteCode(), user.id, t, t);
    joinCommunity(id, user.id, 'owner');
    return getCommunity(id);
  });
  res.status(201).json({ community: communityWithGroups(row, user) });
});

router.patch('/communities/:id', requireAuth, (req, res) => {
  const user = me(req);
  const row = getCommunity(intParam(req, 'id'));
  const role = communityRole(row.id, user);
  if (role !== 'owner' && role !== 'admin') throw new HttpError(403, 'forbidden');
  const body = parse(
    z.object({
      name: z.string().trim().min(3).max(80).optional(),
      description: z.string().trim().max(1000).optional(),
      emoji: z.string().min(1).max(16).optional(),
      avatar: zUploadUrl.nullable().optional(),
    }),
    req.body,
  );
  db.prepare('UPDATE communities SET name=?, description=?, emoji=?, avatar=? WHERE id=?').run(
    body.name ?? row.name,
    body.description ?? row.description,
    body.emoji ?? row.emoji,
    body.avatar === undefined ? row.avatar : body.avatar,
    row.id,
  );
  res.json({ community: communityWithGroups(getCommunity(row.id), user) });
});

router.post('/communities/:id/join', requireAuth, (req, res) => {
  const row = getCommunity(intParam(req, 'id'));
  joinCommunity(row.id, me(req).id);
  res.json({ community: communityWithGroups(getCommunity(row.id), me(req)) });
});

router.post('/communities/:id/leave', requireAuth, (req, res) => {
  const user = me(req);
  const row = getCommunity(intParam(req, 'id'));
  const info = db.prepare('DELETE FROM community_members WHERE community_id = ? AND user_id = ?').run(row.id, user.id);
  if (info.changes) db.prepare('UPDATE communities SET member_count = MAX(member_count - 1, 0) WHERE id = ?').run(row.id);
  res.json({ community: communityWithGroups(getCommunity(row.id), user) });
});

// ───────────────────────── events ─────────────────────────

router.get('/events', requireAuth, (req, res) => {
  const user = me(req);
  const world = parse(zWorld, strQuery(req, 'world') || user.world);
  const mine = strQuery(req, 'mine') === '1';
  const since = now() - 1000 * 60 * 60 * 6; // keep events visible a few hours after they start
  const rows = mine
    ? (db
        .prepare(
          `SELECT e.* FROM events e JOIN event_rsvps r ON r.event_id = e.id AND r.user_id = ? AND r.status IN ('going','maybe')
           WHERE e.starts_at > ? ORDER BY e.starts_at LIMIT 100`,
        )
        .all(user.id, since) as EventRow[])
    : (db.prepare('SELECT * FROM events WHERE world = ? AND starts_at > ? ORDER BY starts_at LIMIT 100').all(world, since) as EventRow[]);
  res.json({ events: [...toEventData(rows, user.id).values()] });
});

router.post('/chats/:id/events', requireAuth, (req, res) => {
  const user = me(req);
  const chat = getChat(intParam(req, 'id'));
  if (chat.type !== 'group') throw bad('invalid_target');
  assertCanSend(chat, user);
  const body = parse(
    z.object({
      title: z.string().trim().min(3).max(120),
      description: z.string().trim().max(2000).default(''),
      location: z.string().trim().max(200).default(''),
      startsAt: z.number().int().positive(),
      endsAt: z.number().int().positive().nullable().optional(),
    }),
    req.body,
  );
  if (body.startsAt < now() - 60_000) throw bad('event_in_past');
  if (body.endsAt && body.endsAt < body.startsAt) throw bad('invalid_dates');
  const info = db
    .prepare(
      `INSERT INTO events (chat_id, world, title, description, location, starts_at, ends_at, created_by, created_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
    )
    .run(chat.id, chat.world, body.title, body.description, body.location, body.startsAt, body.endsAt ?? null, user.id, now());
  const eventId = Number(info.lastInsertRowid);
  db.prepare("INSERT INTO event_rsvps (event_id, user_id, status) VALUES (?,?,'going')").run(eventId, user.id);
  const message = createMessage({ chat, userId: user.id, type: 'event', text: body.title, meta: { eventId } });
  db.prepare('UPDATE events SET message_id = ? WHERE id = ?').run(message.id, eventId);
  res.status(201).json({ message });
});

router.post('/events/:id/rsvp', requireAuth, (req, res) => {
  const user = me(req);
  const row = db.prepare('SELECT * FROM events WHERE id = ?').get(intParam(req, 'id')) as EventRow | undefined;
  if (!row) throw new HttpError(404, 'event_not_found');
  const body = parse(z.object({ status: z.enum(['going', 'maybe', 'no']).nullable() }), req.body);
  if (body.status) {
    db.prepare(
      `INSERT INTO event_rsvps (event_id, user_id, status) VALUES (?,?,?)
       ON CONFLICT (event_id, user_id) DO UPDATE SET status = excluded.status`,
    ).run(row.id, user.id, body.status);
    // Answering "going" to a public event also joins its group, so you get the updates.
    if (body.status === 'going' && !getMembership(row.chat_id, user.id)) joinChat(getChat(row.chat_id), user.id);
  } else {
    db.prepare('DELETE FROM event_rsvps WHERE event_id = ? AND user_id = ?').run(row.id, user.id);
  }
  const data = toEventData([row], user.id).get(row.id) as EventData;
  const event: RsvpEvent = {
    chatId: row.chat_id,
    messageId: row.message_id,
    eventId: row.id,
    userId: user.id,
    status: body.status,
    going: data.going,
    maybe: data.maybe,
  };
  emitToChat(row.chat_id, 'event:rsvp', event);
  res.json({ event: data });
});

router.delete('/events/:id', requireAuth, (req, res) => {
  const user = me(req);
  const row = db.prepare('SELECT * FROM events WHERE id = ?').get(intParam(req, 'id')) as EventRow | undefined;
  if (!row) throw new HttpError(404, 'event_not_found');
  if (row.created_by !== user.id && !user.is_admin) throw new HttpError(403, 'forbidden');
  db.prepare('DELETE FROM events WHERE id = ?').run(row.id);
  if (row.message_id) {
    db.prepare('UPDATE messages SET deleted_at = ? WHERE id = ?').run(now(), row.message_id);
    emitToChat(row.chat_id, 'message:patch', { chatId: row.chat_id, id: row.message_id, patch: { deleted: true, text: '' } });
  }
  res.json({ ok: true });
});

// ───────────────────────── stories ─────────────────────────

const STORY_TTL = 1000 * 60 * 60 * 24;

router.get('/stories', requireAuth, (req, res) => {
  const user = me(req);
  const world = parse(zWorld, strQuery(req, 'world') || user.world);
  const rows = db
    .prepare(
      `SELECT s.* FROM stories s JOIN users u ON u.id = s.user_id
       WHERE s.expires_at > ? AND u.banned = 0 AND (s.world = ? OR s.user_id = ?)
         AND s.user_id NOT IN (SELECT blocked_id FROM blocks WHERE user_id = ?)
       ORDER BY s.created_at LIMIT 500`,
    )
    .all(now(), world, user.id, user.id) as StoryRow[];
  const stories = serializeStories(rows, user.id);
  const userIds = [...new Set(rows.map((r) => r.user_id))];
  const users = userIds.length ? (db.prepare(`SELECT * FROM users WHERE id IN (${qs(userIds.length)})`).all(...userIds) as UserRow[]) : [];
  const groups: StoryGroup[] = users.map((u) => {
    const own = stories.filter((s) => s.userId === u.id);
    return {
      user: toUserPublic(u),
      stories: own,
      allViewed: own.every((s) => s.viewed),
      latest: Math.max(...own.map((s) => s.createdAt)),
    };
  });
  // Mine first, then unseen, then most recent.
  groups.sort(
    (a, b) =>
      Number(b.user.id === user.id) - Number(a.user.id === user.id) || Number(a.allViewed) - Number(b.allViewed) || b.latest - a.latest,
  );
  res.json({ groups });
});

router.post('/stories', requireAuth, (req, res) => {
  const user = me(req);
  if (!storyLimit(user.id)) throw new HttpError(429, 'too_many_requests');
  const body = parse(
    z.object({
      text: z.string().trim().max(700).default(''),
      bg: z.string().max(120).default(''),
      media: zAttachment.nullable().optional(),
    }),
    req.body,
  );
  if (!body.text && !body.media) throw bad('empty_story');
  if (body.media && body.media.kind !== 'image' && body.media.kind !== 'video') throw bad('invalid_media');
  const t = now();
  const info = db
    .prepare('INSERT INTO stories (user_id, world, type, text, bg, media, created_at, expires_at) VALUES (?,?,?,?,?,?,?,?)')
    .run(
      user.id,
      user.world,
      body.media ? body.media.kind : 'text',
      body.text,
      body.bg,
      body.media ? JSON.stringify(body.media) : null,
      t,
      t + STORY_TTL,
    );
  emitToAll('story:new', { userId: user.id, world: user.world });
  const row = db.prepare('SELECT * FROM stories WHERE id = ?').get(Number(info.lastInsertRowid)) as StoryRow;
  res.status(201).json({ story: serializeStories([row], user.id)[0] });
});

router.post('/stories/:id/view', requireAuth, (req, res) => {
  const id = intParam(req, 'id');
  const story = db.prepare('SELECT user_id FROM stories WHERE id = ?').get(id) as { user_id: number } | undefined;
  if (story && story.user_id !== me(req).id) {
    db.prepare('INSERT OR IGNORE INTO story_views (story_id, user_id, viewed_at) VALUES (?,?,?)').run(id, me(req).id, now());
  }
  res.json({ ok: true });
});

router.get('/stories/:id/viewers', requireAuth, (req, res) => {
  const id = intParam(req, 'id');
  const story = db.prepare('SELECT user_id FROM stories WHERE id = ?').get(id) as { user_id: number } | undefined;
  if (!story) throw new HttpError(404, 'story_not_found');
  if (story.user_id !== me(req).id) throw new HttpError(403, 'forbidden');
  const rows = db
    .prepare('SELECT u.* FROM story_views v JOIN users u ON u.id = v.user_id WHERE v.story_id = ? ORDER BY v.viewed_at DESC LIMIT 200')
    .all(id) as UserRow[];
  res.json({ viewers: rows.map(toUserPublic) });
});

router.delete('/stories/:id', requireAuth, (req, res) => {
  const user = me(req);
  const id = intParam(req, 'id');
  const story = db.prepare('SELECT user_id FROM stories WHERE id = ?').get(id) as { user_id: number } | undefined;
  if (!story) return res.json({ ok: true });
  if (story.user_id !== user.id && !user.is_admin) throw new HttpError(403, 'forbidden');
  db.prepare('DELETE FROM stories WHERE id = ?').run(id);
  emitToAll('story:new', { userId: story.user_id });
  res.json({ ok: true });
});

setInterval(() => db.prepare('DELETE FROM stories WHERE expires_at < ?').run(now() - STORY_TTL), 60 * 60_000).unref();

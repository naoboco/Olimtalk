import type { Server as HttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import { db } from './db.ts';
import { tokenFromCookieHeader, userFromToken } from './auth.ts';
import { now, rateLimiter } from './util.ts';

let io: Server | undefined;

// userId -> number of open sockets
const online = new Map<number, number>();

export const isOnline = (userId: number) => online.has(userId);

const chatRoom = (id: number) => `chat:${id}`;
const userRoom = (id: number) => `user:${id}`;

export function emitToChat(chatId: number, event: string, payload: unknown) {
  io?.to(chatRoom(chatId)).emit(event, payload);
}

export function emitToUser(userId: number, event: string, payload: unknown) {
  io?.to(userRoom(userId)).emit(event, payload);
}

export function emitToAll(event: string, payload: unknown) {
  io?.emit(event, payload);
}

/** Make every socket of a user join / leave a chat room (after a REST join / leave). */
export function subscribe(userId: number, chatId: number) {
  io?.in(userRoom(userId)).socketsJoin(chatRoom(chatId));
}
export function unsubscribe(userId: number, chatId: number) {
  io?.in(userRoom(userId)).socketsLeave(chatRoom(chatId));
}

/** Close every live connection of a user (ban, forced sign-out). */
export function kick(userId: number) {
  io?.in(userRoom(userId)).disconnectSockets(true);
}

function dmChatIds(userId: number): number[] {
  return (
    db
      .prepare(
        `SELECT m.chat_id FROM chat_members m JOIN chats c ON c.id = m.chat_id
         WHERE m.user_id = ? AND c.type = 'dm'`,
      )
      .all(userId) as { chat_id: number }[]
  ).map((r) => r.chat_id);
}

function broadcastPresence(userId: number, isOn: boolean) {
  const hidden = db.prepare('SELECT hide_presence FROM users WHERE id = ?').get(userId) as { hide_presence: number } | undefined;
  if (!hidden || hidden.hide_presence) return;
  const payload = { userId, online: isOn, lastSeen: now() };
  for (const id of dmChatIds(userId)) io?.to(chatRoom(id)).emit('presence', payload);
}

const typingLimit = rateLimiter(20, 10_000);

export function initRealtime(server: HttpServer, corsOrigins: string[] = []) {
  io = new Server(server, {
    path: '/socket.io',
    serveClient: false,
    maxHttpBufferSize: 1e5,
    cors: corsOrigins.length ? { origin: corsOrigins } : undefined,
  });

  io.use((socket, next) => {
    const auth = socket.handshake.auth as { token?: unknown } | undefined;
    const token = typeof auth?.token === 'string' && auth.token ? auth.token : tokenFromCookieHeader(socket.handshake.headers.cookie);
    const user = userFromToken(token);
    if (!user) return next(new Error('unauthorized'));
    socket.data.userId = user.id;
    socket.data.name = user.name;
    next();
  });

  io.on('connection', (socket: Socket) => {
    const userId: number = socket.data.userId;
    socket.join(userRoom(userId));
    const rows = db.prepare('SELECT chat_id FROM chat_members WHERE user_id = ?').all(userId) as { chat_id: number }[];
    for (const r of rows) socket.join(chatRoom(r.chat_id));

    const count = (online.get(userId) || 0) + 1;
    online.set(userId, count);
    if (count === 1) broadcastPresence(userId, true);

    // Public groups can be read without joining: "watch" subscribes to live updates.
    socket.on('watch', (chatId: unknown) => {
      if (typeof chatId !== 'number') return;
      const chat = db.prepare("SELECT id FROM chats WHERE id = ? AND type = 'group'").get(chatId);
      if (chat) socket.join(chatRoom(chatId));
    });
    socket.on('unwatch', (chatId: unknown) => {
      if (typeof chatId !== 'number') return;
      const member = db.prepare('SELECT 1 FROM chat_members WHERE chat_id = ? AND user_id = ?').get(chatId, userId);
      if (!member) socket.leave(chatRoom(chatId));
    });

    socket.on('typing', (chatId: unknown) => {
      if (typeof chatId !== 'number' || !typingLimit(userId)) return;
      if (!socket.rooms.has(chatRoom(chatId))) return;
      const member = db.prepare('SELECT 1 FROM chat_members WHERE chat_id = ? AND user_id = ?').get(chatId, userId);
      if (!member) return;
      socket.to(chatRoom(chatId)).emit('typing', { chatId, userId, name: socket.data.name });
    });

    socket.on('disconnect', () => {
      const left = (online.get(userId) || 1) - 1;
      if (left <= 0) {
        online.delete(userId);
        db.prepare('UPDATE users SET last_seen = ? WHERE id = ?').run(now(), userId);
        broadcastPresence(userId, false);
      } else {
        online.set(userId, left);
      }
    });
  });

  return io;
}

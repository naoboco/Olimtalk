// End-to-end API tests: boots the real server on a random port with a throw-away database.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { io as ioClient, type Socket } from 'socket.io-client';
import nodemailer from 'nodemailer';
import {
  decryptMessage,
  deriveSecrets,
  encryptMessage,
  fromBase64,
  generateIdentity,
  unseal,
  unsealJson,
  unwrapPrivateKey,
  wrapPrivateKey,
} from '../../shared/e2e.ts';
import type { Chat, Community, Me, Message, StoryGroup } from '../../shared/types.ts';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'olimtalk-test-'));
process.env.DATA_DIR = dir;
process.env.OLIMTALK_NO_LISTEN = '1';
process.env.ADMIN_EMAILS = 'admin@example.com';
process.env.AUTH_RATE_LIMIT = '1000';
process.env.MAIL_DOMAIN = 'in.olimtalk.test';
process.env.INBOUND_MAIL_SECRET = 'test-inbound-secret';
process.env.SMTP_PORT = '0'; // any free port
process.env.ICS_ALLOW_PRIVATE = '1'; // lets the calendar reader reach the local test server
process.env.ANTHROPIC_API_KEY = 'sk-ant-test'; // translation goes to a stand-in for the Claude API (see the last test)
process.env.TRANSLATE_HOURLY_LIMIT = '12';

let base = '';
let close: () => Promise<void>;

class Client {
  cookie = '';
  token = ''; // set for clients that behave like the mobile apps
  me!: Me;
  async req<T = any>(method: string, url: string, body?: unknown, expect = 200): Promise<T> {
    const res = await fetch(base + url, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(this.cookie ? { Cookie: this.cookie } : {}),
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const set = res.headers.get('set-cookie');
    if (set) this.cookie = set.split(';')[0]!;
    const json = (await res.json().catch(() => ({}))) as T;
    assert.equal(res.status, expect, `${method} ${url} → ${res.status} ${JSON.stringify(json)}`);
    return json;
  }
  get = <T = any>(url: string, expect?: number) => this.req<T>('GET', url, undefined, expect);
  post = <T = any>(url: string, body: unknown = {}, expect?: number) => this.req<T>('POST', url, body, expect);
  patch = <T = any>(url: string, body: unknown = {}, expect?: number) => this.req<T>('PATCH', url, body, expect);
  put = <T = any>(url: string, body: unknown = {}, expect?: number) => this.req<T>('PUT', url, body, expect);
  del = <T = any>(url: string, expect?: number) => this.req<T>('DELETE', url, undefined, expect);

  static async register(name: string, extra: Record<string, unknown> = {}): Promise<Client> {
    const c = new Client();
    const email = `${name.toLowerCase()}@example.com`;
    const r = await c.post<{ me: Me }>('/api/auth/register', { email, password: 'password123', name, world: 'fr', ...extra }, 201);
    c.me = r.me;
    return c;
  }
  socket(): Promise<Socket> {
    return new Promise((resolve, reject) => {
      const s = ioClient(base, { extraHeaders: { Cookie: this.cookie }, transports: ['websocket'] });
      s.on('connect', () => resolve(s));
      s.on('connect_error', reject);
    });
  }
}

const once = <T>(s: Socket, event: string) => new Promise<T>((resolve) => s.once(event, resolve));
/** The server treats ciphertext as opaque: any long-enough string stands in for it here. */
const ENC = (label: string) => JSON.stringify({ v: 1, opaque: label.padEnd(24, '.') });

let alice: Client;
let bob: Client;
let admin: Client;
let smtpPort = 0;

before(async () => {
  const mod = await import('../index.ts');
  await new Promise<void>((resolve) => mod.server.listen(0, resolve));
  const addr = mod.server.address();
  base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;
  close = () =>
    new Promise((resolve) => {
      mod.smtp?.close(() => undefined);
      mod.server.close(() => resolve());
    });
  // The built-in mail reception listens on a free port.
  for (let i = 0; i < 50 && !smtpPort; i++) {
    const address = mod.smtp?.server.address();
    if (address && typeof address === 'object') smtpPort = address.port;
    else await new Promise((r) => setTimeout(r, 20));
  }
  alice = await Client.register('Alice', { profile: 'student', city: 'tel-aviv' });
  bob = await Client.register('Bob', { profile: 'medical', city: 'netanya' });
  admin = await Client.register('Admin');
});

after(async () => {
  await close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('registration auto-joins welcome, events, city and profile groups', async () => {
  const { chats } = await alice.get<{ chats: Chat[] }>('/api/chats');
  const names = chats.map((c) => c.name);
  assert.ok(names.includes('Bienvenue & Entraide'));
  assert.ok(names.includes('Événements & Sorties'));
  assert.ok(names.includes('Tel Aviv'));
  assert.ok(names.includes('Étudiants'));
  assert.ok(chats.every((c) => c.isMember));
  // The welcome message is pinned but does not count as unread for a newcomer.
  assert.equal(chats.find((c) => c.name === 'Tel Aviv')!.unread, 0);
  assert.equal(admin.me.isAdmin, true);
  assert.equal(alice.me.isAdmin, false);
});

test('auth: duplicate email, bad password, session required', async () => {
  await new Client().post('/api/auth/register', { email: 'alice@example.com', password: 'password123', name: 'Dup', world: 'fr' }, 409);
  await new Client().post('/api/auth/login', { email: 'alice@example.com', password: 'nope-nope' }, 401);
  await new Client().get('/api/chats', 401);
  const again = new Client();
  const r = await again.post<{ me: Me }>('/api/auth/login', { email: 'ALICE@example.com', password: 'password123' });
  assert.equal(r.me.id, alice.me.id);
  await again.post('/api/auth/logout');
  await again.get('/api/chats', 401);
});

test('every world is seeded with city, profile, sport and event groups', async () => {
  for (const world of ['fr', 'en', 'es', 'ru']) {
    const r = await alice.get<{ groups: Chat[]; communities: Community[] }>(`/api/explore?world=${world}`);
    assert.equal(r.communities.length, 4, world);
    const cats = new Set(r.groups.map((g) => g.category));
    for (const c of ['city', 'profile', 'sport', 'event', 'general']) {
      const one = await alice.get<{ groups: Chat[] }>(`/api/explore?world=${world}&category=${c}`);
      assert.ok(one.groups.length > 0, `${world}/${c}`);
    }
    assert.ok(cats.size >= 3);
  }
  const cities = await alice.get<{ groups: Chat[] }>('/api/explore?world=ru&category=city&q=Хайфа');
  assert.equal(cities.groups.length, 1);
});

test('public groups: read without joining, join without limit, post only as member', async () => {
  const { chat } = await alice.post<{ chat: Chat }>('/api/chats', { name: 'Surf à Herzliya', description: 'Vagues', emoji: '🏄', category: 'sport' }, 201);
  assert.equal(chat.role, 'owner');
  assert.equal(chat.memberCount, 1);
  await alice.post(`/api/chats/${chat.id}/messages`, { text: 'Premier message' }, 201);

  // Bob is not a member: he can read…
  const peek = await bob.get<{ messages: Message[] }>(`/api/chats/${chat.id}/messages`);
  assert.ok(peek.messages.some((m) => m.text === 'Premier message'));
  // …but not write.
  await bob.post(`/api/chats/${chat.id}/messages`, { text: 'Coucou' }, 403);

  // Joining through the public invite link.
  const preview = await new Client().get<{ kind: string; chat: Chat }>(`/api/invite/${chat.inviteCode}`);
  assert.equal(preview.chat.name, 'Surf à Herzliya');
  assert.equal(preview.chat.isMember, false);
  const joined = await bob.post<{ chat: Chat }>(`/api/invite/${chat.inviteCode}/join`);
  assert.equal(joined.chat.isMember, true);
  assert.equal(joined.chat.memberCount, 2);
  await bob.post(`/api/chats/${chat.id}/messages`, { text: 'Coucou' }, 201);

  // Resetting the link invalidates the old one.
  const reset = await alice.post<{ chat: Chat }>(`/api/chats/${chat.id}/invite/reset`);
  assert.notEqual(reset.chat.inviteCode, chat.inviteCode);
  await bob.get(`/api/invite/${chat.inviteCode}`, 404);
  await bob.post(`/api/chats/${chat.id}/invite/reset`, {}, 403);
});

test('messaging: realtime delivery, reply, edit, reactions, pin, star, forward, delete', async () => {
  const { chat } = await alice.post<{ chat: Chat }>('/api/chats', { name: 'Test messagerie' }, 201);
  await bob.post(`/api/chats/${chat.id}/join`);
  const bobSocket = await bob.socket();
  try {
    const incoming = once<Message>(bobSocket, 'message:new');
    const { message: first } = await alice.post<{ message: Message }>(`/api/chats/${chat.id}/messages`, { text: 'Shalom *tout le monde* @bob' }, 201);
    const got = await incoming;
    assert.equal(got.id, first.id);
    assert.deepEqual(got.mentions, [bob.me.id]);

    let list = await bob.get<{ chats: Chat[] }>('/api/chats');
    assert.equal(list.chats.find((c) => c.id === chat.id)!.unread, 1);
    await bob.post(`/api/chats/${chat.id}/read`, { messageId: first.id });
    list = await bob.get<{ chats: Chat[] }>('/api/chats');
    assert.equal(list.chats.find((c) => c.id === chat.id)!.unread, 0);

    // reply
    const { message: reply } = await bob.post<{ message: Message }>(`/api/chats/${chat.id}/messages`, { text: 'Shalom !', replyToId: first.id }, 201);
    assert.equal(reply.replyTo?.id, first.id);

    // edit (only by the author)
    await bob.patch(`/api/messages/${first.id}`, { text: 'pirate' }, 403);
    const patched = once<{ id: number; patch: { text: string } }>(bobSocket, 'message:patch');
    await alice.patch(`/api/messages/${first.id}`, { text: 'Shalom à tous' });
    assert.equal((await patched).patch.text, 'Shalom à tous');

    // reactions
    const reacted = once<{ reactions: { emoji: string; count: number }[] }>(bobSocket, 'message:reaction');
    await alice.post(`/api/messages/${reply.id}/react`, { emoji: '❤️' });
    assert.deepEqual((await reacted).reactions, [{ emoji: '❤️', count: 1 }]);
    await bob.post(`/api/messages/${reply.id}/react`, { emoji: '❤️' });

    // pin: admins only by default
    await bob.post(`/api/messages/${first.id}/pin`, { pinned: true }, 403);
    await alice.post(`/api/messages/${first.id}/pin`, { pinned: true });
    const pins = await bob.get<{ messages: Message[] }>(`/api/chats/${chat.id}/pins`);
    assert.deepEqual(pins.messages.map((m) => m.id), [first.id]);
    await alice.patch(`/api/chats/${chat.id}`, { pinPolicy: 'all' });
    await bob.post(`/api/messages/${reply.id}/pin`, { pinned: true });

    // star + history flags
    await bob.post(`/api/messages/${first.id}/star`, { starred: true });
    const history = await bob.get<{ messages: Message[] }>(`/api/chats/${chat.id}/messages`);
    const h1 = history.messages.find((m) => m.id === first.id)!;
    const h2 = history.messages.find((m) => m.id === reply.id)!;
    assert.equal(h1.starred, true);
    assert.equal(h1.text, 'Shalom à tous');
    assert.ok(h1.editedAt);
    assert.deepEqual(h2.reactions, [{ emoji: '❤️', count: 2, mine: true }]);
    const starred = await bob.get<{ messages: Message[] }>('/api/starred');
    assert.equal(starred.messages.length, 1);

    // search
    const search = await bob.get<{ messages: Message[] }>(`/api/chats/${chat.id}/search?q=shalom`);
    assert.equal(search.messages.length, 2);

    // forward to another group
    const { chat: other } = await bob.post<{ chat: Chat }>('/api/chats', { name: 'Autre groupe' }, 201);
    await bob.post(`/api/messages/${first.id}/forward`, { chatIds: [other.id] });
    const otherHistory = await bob.get<{ messages: Message[] }>(`/api/chats/${other.id}/messages`);
    assert.equal(otherHistory.messages.at(-1)!.forwarded, true);
    // The server cannot write into an encrypted conversation: the device does it, re-encrypted.
    const dm = await bob.post<{ chat: Chat }>('/api/dm', { userId: alice.me.id });
    await bob.post(`/api/messages/${first.id}/forward`, { chatIds: [dm.chat.id] }, 400);
    await bob.post(`/api/chats/${dm.chat.id}/messages`, { enc: ENC('transféré'), forwarded: true }, 201);
    const dmHistory = await alice.get<{ messages: Message[] }>(`/api/chats/${dm.chat.id}/messages`);
    assert.equal(dmHistory.messages[0]!.forwarded, true);
    // DMs are private.
    await admin.get(`/api/chats/${dm.chat.id}/messages`, 403);

    // delete for me / for everyone
    await bob.del(`/api/messages/${first.id}?scope=me`);
    const afterHide = await bob.get<{ messages: Message[] }>(`/api/chats/${chat.id}/messages`);
    assert.ok(!afterHide.messages.some((m) => m.id === first.id));
    await bob.del(`/api/messages/${first.id}?scope=all`, 403);
    await alice.del(`/api/messages/${reply.id}?scope=all`); // group admin may delete anyone's message
    const afterDelete = await alice.get<{ messages: Message[] }>(`/api/chats/${chat.id}/messages`);
    const gone = afterDelete.messages.find((m) => m.id === reply.id)!;
    assert.equal(gone.deleted, true);
    assert.equal(gone.text, '');

    // "@name." at the end of a sentence still mentions @name
    const { message: dotted } = await alice.post<{ message: Message }>(`/api/chats/${chat.id}/messages`, { text: 'Merci @bob.' }, 201);
    assert.deepEqual(dotted.mentions, [bob.me.id]);
  } finally {
    bobSocket.close();
  }
});

test('announcement mode: only admins can post', async () => {
  const { chat } = await alice.post<{ chat: Chat }>('/api/chats', { name: 'Annonces test' }, 201);
  await bob.post(`/api/chats/${chat.id}/join`);
  await alice.patch(`/api/chats/${chat.id}`, { sendPolicy: 'admins' });
  await bob.post(`/api/chats/${chat.id}/messages`, { text: 'non' }, 403);
  await alice.patch(`/api/chats/${chat.id}/members/${bob.me.id}`, { role: 'admin' });
  await bob.post(`/api/chats/${chat.id}/messages`, { text: 'oui' }, 201);
  // members list shows roles; removing a member works
  const members = await alice.get<{ members: { user: { id: number }; role: string }[] }>(`/api/chats/${chat.id}/members`);
  assert.deepEqual(members.members.map((m) => m.role), ['owner', 'admin']);
  await alice.del(`/api/chats/${chat.id}/members/${bob.me.id}`);
  const again = await bob.get<{ chat: Chat }>(`/api/chats/${chat.id}`);
  assert.equal(again.chat.isMember, false);
});

test('polls and events', async () => {
  const { chat } = await alice.post<{ chat: Chat }>('/api/chats', { name: 'Sorties test', category: 'event' }, 201);
  await bob.post(`/api/chats/${chat.id}/join`);
  const { message: poll } = await alice.post<{ message: Message }>(
    `/api/chats/${chat.id}/messages`,
    { poll: { question: 'Quel jour ?', options: ['Jeudi', 'Vendredi', 'Samedi soir'], multiple: false } },
    201,
  );
  assert.equal(poll.type, 'poll');
  await bob.post(`/api/messages/${poll.id}/vote`, { options: [0, 1] }, 400);
  await bob.post(`/api/messages/${poll.id}/vote`, { options: [1] });
  await alice.post(`/api/messages/${poll.id}/vote`, { options: [1] });
  await alice.post(`/api/messages/${poll.id}/vote`, { options: [2] }); // changing one's vote
  const history = await bob.get<{ messages: Message[] }>(`/api/chats/${chat.id}/messages`);
  const p = history.messages.find((m) => m.id === poll.id)!.poll!;
  assert.deepEqual(p.counts, [0, 1, 1]);
  assert.deepEqual(p.myVotes, [1]);
  assert.equal(p.voters, 2);

  const startsAt = Date.now() + 86_400_000;
  const { message: ev } = await alice.post<{ message: Message }>(
    `/api/chats/${chat.id}/events`,
    { title: 'Apéro sur la plage', location: 'Gordon Beach', startsAt },
    201,
  );
  assert.equal(ev.event!.going, 1);
  // Answering "going" from outside the group joins it.
  const r = await admin.post<{ event: { going: number; myStatus: string } }>(`/api/events/${ev.event!.id}/rsvp`, { status: 'going' });
  assert.equal(r.event.going, 2);
  assert.equal((await admin.get<{ chat: Chat }>(`/api/chats/${chat.id}`)).chat.isMember, true);
  const upcoming = await bob.get<{ events: { title: string }[] }>('/api/events?world=fr');
  assert.ok(upcoming.events.some((e) => e.title === 'Apéro sur la plage'));
  await alice.post(`/api/chats/${chat.id}/events`, { title: 'Trop tard', startsAt: Date.now() - 86_400_000 }, 400);
});

test('communities: create, announcement group, join', async () => {
  const { community } = await alice.post<{ community: Community }>(
    '/api/communities',
    { name: 'Francophones de Tel Aviv', description: 'La communauté', announcementName: 'Annonces' },
    201,
  );
  assert.equal(community.groups!.length, 1);
  assert.equal(community.groups![0]!.isAnnouncement, true);
  assert.equal(community.groups![0]!.sendPolicy, 'admins');
  const { chat } = await alice.post<{ chat: Chat }>('/api/chats', { name: 'Sous-groupe', communityId: community.id }, 201);
  assert.equal(chat.communityId, community.id);
  await bob.post('/api/chats', { name: 'Intrus', communityId: community.id }, 403);

  // Joining one group of a community brings the community and its announcements along.
  await admin.post(`/api/chats/${chat.id}/join`);
  const viaGroup = await admin.get<{ community: Community }>(`/api/communities/${community.id}`);
  assert.equal(viaGroup.community.isMember, true);
  assert.equal(viaGroup.community.groups!.find((g) => g.isAnnouncement)!.isMember, true);
  await admin.post(`/api/communities/${community.id}/leave`);

  const joined = await bob.post<{ kind: string; community: Community }>(`/api/invite/${community.inviteCode}/join`);
  assert.equal(joined.community.isMember, true);
  assert.equal(joined.community.memberCount, 2);
  const full = await bob.get<{ community: Community }>(`/api/communities/${community.id}`);
  assert.equal(full.community.groups!.length, 2);
  assert.equal(full.community.groups!.find((g) => g.isAnnouncement)!.isMember, true);
});

test('stories: publish, feed, views are visible to the author only', async () => {
  await alice.post('/api/stories', { text: 'Premier jour d’oulpan !', bg: 'linear-gradient(135deg,#2F6BFF,#12A594)' }, 201);
  await alice.post('/api/stories', {}, 400);
  await alice.post('/api/stories', { text: 'x', bg: 'url(https://evil.example/track.gif)' }, 400);
  const feed = await bob.get<{ groups: StoryGroup[] }>('/api/stories');
  const group = feed.groups.find((g) => g.user.id === alice.me.id)!;
  assert.equal(group.stories.length, 1);
  assert.equal(group.allViewed, false);
  await bob.post(`/api/stories/${group.stories[0]!.id}/view`);
  const mine = await alice.get<{ groups: StoryGroup[] }>('/api/stories');
  assert.equal(mine.groups[0]!.user.id, alice.me.id);
  assert.equal(mine.groups[0]!.stories[0]!.views, 1);
  const viewers = await alice.get<{ viewers: { id: number }[] }>(`/api/stories/${group.stories[0]!.id}/viewers`);
  assert.deepEqual(viewers.viewers.map((v) => v.id), [bob.me.id]);
  await bob.get(`/api/stories/${group.stories[0]!.id}/viewers`, 403);
});

test('direct messages, blocking and read receipts', async () => {
  const carol = await Client.register('Carol');
  const dm = await carol.post<{ chat: Chat }>('/api/dm', { userId: bob.me.id });
  assert.equal(dm.chat.type, 'dm');
  assert.equal(dm.chat.peer!.id, bob.me.id);
  const same = await bob.post<{ chat: Chat }>('/api/dm', { userId: carol.me.id });
  assert.equal(same.chat.id, dm.chat.id);
  const bobSocket = await bob.socket();
  try {
    const incoming = once<Message>(bobSocket, 'message:new');
    const { message } = await carol.post<{ message: Message }>(`/api/chats/${dm.chat.id}/messages`, { enc: ENC('Salut Bob') }, 201);
    assert.equal((await incoming).id, message.id);
    const carolSocket = await carol.socket();
    const read = once<{ lastReadId: number; userId: number }>(carolSocket, 'read');
    await bob.post(`/api/chats/${dm.chat.id}/read`, { messageId: message.id });
    assert.deepEqual(await read, { chatId: dm.chat.id, userId: bob.me.id, lastReadId: message.id });
    carolSocket.close();
  } finally {
    bobSocket.close();
  }
  await bob.post(`/api/users/${carol.me.id}/block`);
  await carol.post(`/api/chats/${dm.chat.id}/messages`, { enc: ENC('Tu es là ?') }, 403);
  await bob.del(`/api/users/${carol.me.id}/block`);
  await carol.post(`/api/chats/${dm.chat.id}/messages`, { enc: ENC('Tu es là ?') }, 201);
});

test('uploads: allowed types only, stored under a safe name, served inertly', async () => {
  const send = async (name: string, type: string, content: string) => {
    const form = new FormData();
    form.append('file', new Blob([content], { type }), name);
    return fetch(base + '/api/upload', { method: 'POST', body: form, headers: { Cookie: alice.cookie } });
  };
  const bad = await send('evil.html', 'text/html', '<script>alert(1)</script>');
  assert.equal(bad.status, 415);
  const ok = await send('../../photo.html', 'image/png', '<script>alert(1)</script>');
  assert.equal(ok.status, 201);
  const file = (await ok.json()) as { url: string; kind: string };
  assert.match(file.url, /^\/uploads\/[A-Za-z0-9_-]+\.png$/);
  const served = await fetch(base + file.url);
  assert.equal(served.headers.get('content-type'), 'image/png');
  assert.equal(served.headers.get('x-content-type-options'), 'nosniff');
  // An attachment must point at our own upload store.
  const { chat } = await alice.post<{ chat: Chat }>('/api/chats', { name: 'Photos test' }, 201);
  await alice.post(`/api/chats/${chat.id}/messages`, { attachment: { url: 'https://evil.example/x.png', name: 'x', size: 1, mime: 'image/png', kind: 'image' } }, 400);
  await alice.post(`/api/chats/${chat.id}/messages`, { attachment: { ...file, name: 'photo.png', size: 10, mime: 'image/png' } }, 201);
});

test('account: changing the password signs out other devices; a ban closes the account', async () => {
  const eve = await Client.register('Eve');
  const phone = new Client();
  await phone.post('/api/auth/login', { email: 'eve@example.com', password: 'password123' });
  await eve.patch('/api/me', { password: 'new-password-1', currentPassword: 'wrong' }, 403);
  await eve.patch('/api/me', { password: 'new-password-1', currentPassword: 'password123' });
  await eve.get('/api/chats'); // the device that changed it stays signed in
  await phone.get('/api/chats', 401);
  await new Client().post('/api/auth/login', { email: 'eve@example.com', password: 'password123' }, 401);

  await alice.post('/api/reports', { targetType: 'user', targetId: eve.me.id, reason: 'harassment' }, 201);
  const { reports } = await admin.get<{ reports: { id: number; targetType: string; targetId: number }[] }>('/api/admin/reports');
  const report = reports.find((r) => r.targetType === 'user' && r.targetId === eve.me.id)!;
  await admin.post(`/api/admin/reports/${report.id}`, { action: 'ban' });
  await eve.get('/api/chats', 401);
  await new Client().post('/api/auth/login', { email: 'eve@example.com', password: 'new-password-1' }, 403);
});

test('moderation: reports are visible to platform admins only', async () => {
  const { chat } = await alice.post<{ chat: Chat }>('/api/chats', { name: 'Modération test' }, 201);
  await bob.post(`/api/chats/${chat.id}/join`);
  const { message } = await bob.post<{ message: Message }>(`/api/chats/${chat.id}/messages`, { text: 'Achetez mes cryptos !!!' }, 201);
  await alice.post('/api/reports', { targetType: 'message', targetId: message.id, reason: 'spam' }, 201);
  await alice.get('/api/admin/reports', 403);
  const { reports } = await admin.get<{ reports: { id: number; excerpt: string; status: string }[] }>('/api/admin/reports');
  const report = reports.find((r) => r.excerpt === 'Achetez mes cryptos !!!')!;
  assert.equal(report.status, 'open');
  await admin.post(`/api/admin/reports/${report.id}`, { action: 'remove' });
  const history = await alice.get<{ messages: Message[] }>(`/api/chats/${chat.id}/messages`);
  assert.equal(history.messages.find((m) => m.id === message.id)!.deleted, true);
});

test('worlds: one inbox, explore and creation follow the current world', async () => {
  const dave = await Client.register('Dave', { world: 'en', city: 'jerusalem', profile: 'legal' });
  let { chats } = await dave.get<{ chats: Chat[] }>('/api/chats');
  assert.ok(chats.every((c) => c.world === 'en'));
  assert.ok(chats.some((c) => c.name === 'Legal Professionals'));
  const before = chats.length;

  // Switching world keeps the conversations and does not join anything behind the user's back.
  const { me } = await dave.patch<{ me: Me }>('/api/me', { world: 'es' });
  assert.equal(me.world, 'es');
  ({ chats } = await dave.get<{ chats: Chat[] }>('/api/chats'));
  assert.equal(chats.length, before);

  // Explore now shows the Spanish-speaking world; joining there adds to the same inbox.
  const explore = await dave.get<{ groups: Chat[] }>('/api/explore?category=city&q=Jerusal');
  assert.equal(explore.groups[0]!.name, 'Jerusalén');
  await dave.post(`/api/chats/${explore.groups[0]!.id}/join`);
  ({ chats } = await dave.get<{ chats: Chat[] }>('/api/chats'));
  assert.ok(chats.some((c) => c.world === 'es' && c.name === 'Jerusalén'));
  assert.ok(chats.some((c) => c.world === 'en' && c.name === 'Jerusalem'));

  // A new group is created in the current world.
  const { chat } = await dave.post<{ chat: Chat }>('/api/chats', { name: 'Mate y charla' }, 201);
  assert.equal(chat.world, 'es');
});

test('mobile apps: token sessions instead of cookies, for the API and the realtime channel', async () => {
  const res = await fetch(base + '/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-OlimTalk-Client': 'app', Origin: 'capacitor://localhost' },
    body: JSON.stringify({ email: 'mobile@example.com', password: 'password123', name: 'Mobile', world: 'fr', city: 'haifa' }),
  });
  assert.equal(res.status, 201);
  assert.equal(res.headers.get('set-cookie'), null, 'the app never receives a cookie');
  assert.equal(res.headers.get('access-control-allow-origin'), 'capacitor://localhost');
  assert.equal(res.headers.get('access-control-allow-credentials'), null);
  const { me, token } = (await res.json()) as { me: Me; token: string };
  assert.ok(token.length > 30);

  const app = new Client();
  app.token = token;
  const { chats } = await app.get<{ chats: Chat[] }>('/api/chats');
  assert.ok(chats.some((c) => c.name === 'Haïfa'));
  await new Client().get('/api/chats', 401);
  const forged = new Client();
  forged.token = token.slice(0, -2) + 'xx';
  await forged.get('/api/chats', 401);

  // The website keeps its httpOnly cookie and never sees a token.
  const web = (await (
    await fetch(base + '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'mobile@example.com', password: 'password123' }),
    })
  ).json()) as { token?: string };
  assert.equal(web.token, undefined);

  // realtime with the token in the handshake
  const socket = await new Promise<Socket>((resolve, reject) => {
    const s = ioClient(base, { auth: { token }, transports: ['websocket'] });
    s.on('connect', () => resolve(s));
    s.on('connect_error', reject);
  });
  try {
    const haifa = chats.find((c) => c.name === 'Haïfa')!;
    await alice.post(`/api/chats/${haifa.id}/join`);
    const incoming = once<Message>(socket, 'message:new');
    await alice.post(`/api/chats/${haifa.id}/messages`, { text: 'Shalom Haïfa' }, 201);
    assert.equal((await incoming).text, 'Shalom Haïfa');
  } finally {
    socket.close();
  }
  await assert.rejects(
    new Promise((resolve, reject) => {
      const s = ioClient(base, { auth: { token: 'nope' }, transports: ['websocket'], reconnection: false });
      s.on('connect', () => resolve(undefined));
      s.on('connect_error', reject);
    }),
  );

  // logging out invalidates the token
  await app.post('/api/auth/logout');
  await app.get('/api/chats', 401);
  assert.equal(me.name, 'Mobile');
});

test('login attempts are limited per account', async () => {
  await Client.register('Heidi');
  for (let i = 0; i < 10; i++) await new Client().post('/api/auth/login', { email: 'heidi@example.com', password: 'guess-' + i }, 401);
  await new Client().post('/api/auth/login', { email: 'heidi@example.com', password: 'password123' }, 429);
});

test('mobile apps: cross-origin access is limited to the app origins', async () => {
  const preflight = (origin: string) =>
    fetch(base + '/api/chats', {
      method: 'OPTIONS',
      headers: { Origin: origin, 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'authorization' },
    });
  for (const origin of ['capacitor://localhost', 'https://localhost']) {
    const ok = await preflight(origin);
    assert.equal(ok.status, 204);
    assert.equal(ok.headers.get('access-control-allow-origin'), origin);
    assert.match(ok.headers.get('access-control-allow-headers') ?? '', /Authorization/);
  }
  const evil = await preflight('https://evil.example');
  assert.equal(evil.headers.get('access-control-allow-origin'), null);
  // Uploaded media must be displayable from the app.
  const form = new FormData();
  form.append('file', new Blob(['x'], { type: 'image/png' }), 'a.png');
  const up = (await (await fetch(base + '/api/upload', { method: 'POST', body: form, headers: { Cookie: alice.cookie } })).json()) as { url: string };
  const img = await fetch(base + up.url, { headers: { Origin: 'capacitor://localhost' } });
  assert.equal(img.headers.get('cross-origin-resource-policy'), 'cross-origin');
});

test('account deletion removes the person and their content, and keeps their groups alive', async () => {
  const frank = await Client.register('Frank');
  const grace = await Client.register('Grace');
  const { chat } = await frank.post<{ chat: Chat }>('/api/chats', { name: 'Groupe de Frank' }, 201);
  await grace.post(`/api/chats/${chat.id}/join`);
  await frank.post(`/api/chats/${chat.id}/messages`, { text: 'Message de Frank' }, 201);
  await grace.post(`/api/chats/${chat.id}/messages`, { text: 'Message de Grace' }, 201);
  const dm = await frank.post<{ chat: Chat }>('/api/dm', { userId: grace.me.id });
  await frank.post(`/api/chats/${dm.chat.id}/messages`, { enc: ENC('privé') }, 201);
  await frank.post('/api/stories', { text: 'story de Frank' }, 201);
  // an uploaded photo that only Frank uses
  const form = new FormData();
  form.append('file', new Blob(['frank'], { type: 'image/png' }), 'frank.png');
  const file = (await (await fetch(base + '/api/upload', { method: 'POST', body: form, headers: { Cookie: frank.cookie } })).json()) as {
    url: string;
    name: string;
    size: number;
    mime: string;
    kind: string;
  };
  await frank.post(`/api/chats/${chat.id}/messages`, { attachment: file }, 201);
  assert.equal((await fetch(base + file.url)).status, 200);

  await frank.post('/api/me/delete', { password: 'wrong-password' }, 403);
  await frank.post('/api/me/delete', { password: 'password123' });

  await frank.get('/api/chats', 401);
  await new Client().post('/api/auth/login', { email: 'frank@example.com', password: 'password123' }, 401);
  await grace.get(`/api/users/${frank.me.id}`, 404);

  const after = await grace.get<{ chat: Chat }>(`/api/chats/${chat.id}`);
  assert.equal(after.chat.memberCount, 1);
  assert.equal(after.chat.role, 'owner', 'the remaining member inherits the group');
  const history = await grace.get<{ messages: Message[] }>(`/api/chats/${chat.id}/messages`);
  assert.deepEqual(history.messages.map((m) => m.text), ['Message de Grace']);
  const { chats } = await grace.get<{ chats: Chat[] }>('/api/chats');
  assert.ok(!chats.some((c) => c.id === dm.chat.id), 'the private conversation is gone');
  const stories = await grace.get<{ groups: StoryGroup[] }>('/api/stories');
  assert.ok(!stories.groups.some((g) => g.user.id === frank.me.id));
  // give the asynchronous file removal a moment
  await new Promise((r) => setTimeout(r, 150));
  assert.equal((await fetch(base + file.url)).status, 404, 'their uploaded files are removed');
  // the e-mail address is free again
  await Client.register('Frank');
});

test('deleting really erases: message text and file, expired stories and their media', async () => {
  const { chat } = await alice.post<{ chat: Chat }>('/api/chats', { name: 'Effacement test' }, 201);
  await bob.post(`/api/chats/${chat.id}/join`);
  const upload = async (who: Client, name: string) => {
    const form = new FormData();
    form.append('file', new Blob([name], { type: 'image/png' }), name);
    return (await (await fetch(base + '/api/upload', { method: 'POST', body: form, headers: { Cookie: who.cookie } })).json()) as {
      url: string;
      name: string;
      size: number;
      mime: string;
      kind: string;
    };
  };
  const photo = await upload(alice, 'secret.png');
  const { message } = await alice.post<{ message: Message }>(`/api/chats/${chat.id}/messages`, { text: 'à effacer', attachment: photo }, 201);
  // Bob forwards it: his copy must survive Alice's deletion, and keep the file alive.
  await bob.post(`/api/messages/${message.id}/forward`, { chatIds: [chat.id] });
  await alice.del(`/api/messages/${message.id}?scope=all`);
  await new Promise((r) => setTimeout(r, 120));
  assert.equal((await fetch(base + photo.url)).status, 200, 'still used by the forwarded copy');
  let history = await bob.get<{ messages: Message[] }>(`/api/chats/${chat.id}/messages`);
  const copy = history.messages.find((m) => m.forwarded)!;
  assert.equal(copy.attachment!.url, photo.url);
  await bob.del(`/api/messages/${copy.id}?scope=all`);
  await new Promise((r) => setTimeout(r, 120));
  assert.equal((await fetch(base + photo.url)).status, 404, 'no message uses the file any more');
  // Nothing of the deleted text is left in the database.
  const { db } = await import('../db.ts');
  const row = db.prepare('SELECT text, attachment, meta FROM messages WHERE id = ?').get(message.id) as { text: string; attachment: unknown; meta: unknown };
  assert.deepEqual({ ...row }, { text: '', attachment: null, meta: null });

  // An event disappears from the Events tab when its card is deleted.
  const { message: ev } = await alice.post<{ message: Message }>(`/api/chats/${chat.id}/events`, { title: 'Événement éphémère', startsAt: Date.now() + 3_600_000 }, 201);
  await alice.del(`/api/messages/${ev.id}?scope=all`);
  const events = await alice.get<{ events: { title: string }[] }>('/api/events?world=fr');
  assert.ok(!events.events.some((e) => e.title === 'Événement éphémère'));

  // Expired stories are purged together with their media.
  const media = await upload(alice, 'story.png');
  await alice.post('/api/stories', { media }, 201);
  const { purgeExpiredStories } = await import('../routes/community.ts');
  assert.equal(purgeExpiredStories(Date.now()), 0, 'nothing has expired yet');
  assert.ok(purgeExpiredStories(Date.now() + 25 * 3_600_000) >= 1);
  await new Promise((r) => setTimeout(r, 120));
  assert.equal((await fetch(base + media.url)).status, 404);
});

test('reports keep what was reported; private messages can only be reported by a participant', async () => {
  const { chat } = await alice.post<{ chat: Chat }>('/api/chats', { name: 'Signalement test' }, 201);
  await bob.post(`/api/chats/${chat.id}/join`);
  const { message } = await bob.post<{ message: Message }>(`/api/chats/${chat.id}/messages`, { text: 'insulte vite effacée' }, 201);
  await alice.post('/api/reports', { targetType: 'message', targetId: message.id, reason: 'harassment' }, 201);
  await bob.del(`/api/messages/${message.id}?scope=all`);
  const { reports } = await admin.get<{ reports: { targetId: number; targetType: string; excerpt: string }[] }>('/api/admin/reports');
  assert.equal(reports.find((r) => r.targetType === 'message' && r.targetId === message.id)!.excerpt, '🚫 insulte vite effacée');

  const dm = await alice.post<{ chat: Chat }>('/api/dm', { userId: bob.me.id });
  const { message: secret } = await alice.post<{ message: Message }>(`/api/chats/${dm.chat.id}/messages`, { enc: ENC('confidentiel') }, 201);
  await admin.post('/api/reports', { targetType: 'message', targetId: secret.id, reason: 'other' }, 403);
  // The server cannot read it: the reporter chooses to disclose what their device decrypted.
  await bob.post('/api/reports', { targetType: 'message', targetId: secret.id, reason: 'other', evidence: 'texte déchiffré par Bob' }, 201);
  const again = await admin.get<{ reports: { targetId: number; targetType: string; excerpt: string }[] }>('/api/admin/reports');
  assert.equal(again.reports.find((r) => r.targetType === 'message' && r.targetId === secret.id)!.excerpt, '🔒 texte déchiffré par Bob');
});

test('store requirements: public privacy policy, terms and app links', async () => {
  for (const path of ['/privacy', '/terms']) {
    const res = await fetch(base + path);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') ?? '', /text\/html/);
    const html = await res.text();
    assert.match(html, /OlimTalk/);
    assert.match(html, /LEGAL_OPERATOR/, 'says so when the operator has not been filled in');
  }
  const config = (await (await fetch(base + '/api/config')).json()) as { appStoreUrl: string | null; playStoreUrl: string | null };
  assert.deepEqual([config.appStoreUrl, config.playStoreUrl], [null, null]);
});

// ───────────────────────── data protection ─────────────────────────

/** A client that does what the apps do: real keys, real encryption, password never sent. */
async function secureClient(name: string) {
  const email = `${name.toLowerCase()}@example.com`;
  const secrets = await deriveSecrets(email, 'mot de passe de ' + name, 1000);
  const identity = await generateIdentity();
  const c = new Client();
  const r = await c.post<{ me: Me }>(
    '/api/auth/register',
    { email, password: secrets.authKey, name, world: 'fr', publicKey: identity.publicKey, encryptedPrivateKey: await wrapPrivateKey(identity.privateKey, secrets.wrapKey) },
    201,
  );
  c.me = r.me;
  return { c, email, secrets, identity };
}

test('end-to-end encryption: the server stores and relays private messages it cannot read', async () => {
  const ivan = await secureClient('Ivan');
  const judy = await secureClient('Judy');
  assert.equal(ivan.c.me.publicKey, ivan.identity.publicKey);

  // Judy gets Ivan's public key from the server, and nothing else.
  const dm = await judy.c.post<{ chat: Chat }>('/api/dm', { userId: ivan.c.me.id });
  assert.equal(dm.chat.peer!.publicKey, ivan.identity.publicKey);

  // Plaintext is refused in a private conversation, in every form.
  await judy.c.post(`/api/chats/${dm.chat.id}/messages`, { text: 'en clair' }, 400);
  await judy.c.post(`/api/chats/${dm.chat.id}/messages`, { enc: ENC('x'), text: 'et du clair à côté' }, 400);
  await judy.c.post(`/api/chats/${dm.chat.id}/messages`, { poll: { question: 'Q ?', options: ['a', 'b'] } }, 400);
  await judy.c.post(
    `/api/chats/${dm.chat.id}/messages`,
    { enc: ENC('x'), attachment: { url: '/uploads/abc.png', name: 'photo.png', size: 3, mime: 'image/png', kind: 'image' } },
    400,
  );
  // …and ciphertext is refused in public groups.
  const { chat: group } = await judy.c.post<{ chat: Chat }>('/api/chats', { name: 'Groupe public de Judy' }, 201);
  await judy.c.post(`/api/chats/${group.id}/messages`, { enc: ENC('caché') }, 400);

  const ctx = { chatId: dm.chat.id, senderId: judy.c.me.id };
  const secretText = 'Mon numéro de teoudat zeout est 123456789';
  const enc = await encryptMessage(judy.identity.privateKey, judy.identity.publicKey, ivan.identity.publicKey, ctx, { text: secretText });
  const ivanSocket = await ivan.c.socket();
  try {
    const incoming = once<Message>(ivanSocket, 'message:new');
    const { message } = await judy.c.post<{ message: Message }>(`/api/chats/${dm.chat.id}/messages`, { enc }, 201);
    const live = await incoming;
    assert.equal(live.text, '');
    assert.deepEqual(await decryptMessage(ivan.identity.privateKey, ivan.identity.publicKey, false, ctx, live.enc!, [judy.identity.publicKey]), { text: secretText });

    // Nothing readable in the database, the history, the conversation list or the search.
    const { db } = await import('../db.ts');
    const dump = JSON.stringify(db.prepare('SELECT * FROM messages WHERE chat_id = ?').all(dm.chat.id));
    assert.ok(!dump.includes('teoudat') && !dump.includes('123456789'));
    const list = await ivan.c.get<{ chats: Chat[] }>('/api/chats');
    const preview = list.chats.find((c) => c.id === dm.chat.id)!.lastMessage!;
    assert.equal(preview.text, '');
    assert.equal(preview.encrypted, true);
    assert.deepEqual(await decryptMessage(ivan.identity.privateKey, ivan.identity.publicKey, false, ctx, preview.enc!, [judy.identity.publicKey]), { text: secretText });
    assert.deepEqual((await ivan.c.get<{ messages: Message[] }>(`/api/chats/${dm.chat.id}/search?q=teoudat`)).messages, []);

    // Editing replaces the ciphertext.
    const edited = await encryptMessage(judy.identity.privateKey, judy.identity.publicKey, ivan.identity.publicKey, ctx, { text: 'corrigé' });
    const patched = once<{ patch: { enc: string } }>(ivanSocket, 'message:patch');
    await judy.c.patch(`/api/messages/${message.id}`, { text: 'en clair' }, 400);
    await judy.c.patch(`/api/messages/${message.id}`, { enc: edited });
    assert.deepEqual(await decryptMessage(ivan.identity.privateKey, ivan.identity.publicKey, false, ctx, (await patched).patch.enc, [judy.identity.publicKey]), { text: 'corrigé' });

    // The server cannot forward what it cannot read.
    await ivan.c.post(`/api/messages/${message.id}/forward`, { chatIds: [group.id] }, 400);

    // Deleting erases the ciphertext too.
    await judy.c.del(`/api/messages/${message.id}?scope=all`);
    assert.equal((db.prepare('SELECT enc FROM messages WHERE id = ?').get(message.id) as { enc: string | null }).enc, null);
  } finally {
    ivanSocket.close();
  }
});

test('keys follow the person to a new device with the password, and only with it', async () => {
  const kate = await secureClient('Kate');
  // New device: log in with the derived key (the password itself never travels)…
  const phone = new Client();
  await phone.post('/api/auth/login', { email: kate.email, password: 'mot de passe de Kate' }, 401);
  await phone.post('/api/auth/login', { email: kate.email, password: kate.secrets.authKey });
  // …fetch the wrapped private key, and unwrap it locally.
  const keys = await phone.get<{ publicKey: string; encryptedPrivateKey: string }>('/api/me/keys');
  assert.equal(keys.publicKey, kate.identity.publicKey);
  await unwrapPrivateKey(keys.encryptedPrivateKey, kate.secrets.wrapKey);
  const wrong = await deriveSecrets(kate.email, 'mauvais mot de passe', 1000);
  await assert.rejects(unwrapPrivateKey(keys.encryptedPrivateKey, wrong.wrapKey));
  // The authentication key alone (all the server ever sees) unwraps nothing.
  assert.ok(!keys.encryptedPrivateKey.includes(kate.secrets.authKey));

  // Changing the password must come with the key re-wrapped for the new one.
  const next = await deriveSecrets(kate.email, 'nouveau mot de passe', 1000);
  await kate.c.patch('/api/me', { password: next.authKey, currentPassword: kate.secrets.authKey }, 400);
  await kate.c.put('/api/me/vault', { vault: 'ancien-coffre-chiffre' });
  await kate.c.patch('/api/me', {
    password: next.authKey,
    currentPassword: kate.secrets.authKey,
    encryptedPrivateKey: await wrapPrivateKey(kate.identity.privateKey, next.wrapKey),
    vault: 'coffre-rechiffre',
  });
  const after = await kate.c.get<{ encryptedPrivateKey: string }>('/api/me/keys');
  await unwrapPrivateKey(after.encryptedPrivateKey, next.wrapKey);
  await assert.rejects(unwrapPrivateKey(after.encryptedPrivateKey, kate.secrets.wrapKey), 'the old password opens nothing any more');
  assert.equal((await kate.c.get<{ vault: string }>('/api/me/vault')).vault, 'coffre-rechiffre');

  // Resetting the encryption publishes a new key and tells the people she talks to.
  const leo = await secureClient('Leo');
  const dm = await leo.c.post<{ chat: Chat }>('/api/dm', { userId: kate.c.me.id });
  const leoSocket = await leo.c.socket();
  try {
    const update = once<{ chatId: number }>(leoSocket, 'chat:update');
    const fresh = await generateIdentity();
    await kate.c.put('/api/me/keys', { publicKey: 'not-a-key', encryptedPrivateKey: after.encryptedPrivateKey }, 400);
    await kate.c.put('/api/me/keys', { publicKey: fresh.publicKey, encryptedPrivateKey: await wrapPrivateKey(fresh.privateKey, next.wrapKey) });
    assert.equal((await update).chatId, dm.chat.id);
    assert.equal((await leo.c.get<{ chat: Chat }>(`/api/chats/${dm.chat.id}`)).chat.peer!.publicKey, fresh.publicKey);
  } finally {
    leoSocket.close();
  }
});

test('connected devices can be listed and signed out', async () => {
  const mia = await Client.register('Mia');
  const login = async (ua: string) => {
    const c = new Client();
    const res = await fetch(base + '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': ua },
      body: JSON.stringify({ email: 'mia@example.com', password: 'password123' }),
    });
    c.cookie = res.headers.get('set-cookie')!.split(';')[0]!;
    return c;
  };
  const phone = await login('OlimTalk/1.0 (iPhone)');
  const { sessions } = await mia.get<{ sessions: { id: string; userAgent: string; current: boolean }[] }>('/api/me/sessions');
  assert.equal(sessions.length, 2);
  assert.equal(sessions.filter((s) => s.current).length, 1);
  const other = sessions.find((s) => !s.current)!;
  assert.equal(other.userAgent, 'OlimTalk/1.0 (iPhone)');
  await phone.get('/api/chats');
  await mia.del(`/api/me/sessions/${other.id}`);
  await phone.get('/api/chats', 401);
  await mia.get('/api/chats'); // the device that did it stays signed in
  await bob.del(`/api/me/sessions/${sessions.find((s) => s.current)!.id}`, 404); // not someone else's
});

test('privacy choices: hide when I am online, hide what I have read', async () => {
  const nina = await Client.register('Nina');
  const dm = await nina.post<{ chat: Chat }>('/api/dm', { userId: bob.me.id });
  const { message } = await bob.post<{ message: Message }>(`/api/chats/${dm.chat.id}/messages`, { enc: ENC('coucou') }, 201);
  const seen = async () => (await bob.get<{ chat: Chat }>(`/api/chats/${dm.chat.id}`)).chat;
  assert.ok((await seen()).peer!.lastSeen > 0);

  const { me } = await nina.patch<{ me: Me }>('/api/me', { hidePresence: true, noReceipts: true });
  assert.deepEqual([me.hidePresence, me.noReceipts], [true, true]);
  assert.ok(me.lastSeen > 0, 'she still sees her own data');
  const hidden = (await seen()).peer!;
  assert.deepEqual([hidden.lastSeen, hidden.online], [0, false]);

  const bobSocket = await bob.socket();
  try {
    let received = false;
    bobSocket.on('read', () => (received = true));
    await nina.post(`/api/chats/${dm.chat.id}/read`, { messageId: message.id });
    await new Promise((r) => setTimeout(r, 150));
    assert.equal(received, false, 'no read receipt is sent');
    assert.equal((await seen()).peerLastReadId, 0);
  } finally {
    bobSocket.close();
  }
});

// ───────────────────────── connections: calendar and mailbox ─────────────────────────

test('calendar: a private feed any agenda can subscribe to', async () => {
  const { chat } = await alice.post<{ chat: Chat }>('/api/chats', { name: 'Agenda test', category: 'event' }, 201);
  const startsAt = Date.UTC(2031, 4, 20, 17, 30);
  await alice.post(`/api/chats/${chat.id}/events`, { title: 'Soirée; jeux, pizzas', location: 'Rothschild 12, Tel Aviv', description: 'Ligne 1\nLigne 2', startsAt }, 201);
  const { url } = await alice.get<{ url: string }>('/api/me/calendar-feed');
  assert.match(url, /\/api\/cal\/[a-z0-9]{20}\.ics$/);
  assert.equal((await alice.get<{ url: string }>('/api/me/calendar-feed')).url, url, 'the address is stable');

  // No login: calendar apps fetch it as is.
  const res = await fetch(base + new URL(url).pathname);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type') ?? '', /text\/calendar/);
  const ics = await res.text();
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n') && ics.endsWith('END:VCALENDAR\r\n'));
  assert.ok(ics.includes('DTSTART:20310520T173000Z'));
  assert.ok(ics.includes('DTEND:20310520T193000Z'), 'two hours by default');
  assert.ok(ics.includes('SUMMARY:Soirée\\; jeux\\, pizzas'), 'special characters are escaped');
  assert.ok(ics.includes('LOCATION:Rothschild 12\\, Tel Aviv'));
  assert.ok(ics.includes('STATUS:CONFIRMED'));
  assert.ok(ics.split('\r\n').every((line) => Buffer.byteLength(line) <= 75), 'long lines are folded');
  // Someone who is not going does not get the event.
  const bobFeed = await bob.get<{ url: string }>('/api/me/calendar-feed');
  assert.ok(!(await (await fetch(base + new URL(bobFeed.url).pathname)).text()).includes('Soirée'));

  // A new address cuts off whoever had the old one.
  const fresh = await alice.post<{ url: string }>('/api/me/calendar-feed/reset');
  assert.notEqual(fresh.url, url);
  assert.equal((await fetch(base + new URL(url).pathname)).status, 404);
  assert.equal((await fetch(base + '/api/cal/unknown.ics')).status, 404);
});

test('calendar: reading an external agenda by its address, without becoming a way into private networks', async () => {
  const http = await import('node:http');
  const ICS = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:1\r\nDTSTART:20310101T100000Z\r\nSUMMARY:Rendez-vous banque\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n';
  const server = http.createServer((req, res) => {
    if (req.url === '/cal.ics') res.writeHead(200, { 'Content-Type': 'text/calendar' }).end(ICS);
    else if (req.url === '/moved') res.writeHead(302, { Location: '/cal.ics' }).end();
    else if (req.url === '/page') res.writeHead(200, { 'Content-Type': 'text/html' }).end('<html>pas un agenda</html>');
    else res.writeHead(404).end();
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    assert.equal((await alice.post<{ ics: string }>('/api/ics/fetch', { url: `${origin}/cal.ics` })).ics, ICS);
    assert.equal((await alice.post<{ ics: string }>('/api/ics/fetch', { url: `${origin}/moved` })).ics, ICS, 'redirections are followed');
    await alice.post('/api/ics/fetch', { url: `${origin}/page` }, 400);
    await alice.post('/api/ics/fetch', { url: `${origin}/missing` }, 400);
    await alice.post('/api/ics/fetch', { url: 'file:///etc/passwd' }, 400);
    await alice.post('/api/ics/fetch', { url: 'not a url' }, 400);
    await new Client().post('/api/ics/fetch', { url: `${origin}/cal.ics` }, 401);
  } finally {
    server.close();
  }
  // The rule that protects real deployments (switched off above only to reach the test server).
  const { isPrivateAddress } = await import('../routes/connect.ts');
  for (const a of ['127.0.0.1', '10.1.2.3', '172.16.0.9', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', '::', 'fe80::1', 'fd00::1', '::ffff:10.0.0.1', '::ffff:127.0.0.1', 'pas-une-adresse']) {
    assert.equal(isPrivateAddress(a), true, a);
  }
  for (const a of ['8.8.8.8', '142.250.74.14', '2a00:1450:4007:80e::200e', '::ffff:8.8.8.8']) assert.equal(isPrivateAddress(a), false, a);
});

test('mailbox: forwarded e-mails are sealed on arrival; only their owner can read them', async () => {
  const olga = await secureClient('Olga');
  const box = await olga.c.get<{ enabled: boolean; address: string }>('/api/me/mailbox');
  assert.equal(box.enabled, true);
  assert.match(box.address, /^[a-z0-9]{20}@in\.olimtalk\.test$/);

  // 1) Received over SMTP, the way a forwarding rule in Gmail or Outlook delivers it.
  const transport = nodemailer.createTransport({ host: '127.0.0.1', port: smtpPort, secure: false, ignoreTLS: true });
  const socket = await olga.c.socket();
  try {
    const arrived = once<{ id: number }>(socket, 'mail:new');
    await transport.sendMail({
      from: '"Misrad HaPnim" <noreply@piba.example>',
      to: box.address,
      subject: 'Convocation — renouvellement du passeport',
      text: 'Bonjour,\n\nVotre rendez-vous est fixé au 12 mars à 9h30.\n\nCordialement.',
      attachments: [{ filename: 'convocation.pdf', content: Buffer.from('%PDF-1.4 faux pdf'), contentType: 'application/pdf' }],
    });
    await arrived;
  } finally {
    socket.close();
  }
  // Unknown recipients are refused at the door.
  await assert.rejects(transport.sendMail({ from: 'a@b.example', to: 'aaaaaaaaaaaaaaaaaaaa@in.olimtalk.test', subject: 'x', text: 'x' }));
  await assert.rejects(transport.sendMail({ from: 'a@b.example', to: 'someone@elsewhere.example', subject: 'x', text: 'x' }), 'no relaying');

  // 2) Received over HTTP from an e-mail service.
  const raw = ['From: Banque <info@bank.example>', `To: ${box.address}`, 'Subject: =?UTF-8?B?UmVsZXbDqSBkZSBjb21wdGU=?=', 'Content-Type: text/html; charset=utf-8', '', '<p>Votre <b>relevé</b> est disponible.</p>'].join('\r\n');
  const post = (to: string, secret: string) => fetch(`${base}/api/inbound/email?to=${encodeURIComponent(to)}`, { method: 'POST', headers: { 'Content-Type': 'message/rfc822', 'X-Inbound-Secret': secret }, body: raw });
  assert.equal((await post(box.address, 'wrong-secret')).status, 404);
  assert.equal((await post('aaaaaaaaaaaaaaaaaaaa@in.olimtalk.test', 'test-inbound-secret')).status, 404);
  assert.equal((await post(box.address, 'test-inbound-secret')).status, 201);

  const { emails, unread } = await olga.c.get<{ emails: { id: number; header: string; body: string; read: boolean }[]; unread: number }>('/api/mail');
  assert.equal(emails.length, 2);
  assert.equal(unread, 2);
  // What the server holds is unreadable…
  const { db } = await import('../db.ts');
  const stored = JSON.stringify(db.prepare('SELECT * FROM emails WHERE user_id = ?').all(olga.c.me.id));
  assert.ok(!stored.includes('Convocation') && !stored.includes('piba') && !stored.includes('bank'));
  const bodyRes = await fetch(base + emails[1]!.body);
  const sealed = new Uint8Array(await bodyRes.arrayBuffer());
  assert.ok(!Buffer.from(sealed).toString('latin1').includes('rendez-vous'));
  assert.match(bodyRes.headers.get('content-disposition') ?? '', /attachment/);
  // …except by Olga, with her private key.
  const header = await unsealJson<{ from: { name: string; address: string }; subject: string; snippet: string; attachments: number }>(olga.identity.privateKey, emails[1]!.header);
  assert.deepEqual([header.from.name, header.subject, header.attachments], ['Misrad HaPnim', 'Convocation — renouvellement du passeport', 1]);
  const body = JSON.parse(new TextDecoder().decode(await unseal(olga.identity.privateKey, sealed))) as { text: string; attachments: { name: string; mime: string; data: string }[] };
  assert.ok(body.text.includes('12 mars à 9h30'));
  assert.equal(body.attachments[0]!.name, 'convocation.pdf');
  assert.equal(Buffer.from(fromBase64(body.attachments[0]!.data)).toString(), '%PDF-1.4 faux pdf');
  const html = await unsealJson<{ subject: string; snippet: string }>(olga.identity.privateKey, emails[0]!.header);
  assert.equal(html.subject, 'Relevé de compte');
  assert.match(html.snippet, /Votre \*?relevé\*? est disponible/i);
  const stranger = await generateIdentity();
  await assert.rejects(unsealJson(stranger.privateKey, emails[1]!.header));

  // Nobody else can list, mark or delete them.
  assert.equal((await bob.get<{ emails: unknown[] }>('/api/mail')).emails.length, 0);
  await bob.patch(`/api/mail/${emails[0]!.id}`, { read: true }, 404);
  await bob.del(`/api/mail/${emails[0]!.id}`, 404);
  await olga.c.patch(`/api/mail/${emails[0]!.id}`, { read: true });
  assert.equal((await olga.c.get<{ unread: number }>('/api/mail')).unread, 1);
  await olga.c.del(`/api/mail/${emails[1]!.id}`);
  await new Promise((r) => setTimeout(r, 120));
  assert.equal((await fetch(base + emails[1]!.body)).status, 404, 'the sealed file is erased with the e-mail');

  // A new address makes the old one bounce; an account without keys cannot receive.
  const fresh = await olga.c.post<{ address: string }>('/api/me/mailbox/reset');
  assert.notEqual(fresh.address, box.address);
  assert.equal((await post(box.address, 'test-inbound-secret')).status, 404);
  const noKeys = await alice.get<{ address: string }>('/api/me/mailbox');
  assert.equal((await post(noKeys.address, 'test-inbound-secret')).status, 422);
});

// ───────────────────────── automatic translation ─────────────────────────

test('translation: public messages are translated once per language; private ones only when their reader asks', async () => {
  // A stand-in for the Claude API: the real SDK talks to it.
  const calls: { path: string; beta: string; body: any }[] = [];
  const claude = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const body = JSON.parse(raw);
      calls.push({ path: req.url ?? '', beta: String(req.headers['anthropic-beta'] ?? ''), body });
      const text = /<message>\n([\s\S]*)\n<\/message>/.exec(body.messages[0].content)![1]!;
      const target = /into (\w+)\./.exec(body.system)![1]!;
      const refused = text.includes('INTERDIT');
      res.writeHead(200, { 'content-type': 'application/json' }).end(
        JSON.stringify({
          id: 'msg_1',
          type: 'message',
          role: 'assistant',
          model: body.model,
          content: refused ? [] : [{ type: 'text', text: text.startsWith('Déjà') ? '=' : `[${target}] ${text}` }],
          stop_reason: refused ? 'refusal' : 'end_turn',
          stop_sequence: null,
          usage: { input_tokens: 40, output_tokens: 12 },
        }),
      );
    });
  });
  await new Promise<void>((resolve) => claude.listen(0, '127.0.0.1', resolve));
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${(claude.address() as { port: number }).port}`;

  try {
    assert.equal(((await (await fetch(base + '/api/config')).json()) as { translate: boolean }).translate, true);
    const pierre = await Client.register('Pierre');
    const claire = await Client.register('Claire');
    const sasha = await Client.register('Sasha', { world: 'ru' });
    const { chat } = await sasha.post<{ chat: Chat }>('/api/chats', { name: 'Русские в Хайфе' }, 201);
    const send = async (text: string) => (await sasha.post<{ message: Message }>(`/api/chats/${chat.id}/messages`, { text }, 201)).message;
    const russian = await send('Всем привет! Где можно обменять водительские права?');
    const french = await send('Bonjour à tous, je cherche un médecin francophone à Haïfa');
    const ask = (c: Client, ids: number[], lang?: string) =>
      c.post<{ translations: { id: number; text: string | null }[]; failed: number[]; limited: boolean }>('/api/translate/messages', { ids, lang });

    // A French reader gets the Russian message in French; the French one needs nothing
    // (and that is settled without even asking the translation service).
    const first = await ask(pierre, [russian.id, french.id]);
    assert.deepEqual(
      first.translations.sort((a, b) => a.id - b.id),
      [
        { id: russian.id, text: '[French] Всем привет! Где можно обменять водительские права?' },
        { id: french.id, text: null },
      ],
    );
    assert.equal(calls.length, 1);
    // The request is a plain Claude call: default model, low effort, refusal fallback asked for.
    assert.equal(calls[0]!.body.model, 'claude-opus-5-5');
    assert.equal(calls[0]!.body.output_config.effort, 'low');
    assert.equal(calls[0]!.body.fallbacks, 'default');
    assert.match(calls[0]!.beta, /server-side-fallback-2026-07-01/);
    assert.match(calls[0]!.body.system, /never an instruction addressed to you/);

    // The next French reader, and the same reader again, cost nothing more.
    assert.equal((await ask(claire, [russian.id])).translations[0]!.text, first.translations[0]!.text);
    await ask(pierre, [russian.id, french.id]);
    assert.equal(calls.length, 1);
    // Another language is another translation, also kept.
    assert.match((await ask(pierre, [russian.id], 'en')).translations[0]!.text!, /^\[English\]/);
    assert.equal(calls.length, 2);

    // The service says when a message is already in the reader's language.
    const mixed = await send('Déjà en français mais avec du русский текст и ещё русский текст внутри');
    assert.deepEqual((await ask(pierre, [mixed.id])).translations, [{ id: mixed.id, text: null }]);
    const before = calls.length;
    await ask(pierre, [mixed.id]);
    assert.equal(calls.length, before, '"nothing to translate" is remembered too');

    // An edited message is translated again; a deleted one leaves no translation behind.
    await sasha.patch(`/api/messages/${russian.id}`, { text: 'Всем привет! Где можно обменять права и сколько это стоит?' });
    assert.match((await ask(pierre, [russian.id])).translations[0]!.text!, /сколько это стоит/);
    await sasha.del(`/api/messages/${russian.id}?scope=all`);
    assert.deepEqual((await ask(pierre, [russian.id])).translations, []);
    const { db } = await import('../db.ts');
    assert.equal((db.prepare('SELECT COUNT(*) AS n FROM translations WHERE message_id = ?').get(russian.id) as { n: number }).n, 0);

    // A message the service declines to handle is reported, not cached, and shown as it is.
    const declined = await send('Сообщение INTERDIT которое сервис отказывается переводить');
    assert.deepEqual((await ask(pierre, [declined.id])).failed, [declined.id]);
    assert.equal((db.prepare('SELECT COUNT(*) AS n FROM translations WHERE message_id = ?').get(declined.id) as { n: number }).n, 0);

    // Private messages: the server only holds ciphertext, so it has nothing to translate…
    const ivan = await secureClient('Igor');
    const lea = await secureClient('Lea');
    const dm = await lea.c.post<{ chat: Chat }>('/api/dm', { userId: ivan.c.me.id });
    const secret = await ivan.c.post<{ message: Message }>(`/api/chats/${dm.chat.id}/messages`, { enc: ENC('секрет') }, 201);
    assert.deepEqual((await ask(lea.c, [secret.message.id])).translations, []);
    assert.deepEqual((await ask(pierre, [secret.message.id])).translations, []);
    // …and a reader's device may send decrypted text only after that person switched it on.
    await lea.c.post('/api/translate/text', { text: 'Привет, как дела?' }, 403);
    const prefs = await lea.c.patch<{ me: Me }>('/api/me', { translatePrivate: true, autoTranslate: true, readLangs: ['en', 'he', 'en'] });
    assert.deepEqual([prefs.me.translatePrivate, prefs.me.autoTranslate, prefs.me.readLangs], [true, true, ['en', 'he']]);
    assert.equal((await lea.c.get<{ me: Me }>('/api/me')).me.autoTranslate, true);
    assert.equal(pierre.me.autoTranslate, null, 'nothing chosen yet');
    const stored = (db.prepare('SELECT COUNT(*) AS n FROM translations').get() as { n: number }).n;
    assert.deepEqual(await lea.c.post('/api/translate/text', { text: 'Привет, как дела?' }), { text: '[French] Привет, как дела?' });
    assert.equal((db.prepare('SELECT COUNT(*) AS n FROM translations').get() as { n: number }).n, stored, 'nothing about a private message is kept');
    await new Client().post('/api/translate/messages', { ids: [french.id] }, 401);

    // Each new translation costs the operator: one person cannot ask for an unlimited number.
    const greedy = await Client.register('Greedy');
    const many: number[] = [];
    for (let i = 0; i < 14; i++) many.push((await send(`Сообщение номер ${i}: где находится ближайшая поликлиника?`)).id);
    const flood = await ask(greedy, many);
    assert.equal(flood.limited, true);
    assert.equal(flood.translations.length, 12);
  } finally {
    await new Promise((resolve) => claude.close(resolve));
  }
});

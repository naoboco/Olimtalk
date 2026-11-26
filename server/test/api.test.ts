// End-to-end API tests: boots the real server on a random port with a throw-away database.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { io as ioClient, type Socket } from 'socket.io-client';
import type { Chat, Community, Me, Message, StoryGroup } from '../../shared/types.ts';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'olimtalk-test-'));
process.env.DATA_DIR = dir;
process.env.OLIMTALK_NO_LISTEN = '1';
process.env.ADMIN_EMAILS = 'admin@example.com';
process.env.AUTH_RATE_LIMIT = '1000';

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

let alice: Client;
let bob: Client;
let admin: Client;

before(async () => {
  const mod = await import('../index.ts');
  await new Promise<void>((resolve) => mod.server.listen(0, resolve));
  const addr = mod.server.address();
  base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;
  close = () => new Promise((resolve) => mod.server.close(() => resolve()));
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

    // forward into a DM
    const dm = await bob.post<{ chat: Chat }>('/api/dm', { userId: alice.me.id });
    await bob.post(`/api/messages/${first.id}/forward`, { chatIds: [dm.chat.id] });
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
    const { message } = await carol.post<{ message: Message }>(`/api/chats/${dm.chat.id}/messages`, { text: 'Salut Bob' }, 201);
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
  await carol.post(`/api/chats/${dm.chat.id}/messages`, { text: 'Tu es là ?' }, 403);
  await bob.del(`/api/users/${carol.me.id}/block`);
  await carol.post(`/api/chats/${dm.chat.id}/messages`, { text: 'Tu es là ?' }, 201);
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
  await frank.post(`/api/chats/${dm.chat.id}/messages`, { text: 'privé' }, 201);
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

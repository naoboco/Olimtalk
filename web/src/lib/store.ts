import { io, type Socket } from 'socket.io-client';
import { create } from 'zustand';
import type {
  Attachment,
  Chat,
  Lang,
  Me,
  Message,
  MessagePatchEvent,
  PollEvent,
  ReactionEvent,
  RsvpEvent,
  StoryGroup,
  UserPublic,
  World,
} from '../../../shared/types.ts';
import { ApiError, api } from './api.ts';
import {
  attachmentBlob,
  deriveSecrets,
  forgetKeys,
  hasKeys,
  loadVault,
  acknowledgeContactKey,
  noteContactKey,
  openEnvelope,
  resetKeys,
  restoreKeys,
  saveVault,
  sealMessage,
  setupKeys,
  uploadEncrypted,
  type AiSettings,
  type CalendarLink,
  type E2eState,
  type NewAccountKeys,
  type Secrets,
  type Vault,
} from './e2ee.ts';
import { detectLang, translate, type Key } from './i18n.ts';
import { API_ORIGIN, TOKEN_MODE, getToken, loadToken, saveToken } from './platform.ts';
import { autoTranslate, clearTranslationCache, refreshTranslations, type Translation } from './translate.ts';
import type { SharePayload } from './share.ts';

export type ClientMessage = Message & {
  pending?: boolean;
  failed?: boolean;
  /** For an encrypted message: whether this device could read it. */
  e2e?: E2eState;
};

export interface MsgState {
  items: ClientMessage[];
  hasOlder: boolean;
  hasNewer: boolean;
  loaded: boolean;
  loading: boolean;
}

export interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'error';
}

export type Theme = 'system' | 'light' | 'dark';

interface State {
  me: Me | null;
  ready: boolean;
  /** The apps: a session exists but the server could not be reached at start-up. */
  bootError: boolean;
  /** Public settings of the server: store links once the apps are published. */
  config: { appStoreUrl: string | null; playStoreUrl: string | null; contact: string | null; mail?: boolean; translate?: boolean } | null;
  /** Translations of messages into my language, by message id. */
  tr: Record<number, Translation>;
  /** 'locked': signed in, but this device does not hold the key that opens private messages. */
  e2e: 'ready' | 'locked';
  /** The person's own AI and calendars, decrypted from their vault. */
  ai: AiSettings | null;
  calendars: CalendarLink[];
  mailUnread: number;
  /** Contacts (by user id) whose security code changed and has not been looked at yet. */
  keyAlerts: Record<number, true>;
  lang: Lang;
  theme: Theme;
  connected: boolean;
  chats: Record<number, Chat>;
  chatsLoaded: boolean;
  msgs: Record<number, MsgState>;
  typing: Record<number, Record<number, { name: string; at: number }>>;
  stories: StoryGroup[];
  toasts: Toast[];
  activeChatId: number | null;
  // global overlays
  share: SharePayload | null;
  profileUserId: number | null;
  storyViewer: { userId: number } | null;
  lightbox: Attachment | null;

  init: () => Promise<void>;
  /** Start a session from a login / sign-up response (the apps also receive a token). */
  signIn: (session: { me: Me; token?: string }, keys?: { secrets: Secrets; created?: NewAccountKeys }) => Promise<void>;
  /** Open the private messages on this device with the password. */
  unlock: (password: string) => Promise<void>;
  /** New keys: past private messages become unreadable everywhere. */
  resetEncryption: (password: string) => Promise<void>;
  loadConnections: () => Promise<void>;
  saveVault: (patch: Partial<Vault>) => Promise<void>;
  setMe: (me: Me | null) => void;
  deleteAccount: (password: string) => Promise<void>;
  /** Catch up after the app comes back to the foreground. */
  resume: () => void;
  setLang: (lang: Lang) => void;
  setTheme: (theme: Theme) => void;
  switchWorld: (world: World) => Promise<void>;
  logout: () => Promise<void>;
  toast: (text: string, kind?: Toast['kind']) => void;
  error: (e: unknown) => void;
  dismissToast: (id: number) => void;

  loadChats: () => Promise<void>;
  upsertChat: (chat: Chat) => void;
  acknowledgeKey: (peerId: number) => void;
  patchChat: (id: number, patch: Partial<Chat>) => void;
  removeChat: (id: number) => void;
  fetchChat: (id: number) => Promise<Chat | null>;
  /** Join a public group, or ask to enter a private one. Resolves with true when it is a request. */
  joinGroup: (chat: Chat) => Promise<boolean>;
  cancelJoinRequest: (chat: Chat) => Promise<void>;
  setActiveChat: (id: number | null) => void;
  markRead: (chatId: number) => void;

  loadMessages: (chatId: number, mode: 'latest' | 'older' | 'newer' | { around: number }) => Promise<void>;
  send: (
    chatId: number,
    input: {
      text?: string;
      attachment?: Attachment | null;
      replyTo?: Message | null;
      poll?: { question: string; options: string[]; multiple: boolean };
      forwarded?: boolean;
    },
  ) => Promise<void>;
  editMessage: (m: Message, text: string) => Promise<void>;
  forwardMessage: (m: Message, chatIds: number[]) => Promise<void>;
  /** Decrypt messages fetched outside the main history (pins, favourites…). */
  openMessages: (messages: Message[]) => Promise<ClientMessage[]>;
  patchMessage: (chatId: number, id: number, fn: (m: ClientMessage) => ClientMessage) => void;
  hideMessage: (chatId: number, id: number) => void;

  loadStories: () => Promise<void>;
  openShare: (p: SharePayload | null) => void;
  openProfile: (id: number | null) => void;
  openStories: (userId: number | null) => void;
  openLightbox: (a: Attachment | null) => void;
}

let socket: Socket | null = null;
let toastId = 1;
let tempId = -1;
let storiesTimer: ReturnType<typeof setTimeout> | undefined;
const readTimers = new Map<number, ReturnType<typeof setTimeout>>();

export const getSocket = () => socket;

function loadTheme(): Theme {
  try {
    const t = localStorage.getItem('ot_theme');
    if (t === 'light' || t === 'dark') return t;
  } catch {
    /* ignore */
  }
  return 'system';
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
}

const emptyMsgs = (): MsgState => ({ items: [], hasOlder: false, hasNewer: false, loaded: false, loading: false });

function toPreview(m: Message): Chat['lastMessage'] {
  return {
    id: m.id,
    userId: m.userId,
    userName: m.user.name,
    type: m.type,
    text: m.type === 'poll' ? (m.poll?.question ?? '') : m.text || m.attachment?.name || '',
    deleted: m.deleted,
    createdAt: m.createdAt,
    system: m.system,
    encrypted: !!m.enc,
  };
}

// ───────────── decrypting what the server sends ─────────────

/** A private group seen from outside: its name and description, nothing of what is written in it. */
export const isClosedTo = (chat: Chat, me: Me | null): boolean => chat.type === 'group' && chat.isPrivate && !chat.isMember && !me?.isAdmin;

/** The other person of a private conversation, as far as this device knows. */
const peerOf = (chatId: number): number | null => useStore.getState().chats[chatId]?.peer?.id ?? null;

async function openMessage(m: Message, myId: number): Promise<ClientMessage> {
  let out: ClientMessage = m;
  const peerId = peerOf(m.chatId);
  if (m.enc) {
    const opened = await openEnvelope(m.chatId, m, myId, peerId);
    out = typeof opened === 'string' ? { ...m, e2e: opened } : { ...m, type: opened.type, text: opened.text, attachment: opened.attachment ?? null, e2e: 'ok' };
  }
  if (m.replyTo?.enc) {
    const quoted = await openEnvelope(m.chatId, m.replyTo, myId, peerId);
    if (typeof quoted !== 'string') out = { ...out, replyTo: { ...m.replyTo, type: quoted.type, text: quoted.text || quoted.attachment?.name || '', encrypted: false } };
  }
  return out;
}

/** The last message shown in the conversation list. */
async function openPreview(chat: Chat, myId: number): Promise<Chat> {
  const preview = chat.lastMessage;
  if (!preview?.enc) return chat;
  const opened = await openEnvelope(chat.id, preview, myId, chat.peer?.id);
  if (typeof opened === 'string') return chat;
  return { ...chat, lastMessage: { ...preview, type: opened.type, text: opened.text || opened.attachment?.name || '', encrypted: false } };
}

export const useStore = create<State>((set, get) => ({
  me: null,
  ready: false,
  bootError: false,
  config: null,
  e2e: 'locked',
  ai: null,
  calendars: [],
  mailUnread: 0,
  keyAlerts: {},
  tr: {},
  lang: detectLang(),
  theme: loadTheme(),
  connected: false,
  chats: {},
  chatsLoaded: false,
  msgs: {},
  typing: {},
  stories: [],
  toasts: [],
  activeChatId: null,
  share: null,
  profileUserId: null,
  storyViewer: null,
  lightbox: null,

  async init() {
    applyTheme(get().theme);
    await loadToken();
    set({ bootError: false });
    void api
      .get<NonNullable<State['config']>>('/config')
      .then((config) => (set({ config }), refreshTranslations()))
      .catch(() => undefined);
    try {
      const { me } = await api.get<{ me: Me | null }>('/me');
      // Private messages need the key kept on this device: look for it before loading anything.
      if (me) set({ e2e: (await restoreKeys(me.id, me.publicKey)) ? 'ready' : 'locked' });
      get().setMe(me);
      if (me) void get().loadConnections();
    } catch {
      // Unreachable server. With a saved session (the apps), showing the sign-in screen
      // would look like a logout: offer to retry instead.
      if (TOKEN_MODE && getToken()) set({ bootError: true });
    }
    set({ ready: true });
  },

  async signIn(session, keys) {
    if (session.token) await saveToken(session.token);
    let e2e: State['e2e'] = 'locked';
    if (keys) {
      try {
        await setupKeys(session.me.id, keys.secrets, keys.created);
        e2e = 'ready';
      } catch {
        // The saved key does not open with this password: the person can reset it from their profile.
      }
    }
    set({ e2e });
    // setupKeys may have just published a first key for an older account.
    const me = e2e === 'ready' && !session.me.publicKey ? await api.get<{ me: Me }>('/me').then((r) => r.me).catch(() => session.me) : session.me;
    get().setMe(me);
    void get().loadConnections();
  },

  async unlock(password) {
    const me = get().me;
    if (!me) return;
    await setupKeys(me.id, await deriveSecrets(me.email, password));
    set({ e2e: 'ready', msgs: {} });
    const fresh = await api.get<{ me: Me }>('/me');
    get().setMe(fresh.me);
    await get().loadChats();
    void get().loadConnections();
    const active = get().activeChatId;
    if (active != null) void get().loadMessages(active, 'latest');
  },

  async resetEncryption(password) {
    const me = get().me;
    if (!me) return;
    const secrets = await deriveSecrets(me.email, password);
    await api.post('/me/verify-password', { password: secrets.authKey });
    await resetKeys(me.id, secrets);
    set({ e2e: 'ready', msgs: {} });
    const fresh = await api.get<{ me: Me }>('/me');
    get().setMe(fresh.me);
    await get().loadChats();
    // The connections are locked by the password, not by the key pair: they are still there.
    void get().loadConnections();
    const active = get().activeChatId;
    if (active != null) void get().loadMessages(active, 'latest');
  },

  async loadConnections() {
    const me = get().me;
    if (!me) return;
    if (get().config?.mail !== false) {
      void api
        .get<{ unread: number }>('/mail')
        .then((r) => set({ mailUnread: r.unread }))
        .catch(() => undefined);
    }
    if (!hasKeys()) return;
    try {
      const vault = await loadVault();
      set({ ai: vault.ai ?? null, calendars: vault.calendars ?? [] });
      refreshTranslations();
    } catch {
      /* the vault stays closed; nothing else depends on it */
    }
  },

  async saveVault(patch) {
    const next = { ...(await loadVault()), ...patch };
    for (const key of Object.keys(next) as (keyof Vault)[]) if (next[key] == null) delete next[key];
    await saveVault(next);
    set({ ai: next.ai ?? null, calendars: next.calendars ?? [] });
    refreshTranslations();
  },

  async deleteAccount(password) {
    const me = get().me;
    if (!me) return;
    // As everywhere else, the server is shown a key derived from the password, never the password.
    const { authKey } = await deriveSecrets(me.email, password);
    await api.post('/me/delete', { password: authKey });
    get().setMe(null);
  },

  resume() {
    if (!get().me) return;
    if (socket && !socket.connected) socket.connect();
    void get().loadChats().catch(() => undefined);
    void get().loadStories();
    const active = get().activeChatId;
    if (active != null && !get().msgs[active]?.hasNewer) void get().loadMessages(active, 'latest');
  },

  setMe(me) {
    const prev = get().me;
    set({ me, ...(me ? { lang: me.world } : {}) });
    if (me) {
      document.documentElement.lang = me.world;
      try {
        localStorage.setItem('ot_lang', me.world);
      } catch {
        /* ignore */
      }
    }
    if (me && !prev) {
      connect();
      void get().loadChats();
      void get().loadStories();
    }
    if (me && prev && (me.world !== prev.world || me.autoTranslate !== prev.autoTranslate || me.translatePrivate !== prev.translatePrivate || me.readLangs.join() !== prev.readLangs.join())) {
      refreshTranslations();
    }
    if (!me) void saveToken(null);
    if (!me && prev) {
      socket?.close();
      socket = null;
      void forgetKeys(prev.id);
      void clearTranslationCache();
      set({ chats: {}, chatsLoaded: false, msgs: {}, stories: [], typing: {}, connected: false, activeChatId: null, e2e: 'locked', ai: null, calendars: [], mailUnread: 0, keyAlerts: {}, tr: {} });
    }
  },

  setLang(lang) {
    set({ lang });
    document.documentElement.lang = lang;
    try {
      localStorage.setItem('ot_lang', lang);
    } catch {
      /* ignore */
    }
  },

  setTheme(theme) {
    set({ theme });
    applyTheme(theme);
    try {
      localStorage.setItem('ot_theme', theme);
    } catch {
      /* ignore */
    }
  },

  async switchWorld(world) {
    if (get().me?.world === world) return;
    const { me } = await api.patch<{ me: Me }>('/me', { world });
    get().setMe(me);
    await Promise.all([get().loadChats(), get().loadStories()]);
  },

  async logout() {
    await api.post('/auth/logout').catch(() => undefined);
    get().setMe(null);
  },

  toast(text, kind = 'info') {
    const id = toastId++;
    set((s) => ({ toasts: [...s.toasts, { id, text, kind }] }));
    setTimeout(() => get().dismissToast(id), 4000);
  },

  error(e) {
    const lang = get().lang;
    const code = e instanceof ApiError ? e.code : 'server_error';
    const key = `err_${code}` as Key;
    const text = translate(lang, key);
    get().toast(text === key ? translate(lang, 'err_server_error') : text, 'error');
    if (e instanceof ApiError && e.status === 401 && get().me) get().setMe(null);
  },

  dismissToast(id) {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },

  // ───────────── chats ─────────────

  async loadChats() {
    const myId = get().me?.id ?? 0;
    const list = (await api.get<{ chats: Chat[] }>('/chats')).chats;
    // Learn each contact's key before opening anything they wrote.
    const alerts: Record<number, true> = {};
    for (const c of list) if (c.peer && noteContactKey(myId, c.peer.id, c.peer.publicKey)) alerts[c.peer.id] = true;
    const chats = await Promise.all(list.map((c) => openPreview(c, myId)));
    set((s) => {
      // Keep non-member previews that are currently open.
      const next: Record<number, Chat> = {};
      for (const c of Object.values(s.chats)) if (!c.isMember && c.id === s.activeChatId) next[c.id] = c;
      for (const c of chats) next[c.id] = c;
      return { chats: next, chatsLoaded: true, keyAlerts: { ...s.keyAlerts, ...alerts } };
    });
    refreshTranslations();
  },

  acknowledgeKey(peerId) {
    const myId = get().me?.id;
    if (myId == null) return;
    acknowledgeContactKey(myId, peerId);
    set((s) => {
      const { [peerId]: _seen, ...rest } = s.keyAlerts;
      return { keyAlerts: rest };
    });
  },

  upsertChat(chat) {
    const myId = get().me?.id;
    const alert = myId != null && chat.peer ? noteContactKey(myId, chat.peer.id, chat.peer.publicKey) : false;
    set((s) => {
      const next: Partial<State> = { chats: { ...s.chats, [chat.id]: chat } };
      if (alert && chat.peer) next.keyAlerts = { ...s.keyAlerts, [chat.peer.id]: true };
      // A group that became private, or that I was taken out of: what was loaded goes away.
      if (isClosedTo(chat, s.me) && s.msgs[chat.id]) {
        next.msgs = { ...s.msgs };
        delete next.msgs[chat.id];
      }
      return next;
    });
    // Its preview may still be ciphertext: decrypt it in the background.
    if (chat.lastMessage?.enc) {
      void openPreview(chat, get().me?.id ?? 0).then((opened) => {
        const current = get().chats[chat.id];
        if (opened !== chat && current?.lastMessage?.id === chat.lastMessage?.id) get().patchChat(chat.id, { lastMessage: opened.lastMessage });
      });
    }
  },

  patchChat(id, patch) {
    set((s) => (s.chats[id] ? { chats: { ...s.chats, [id]: { ...s.chats[id]!, ...patch } } } : s));
  },

  removeChat(id) {
    set((s) => {
      const chats = { ...s.chats };
      delete chats[id];
      const msgs = { ...s.msgs };
      delete msgs[id];
      return { chats, msgs };
    });
  },

  async joinGroup(chat) {
    const r = await api.post<{ chat: Chat; requested?: boolean }>(`/chats/${chat.id}/join`);
    get().upsertChat(r.chat);
    get().toast(translate(get().lang, r.requested ? 'request_sent' : 'joined_group', { name: chat.name }));
    return !!r.requested;
  },

  async cancelJoinRequest(chat) {
    await api.del(`/chats/${chat.id}/join`);
    get().patchChat(chat.id, { requested: false });
  },

  async fetchChat(id) {
    try {
      const { chat } = await api.get<{ chat: Chat }>(`/chats/${id}`);
      get().upsertChat(chat);
      return chat;
    } catch {
      return null;
    }
  },

  setActiveChat(id) {
    const prev = get().activeChatId;
    if (prev === id) return;
    if (prev != null) {
      const chat = get().chats[prev];
      if (chat && !chat.isMember) {
        socket?.emit('unwatch', prev);
        get().removeChat(prev);
      }
    }
    set({ activeChatId: id });
  },

  markRead(chatId) {
    const chat = get().chats[chatId];
    const state = get().msgs[chatId];
    if (!chat?.isMember || !state || state.hasNewer) return;
    const last = [...state.items].reverse().find((m) => m.id > 0);
    if (!last || last.id <= chat.lastReadId) {
      if (chat.unread) get().patchChat(chatId, { unread: 0 });
      return;
    }
    get().patchChat(chatId, { unread: 0, lastReadId: last.id });
    clearTimeout(readTimers.get(chatId));
    readTimers.set(
      chatId,
      setTimeout(() => {
        api.post(`/chats/${chatId}/read`, { messageId: last.id }).catch(() => undefined);
      }, 400),
    );
  },

  // ───────────── messages ─────────────

  async loadMessages(chatId, mode) {
    // Know the conversation before asking for its messages: from outside a private group
    // there is nothing to read, and asking would only be refused.
    const chat = get().chats[chatId] ?? (await get().fetchChat(chatId));
    if (!chat || isClosedTo(chat, get().me)) return;
    const current = get().msgs[chatId] ?? emptyMsgs();
    if (current.loading) return;
    set((s) => ({ msgs: { ...s.msgs, [chatId]: { ...current, loading: true } } }));
    try {
      let query = '';
      const real = current.items.filter((m) => m.id > 0);
      if (mode === 'older' && real.length) query = `?before=${real[0]!.id}`;
      else if (mode === 'newer' && real.length) query = `?after=${real[real.length - 1]!.id}`;
      else if (typeof mode === 'object') query = `?around=${mode.around}`;
      const fetched = await api.get<{ messages: Message[]; hasOlder: boolean; hasNewer: boolean }>(`/chats/${chatId}/messages${query}`);
      const r = { ...fetched, messages: await get().openMessages(fetched.messages) };
      set((s) => {
        const prev = s.msgs[chatId] ?? emptyMsgs();
        let items: ClientMessage[];
        let hasOlder = r.hasOlder;
        let hasNewer = r.hasNewer;
        if (mode === 'older') {
          items = [...r.messages, ...prev.items];
          hasNewer = prev.hasNewer;
        } else if (mode === 'newer') {
          items = [...prev.items.filter((m) => m.id > 0), ...r.messages];
          hasOlder = prev.hasOlder;
        } else if (mode === 'latest') {
          // keep messages that are still being sent
          items = [...r.messages, ...prev.items.filter((m) => m.pending || m.failed)];
        } else {
          items = r.messages;
        }
        const seen = new Set<number>();
        items = items.filter((m) => (seen.has(m.id) ? false : (seen.add(m.id), true)));
        return { msgs: { ...s.msgs, [chatId]: { items, hasOlder, hasNewer, loaded: true, loading: false } } };
      });
      autoTranslate(r.messages.filter((m) => !m.enc || m.e2e === 'ok'));
    } catch (e) {
      set((s) => ({ msgs: { ...s.msgs, [chatId]: { ...(s.msgs[chatId] ?? emptyMsgs()), loading: false, loaded: true } } }));
      get().error(e);
    }
  },

  async openMessages(messages) {
    const myId = get().me?.id ?? 0;
    // A private message is checked against the contact of its conversation: make sure
    // that conversation (and so the contact's key) is known before opening anything.
    const unknown = [...new Set(messages.filter((m) => m.enc && !get().chats[m.chatId]).map((m) => m.chatId))];
    await Promise.all(unknown.map((id) => get().fetchChat(id)));
    return Promise.all(messages.map((m) => openMessage(m, myId)));
  },

  async editMessage(m, text) {
    if (!m.enc) {
      await api.patch(`/messages/${m.id}`, { text });
      return;
    }
    const me = get().me;
    const peerKey = get().chats[m.chatId]?.peer?.publicKey;
    if (!me || !peerKey || !hasKeys()) throw new ApiError(400, 'locked');
    await api.patch(`/messages/${m.id}`, { enc: await sealMessage(m.chatId, me.id, peerKey, { type: m.type, text, attachment: m.attachment }) });
  },

  async forwardMessage(m, chatIds) {
    const targets = chatIds.map((id) => get().chats[id]).filter((c): c is Chat => !!c);
    // The server can copy a public message into public groups. Anything touching an
    // encrypted conversation is done here, on the device, which holds the keys.
    const byServer = m.enc ? [] : targets.filter((c) => c.type === 'group');
    if (byServer.length) await api.post(`/messages/${m.id}/forward`, { chatIds: byServer.map((c) => c.id) });
    for (const chat of targets.filter((c) => !byServer.includes(c))) {
      let attachment = m.attachment;
      if (attachment) {
        const { url: _url, size: _size, key, ...meta } = attachment;
        if (chat.type === 'dm' && !key) attachment = await uploadEncrypted(await attachmentBlob(attachment), meta);
        else if (chat.type === 'group' && key) attachment = { ...meta, ...(await api.upload(await attachmentBlob(attachment), attachment.name)) };
      }
      await get().send(chat.id, { text: m.text, attachment, forwarded: true });
    }
  },

  async send(chatId, input) {
    const me = get().me;
    if (!me) return;
    const chat = get().chats[chatId];
    const secret = chat?.type === 'dm';
    const peerKey = chat?.peer?.publicKey;
    if (secret && !hasKeys()) return get().toast(translate(get().lang, 'err_locked'), 'error');
    if (secret && !peerKey) return get().toast(translate(get().lang, 'err_peer_no_key'), 'error');
    // When the visible window is in the past, jump back to the present first.
    if (get().msgs[chatId]?.hasNewer) await get().loadMessages(chatId, 'latest');
    const id = tempId--;
    const text = (input.text ?? '').trim();
    const optimistic: ClientMessage = {
      id,
      chatId,
      userId: me.id,
      user: { id: me.id, name: me.name, username: me.username, avatar: me.avatar, isSystem: false },
      type: input.poll ? 'poll' : (input.attachment?.kind ?? 'text'),
      text,
      attachment: input.poll ? null : (input.attachment ?? null),
      replyTo: input.replyTo
        ? {
            id: input.replyTo.id,
            userId: input.replyTo.userId,
            userName: input.replyTo.user.name,
            type: input.replyTo.type,
            text: input.replyTo.poll?.question ?? (input.replyTo.text || input.replyTo.attachment?.name || ''),
            deleted: false,
          }
        : null,
      forwarded: !!input.forwarded,
      editedAt: null,
      deleted: false,
      createdAt: Date.now(),
      pinnedAt: null,
      reactions: [],
      starred: false,
      mentions: [],
      poll: input.poll ? { ...input.poll, counts: input.poll.options.map(() => 0), voters: 0, myVotes: [] } : undefined,
      pending: true,
    };
    set((s) => {
      const prev = s.msgs[chatId] ?? emptyMsgs();
      return { msgs: { ...s.msgs, [chatId]: { ...prev, items: [...prev.items, optimistic] } } };
    });
    try {
      let body: Record<string, unknown>;
      if (secret) {
        // Private conversation: only ciphertext leaves the device. The server sees an
        // opaque blob for a file, never its name, type or key.
        const a = input.attachment;
        body = {
          enc: await sealMessage(chatId, me.id, peerKey!, { type: optimistic.type, text, attachment: a ?? null }),
          attachment: a ? { url: a.url, name: 'file.bin', size: a.size, mime: 'application/octet-stream', kind: 'file' } : undefined,
          replyToId: input.replyTo?.id,
          forwarded: input.forwarded,
        };
      } else {
        body = {
          text,
          attachment: input.poll ? undefined : (input.attachment ?? undefined),
          replyToId: input.replyTo?.id,
          poll: input.poll,
          forwarded: input.forwarded,
        };
      }
      const sent = (await api.post<{ message: Message }>(`/chats/${chatId}/messages`, body)).message;
      const message: ClientMessage = secret
        ? { ...sent, type: optimistic.type, text, attachment: input.attachment ?? null, replyTo: optimistic.replyTo, e2e: 'ok' }
        : sent;
      set((s) => {
        const prev = s.msgs[chatId] ?? emptyMsgs();
        const exists = prev.items.some((m) => m.id === message.id);
        const items = exists ? prev.items.filter((m) => m.id !== id) : prev.items.map((m) => (m.id === id ? message : m));
        return { msgs: { ...s.msgs, [chatId]: { ...prev, items } } };
      });
      onIncoming(message);
    } catch (e) {
      get().patchMessage(chatId, id, (m) => ({ ...m, pending: false, failed: true }));
      get().error(e);
    }
  },

  patchMessage(chatId, id, fn) {
    set((s) => {
      const prev = s.msgs[chatId];
      if (!prev) return s;
      let changed = false;
      const items = prev.items.map((m) => {
        if (m.id !== id) return m;
        changed = true;
        return fn(m);
      });
      return changed ? { msgs: { ...s.msgs, [chatId]: { ...prev, items } } } : s;
    });
  },

  hideMessage(chatId, id) {
    set((s) => {
      const prev = s.msgs[chatId];
      if (!prev) return s;
      return { msgs: { ...s.msgs, [chatId]: { ...prev, items: prev.items.filter((m) => m.id !== id) } } };
    });
  },

  // ───────────── stories & overlays ─────────────

  async loadStories() {
    try {
      const { groups } = await api.get<{ groups: StoryGroup[] }>('/stories');
      set({ stories: groups });
    } catch {
      /* ignore */
    }
  },

  openShare: (share) => set({ share }),
  openProfile: (profileUserId) => set({ profileUserId }),
  openStories: (userId) => set({ storyViewer: userId == null ? null : { userId } }),
  openLightbox: (lightbox) => set({ lightbox }),
}));

// ───────────────────────── realtime ─────────────────────────

/** Update the chat list (preview, unread, ordering) for a new message. */
function onIncoming(m: Message) {
  const s = useStore.getState();
  const chat = s.chats[m.chatId];
  if (!chat) return;
  if (chat.lastMessage && chat.lastMessage.id >= m.id) return;
  const mine = m.userId === s.me?.id;
  const visible = s.activeChatId === m.chatId && document.visibilityState === 'visible' && !s.msgs[m.chatId]?.hasNewer;
  const countsAsUnread = !mine && !visible && m.type !== 'system' && chat.isMember;
  s.patchChat(m.chatId, {
    lastMessage: toPreview(m),
    lastActivity: m.createdAt,
    unread: countsAsUnread ? chat.unread + 1 : chat.unread,
    archived: chat.type === 'dm' ? false : chat.archived,
  });
  if (countsAsUnread && !chat.muted) notify(chat, m);
}

function notify(chat: Chat, m: Message) {
  if (document.visibilityState === 'visible') return;
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  try {
    const body = chat.type === 'dm' ? m.text || '📎' : `${m.user.name}: ${m.text || '📎'}`;
    const n = new Notification(chat.name, { body: body.slice(0, 140), tag: `chat-${chat.id}`, icon: '/icon-192.png' });
    n.onclick = () => {
      window.focus();
      n.close();
    };
  } catch {
    /* notifications unavailable */
  }
}

function connect() {
  if (socket) return;
  const options = {
    path: '/socket.io',
    transports: ['websocket', 'polling'],
    // The apps authenticate the realtime channel with their session token.
    auth: (cb: (data: object) => void) => cb(TOKEN_MODE && getToken() ? { token: getToken() } : {}),
  };
  socket = API_ORIGIN ? io(API_ORIGIN, options) : io(options);
  const store = useStore;

  socket.on('connect', () => {
    const wasLoaded = store.getState().chatsLoaded;
    store.setState({ connected: true });
    // After a reconnection, catch up on what we missed.
    if (wasLoaded) {
      void store.getState().loadChats();
      const active = store.getState().activeChatId;
      if (active != null) {
        const chat = store.getState().chats[active];
        if (chat && !chat.isMember) socket?.emit('watch', active);
        if (!store.getState().msgs[active]?.hasNewer) void store.getState().loadMessages(active, 'latest');
      }
    }
  });
  socket.on('disconnect', (reason) => {
    store.setState({ connected: false });
    // The server closes every connection of an account when one of its devices is signed
    // out; the devices that are still signed in simply come back.
    if (reason === 'io server disconnect') setTimeout(() => store.getState().me && socket?.connect(), 800);
  });
  socket.on('connect_error', () => {
    // If the session itself is gone, this request notices and signs the device out.
    if (store.getState().me) void api.get('/chats').catch((e) => store.getState().error(e));
  });

  // Decryption is asynchronous: handle incoming events one at a time so they stay in order.
  let queue: Promise<unknown> = Promise.resolve();
  const inOrder = <T,>(handler: (payload: T) => Promise<void> | void) => (payload: T) => {
    queue = queue.then(() => handler(payload)).catch(() => undefined);
  };

  socket.on('mail:new', () => {
    store.setState((s) => ({ mailUnread: s.mailUnread + 1 }));
    store.getState().toast(translate(store.getState().lang, 'mail_new'));
  });

  socket.on('message:new', inOrder(async (received: Message) => {
    const myId = store.getState().me?.id ?? 0;
    let raw = await openMessage(received, myId);
    if (raw.e2e === 'failed' && store.getState().chats[received.chatId]) {
      // Perhaps written with a key the contact has just changed to: ask for their current one.
      await store.getState().fetchChat(received.chatId);
      raw = await openMessage(received, myId);
    }
    const s = store.getState();
    // Broadcasts are viewer-neutral; the author of an event is "going" by default.
    const m: ClientMessage = raw.event && raw.event.createdBy === s.me?.id ? { ...raw, event: { ...raw.event, myStatus: 'going' } } : raw;
    const state = s.msgs[m.chatId];
    if (state?.loaded && !state.hasNewer && !state.items.some((x) => x.id === m.id)) {
      // Our own message normally arrives through the POST response; give it a moment.
      const mine = m.userId === s.me?.id && state.items.some((x) => x.pending);
      const append = () =>
        store.setState((cur) => {
          const prev = cur.msgs[m.chatId];
          if (!prev || prev.items.some((x) => x.id === m.id)) return cur;
          return { msgs: { ...cur.msgs, [m.chatId]: { ...prev, items: [...prev.items, m] } } };
        });
      if (mine) setTimeout(append, 1500);
      else append();
    }
    if (!s.chats[m.chatId]) {
      // A conversation we did not know yet (someone started a DM with us).
      void s.fetchChat(m.chatId).then((chat) => {
        if (chat && !chat.isMember && store.getState().activeChatId !== chat.id) store.getState().removeChat(chat.id);
      });
      return;
    }
    onIncoming(m);
    if (!m.enc || m.e2e === 'ok') autoTranslate([m]);
    s.typing[m.chatId]?.[m.userId] && clearTyping(m.chatId, m.userId);
  }));

  socket.on('message:patch', inOrder(async (event: MessagePatchEvent) => {
    const s = store.getState();
    let e = event;
    if (event.patch.enc) {
      // An edited private message arrives as new ciphertext.
      const author = s.msgs[event.chatId]?.items.find((m) => m.id === event.id)?.userId ?? s.chats[event.chatId]?.lastMessage?.userId;
      const opened = author == null ? 'failed' : await openEnvelope(event.chatId, { userId: author, enc: event.patch.enc }, s.me?.id ?? 0, peerOf(event.chatId));
      if (typeof opened !== 'string') e = { ...event, patch: { ...event.patch, text: opened.text, attachment: opened.attachment ?? null } };
    }
    s.patchMessage(e.chatId, e.id, (m) => ({ ...m, ...e.patch, ...(e.patch.deleted ? { reactions: [], replyTo: null, enc: null } : {}) }));
    if (e.patch.text !== undefined) {
      // The text changed: its translation no longer stands.
      const edited = store.getState().msgs[e.chatId]?.items.find((m) => m.id === e.id);
      if (edited && (!edited.enc || edited.e2e === 'ok')) autoTranslate([edited]);
    }
    const chat = s.chats[e.chatId];
    if (chat?.lastMessage?.id === e.id) {
      s.patchChat(e.chatId, {
        lastMessage: { ...chat.lastMessage, text: e.patch.text ?? chat.lastMessage.text, deleted: e.patch.deleted ?? chat.lastMessage.deleted },
      });
    }
  }));

  socket.on('message:reaction', (e: ReactionEvent) => {
    const myId = store.getState().me?.id;
    store.getState().patchMessage(e.chatId, e.id, (m) => {
      const mineEmoji = e.userId === myId ? e.emoji : (m.reactions.find((r) => r.mine)?.emoji ?? null);
      return { ...m, reactions: e.reactions.map((r) => ({ ...r, mine: r.emoji === mineEmoji })) };
    });
  });

  socket.on('message:poll', (e: PollEvent) => {
    const myId = store.getState().me?.id;
    store.getState().patchMessage(e.chatId, e.id, (m) =>
      m.poll ? { ...m, poll: { ...m.poll, counts: e.counts, voters: e.voters, myVotes: e.userId === myId ? e.votes : m.poll.myVotes } } : m,
    );
  });

  socket.on('event:rsvp', (e: RsvpEvent) => {
    if (e.messageId == null) return;
    const myId = store.getState().me?.id;
    store.getState().patchMessage(e.chatId, e.messageId, (m) =>
      m.event ? { ...m, event: { ...m.event, going: e.going, maybe: e.maybe, myStatus: e.userId === myId ? e.status : m.event.myStatus } } : m,
    );
  });

  socket.on('chat:update', (e: { chatId: number }) => {
    const s = store.getState();
    const known = s.chats[e.chatId];
    if (!known) return;
    // A group I am not in may have gone out of my sight (private and no longer listed, request refused).
    void s.fetchChat(e.chatId).then((chat) => {
      if (!chat && !known.isMember) store.getState().patchChat(e.chatId, { requested: false });
    });
  });
  // Private groups: someone asks to enter a group I administer…
  socket.on('chat:request', (e: { chatId: number; chatName: string; userName: string }) => {
    const s = store.getState();
    void s.fetchChat(e.chatId);
    s.toast(translate(s.lang, 'request_received', { user: e.userName, name: e.chatName }));
  });
  // …and an administrator let me into one.
  socket.on('chat:approved', (e: { chatId: number; name: string }) => {
    const s = store.getState();
    s.toast(translate(s.lang, 'request_approved', { name: e.name }));
    void s.fetchChat(e.chatId).then(() => {
      if (store.getState().activeChatId === e.chatId) void store.getState().loadMessages(e.chatId, 'latest');
    });
  });
  socket.on('chat:members', (e: { chatId: number; memberCount: number }) => store.getState().patchChat(e.chatId, { memberCount: e.memberCount }));
  const gone = (e: { chatId: number }) => {
    const s = store.getState();
    if (s.activeChatId === e.chatId) void s.fetchChat(e.chatId).then((c) => !c && s.removeChat(e.chatId));
    else s.removeChat(e.chatId);
  };
  socket.on('chat:removed', gone);
  socket.on('chat:deleted', (e: { chatId: number }) => store.getState().removeChat(e.chatId));

  socket.on('typing', (e: { chatId: number; userId: number; name: string }) => {
    store.setState((s) => ({
      typing: { ...s.typing, [e.chatId]: { ...(s.typing[e.chatId] ?? {}), [e.userId]: { name: e.name, at: Date.now() } } },
    }));
    setTimeout(() => {
      const t = store.getState().typing[e.chatId]?.[e.userId];
      if (t && Date.now() - t.at >= 3800) clearTyping(e.chatId, e.userId);
    }, 4000);
  });

  socket.on('presence', (e: { userId: number; online: boolean; lastSeen: number }) => {
    store.setState((s) => {
      const chats = { ...s.chats };
      let changed = false;
      for (const c of Object.values(chats)) {
        if (c.peer?.id === e.userId) {
          chats[c.id] = { ...c, peer: { ...c.peer, online: e.online, lastSeen: e.lastSeen } as UserPublic };
          changed = true;
        }
      }
      return changed ? { chats } : s;
    });
  });

  socket.on('read', (e: { chatId: number; userId: number; lastReadId: number }) => {
    if (e.userId !== store.getState().me?.id) store.getState().patchChat(e.chatId, { peerLastReadId: e.lastReadId });
  });

  socket.on('story:new', () => {
    clearTimeout(storiesTimer);
    storiesTimer = setTimeout(() => void store.getState().loadStories(), 1500);
  });

  socket.on('me:update', (me: Me) => store.getState().setMe(me));
}

function clearTyping(chatId: number, userId: number) {
  useStore.setState((s) => {
    const forChat = { ...(s.typing[chatId] ?? {}) };
    delete forChat[userId];
    return { typing: { ...s.typing, [chatId]: forChat } };
  });
}

// Mark the open conversation as read when the user comes back to the tab.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    const s = useStore.getState();
    if (document.visibilityState === 'visible' && s.activeChatId != null) s.markRead(s.activeChatId);
  });
}

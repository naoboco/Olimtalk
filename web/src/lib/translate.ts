// Automatic translation: a message written in another language is shown in the reader's.
//
//  - Public messages are translated by the OlimTalk server (when it has a translation
//    service), once per language for everybody.
//  - Private messages are end-to-end encrypted. They are translated only if their reader
//    asked for it: by the reader's own AI when one is connected (the text then goes from
//    this device to that provider), otherwise by sending the decrypted text to the
//    server's translation service, which keeps nothing.
import { detectLang, needsTranslation, type DetectedLang } from '../../../shared/lang.ts';
import type { Lang } from '../../../shared/types.ts';
import { complete, isConfigured, translateRequest } from './ai/index.ts';
import { api } from './api.ts';
import type { Key } from './i18n.ts';
import { useStore } from './store.ts';

export interface Translation {
  /** The exact text that was translated: a translation stands for that text only. */
  source: string;
  lang: Lang;
  /** null when there was nothing to translate (the message is already in my language). */
  text: string | null;
  from: DetectedLang | null;
  state: 'pending' | 'done' | 'failed';
}

/** What is needed to translate a message — a full message, or the preview in the list. */
export interface Translatable {
  id: number;
  chatId: number;
  userId: number;
  type: string;
  text: string;
  /** Present on private (end-to-end encrypted) messages. */
  enc?: string | null;
  deleted?: boolean;
}

/** Where a translation is made: the server, the person's own AI, or the server fed by this device. */
type Engine = 'server' | 'ai' | 'relay';

const WITH_TEXT = new Set(['text', 'image', 'video', 'file']);

export function engineFor(isPrivate: boolean, manual = false): Engine | null {
  const s = useStore.getState();
  const me = s.me;
  if (!me) return null;
  const server = !!s.config?.translate;
  const ai = isConfigured(s.ai ?? undefined);
  if (!isPrivate) {
    // Free for the reader when the server translates: on unless switched off. With the
    // reader's own AI it spends their credit: only once they switched it on.
    if (server) return manual || (me.autoTranslate ?? true) ? 'server' : null;
    if (ai) return manual || me.autoTranslate === true ? 'ai' : null;
    return null;
  }
  // The text of a private message leaves this device only if its reader decided so.
  const asked = me.translatePrivate && me.autoTranslate !== false;
  if (ai) return manual || asked ? 'ai' : null;
  if (server) return me.translatePrivate && (manual || asked) ? 'relay' : null;
  return null;
}

/** The "Translated from Russian" note, when the language of the original is known. */
export const fromKey = (code: string | null | undefined): Key | null =>
  code === 'fr' || code === 'en' || code === 'es' || code === 'ru' || code === 'he' || code === 'ar' ? `tr_from_${code}` : null;

/** The translation to show for a message, if there is one for its current text. */
export function translationOf(tr: Translation | undefined, text: string, lang: Lang): Translation | null {
  return tr && tr.source === text && tr.lang === lang ? tr : null;
}

const commit = (patch: Record<number, Translation>) => {
  if (Object.keys(patch).length) useStore.setState((s) => ({ tr: { ...s.tr, ...patch } }));
};

/** The language a conversation is expected to be in when a message cannot be recognised. */
function priorOf(chatId: number): string | null {
  const chat = useStore.getState().chats[chatId];
  return chat ? (chat.type === 'dm' ? (chat.peer?.world ?? null) : chat.world) : null;
}

// A failed translation is not asked for again straight away.
const failedAt = new Map<number, number>();
const RETRY_AFTER = 5 * 60_000;

function fail(m: Translatable, lang: Lang): Translation {
  failedAt.set(m.id, Date.now());
  return { source: m.text, lang, text: null, from: detectLang(m.text), state: 'failed' };
}

const done = (m: Translatable, lang: Lang, text: string | null): Translation => ({ source: m.text, lang, text, from: detectLang(m.text), state: 'done' });

// ───────────── the server translates public messages, in batches ─────────────

const serverQueue = new Map<number, { m: Translatable; lang: Lang }>();
let flushing = false;

async function flushServerQueue() {
  if (flushing) return;
  flushing = true;
  try {
    while (serverQueue.size) {
      // Newest first: that is what the person is looking at.
      const batch = [...serverQueue.values()].sort((a, b) => b.m.id - a.m.id).slice(0, 30);
      for (const item of batch) serverQueue.delete(item.m.id);
      const lang = batch[0]!.lang;
      const same = batch.filter((item) => item.lang === lang);
      for (const item of batch) if (item.lang !== lang) serverQueue.set(item.m.id, item);
      const patch: Record<number, Translation> = {};
      try {
        const r = await api.post<{ translations: { id: number; text: string | null }[] }>('/translate/messages', { ids: same.map((item) => item.m.id), lang });
        const byId = new Map(r.translations.map((x) => [x.id, x.text]));
        for (const { m } of same) patch[m.id] = byId.has(m.id) ? done(m, lang, byId.get(m.id) ?? null) : fail(m, lang);
      } catch {
        for (const { m } of same) patch[m.id] = fail(m, lang);
      }
      commit(patch);
    }
  } finally {
    flushing = false;
  }
}

// ───────────── on this device: the person's own AI, or text handed to the server ─────────────

const deviceQueue: { m: Translatable; lang: Lang; engine: 'ai' | 'relay' }[] = [];
let deviceRunning = 0;

async function digest(text: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Translations made on the device are kept on the device, so that reopening a conversation
// costs nothing. They are erased when the person signs out.
function cacheDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('olimtalk-translations', 1);
    open.onupgradeneeded = () => open.result.createObjectStore('items', { keyPath: 'key' });
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
  });
}
async function cached<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  try {
    const database = await cacheDb();
    try {
      return await new Promise<T>((resolve, reject) => {
        const request = run(database.transaction('items', mode).objectStore('items'));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } finally {
      database.close();
    }
  } catch {
    return undefined; // storage unavailable: translate again next time
  }
}

export async function clearTranslationCache() {
  failedAt.clear();
  serverQueue.clear();
  deviceQueue.length = 0;
  await cached('readwrite', (store) => store.clear());
}

async function translateOnDevice(engine: 'ai' | 'relay', text: string, lang: Lang): Promise<string | null> {
  const s = useStore.getState();
  const key = `${s.me?.id}:${lang}:${await digest(text)}`;
  const hit = await cached<{ key: string; text: string | null } | undefined>('readonly', (store) => store.get(key));
  if (hit) return hit.text;
  let result: string | null;
  if (engine === 'ai') {
    const ai = s.ai ?? undefined;
    if (!isConfigured(ai)) throw new Error('no ai');
    const out = (await complete(ai, translateRequest(text, lang))).trim();
    result = !out || out === '=' || out === text.trim() ? null : out;
  } else {
    result = (await api.post<{ text: string | null }>('/translate/text', { text, lang })).text;
  }
  await cached('readwrite', (store) => store.put({ key, text: result }));
  return result;
}

function pumpDeviceQueue() {
  while (deviceRunning < 2 && deviceQueue.length) {
    const job = deviceQueue.pop()!; // newest first
    deviceRunning++;
    void translateOnDevice(job.engine, job.m.text, job.lang)
      .then(
        (text) => commit({ [job.m.id]: done(job.m, job.lang, text) }),
        () => commit({ [job.m.id]: fail(job.m, job.lang) }),
      )
      .finally(() => {
        deviceRunning--;
        pumpDeviceQueue();
      });
  }
}

// ───────────── what the app calls ─────────────

function eligible(m: Translatable): boolean {
  return m.id > 0 && !m.deleted && WITH_TEXT.has(m.type) && m.text.trim().length > 0;
}

/** Translate, in the background, whichever of these messages their reader cannot read. */
export function autoTranslate(items: Translatable[]) {
  const s = useStore.getState();
  const me = s.me;
  if (!me || !items.length) return;
  const lang = me.world;
  const patch: Record<number, Translation> = {};
  for (const m of items) {
    if (!eligible(m) || m.userId === me.id) continue;
    const known = translationOf(s.tr[m.id], m.text, lang);
    if (known && (known.state !== 'failed' || Date.now() - (failedAt.get(m.id) ?? 0) < RETRY_AFTER)) continue;
    const engine = engineFor(!!m.enc);
    if (!engine || !needsTranslation(m.text, lang, me.readLangs, priorOf(m.chatId))) continue;
    patch[m.id] = { source: m.text, lang, text: null, from: detectLang(m.text), state: 'pending' };
    if (engine === 'server') serverQueue.set(m.id, { m, lang });
    else deviceQueue.push({ m, lang, engine });
  }
  commit(patch);
  if (serverQueue.size) void flushServerQueue();
  pumpDeviceQueue();
}

/** After a change of settings, of language or of what is available: look again at what is on screen. */
export function refreshTranslations() {
  const s = useStore.getState();
  if (!s.me) return;
  const previews: Translatable[] = [];
  for (const chat of Object.values(s.chats)) {
    const last = chat.lastMessage;
    if (chat.isMember && last) previews.push({ id: last.id, chatId: chat.id, userId: last.userId, type: last.type, text: last.encrypted ? '' : last.text, enc: last.enc, deleted: last.deleted });
  }
  const open = s.activeChatId != null ? (s.msgs[s.activeChatId]?.items ?? []) : [];
  autoTranslate([...previews, ...open.filter((m) => !m.enc || m.e2e === 'ok')]);
}

/**
 * The person asked for this message to be translated. `consent`: it is a private message
 * and they have not allowed its text to be sent anywhere; `unavailable`: nothing here can translate.
 */
export async function translateNow(m: Translatable): Promise<'done' | 'same' | 'failed' | 'consent' | 'unavailable'> {
  const s = useStore.getState();
  const me = s.me;
  if (!me || !eligible(m)) return 'unavailable';
  const lang = me.world;
  const engine = engineFor(!!m.enc, true);
  if (!engine) return m.enc && s.config?.translate ? 'consent' : 'unavailable';
  commit({ [m.id]: { source: m.text, lang, text: null, from: detectLang(m.text), state: 'pending' } });
  try {
    let text: string | null;
    if (engine === 'server') {
      const r = await api.post<{ translations: { id: number; text: string | null }[] }>('/translate/messages', { ids: [m.id], lang });
      const found = r.translations.find((x) => x.id === m.id);
      if (!found) throw new Error('failed');
      text = found.text;
    } else text = await translateOnDevice(engine, m.text, lang);
    commit({ [m.id]: done(m, lang, text) });
    return text ? 'done' : 'same';
  } catch {
    commit({ [m.id]: fail(m, lang) });
    return 'failed';
  }
}

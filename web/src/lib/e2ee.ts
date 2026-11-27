// End-to-end encryption on the device: where the keys live, and how messages, files and
// the settings vault are encrypted before anything leaves for the server.
import {
  decryptBytes,
  decryptJson,
  decryptMessage,
  deriveSecrets,
  encryptBytes,
  encryptJson,
  encryptMessage,
  generateIdentity,
  safetyNumber,
  unwrapPrivateKey,
  wrapPrivateKey,
  type Secrets,
} from '../../../shared/e2e.ts';
import type { Attachment, MessageType } from '../../../shared/types.ts';
import { api } from './api.ts';
import { asset } from './platform.ts';

export { deriveSecrets, safetyNumber, type Secrets };

interface Identity {
  userId: number;
  publicKey: string;
  /** Not exportable: scripts can use it while the app is open, but never read it out. */
  privateKey: CryptoKey;
  vaultKey: CryptoKey;
}

let identity: Identity | null = null;

export const hasKeys = () => identity !== null;
export const myPublicKey = () => identity?.publicKey ?? null;
export const myPrivateKey = () => identity?.privateKey ?? null;

// ───────────── key storage (IndexedDB keeps CryptoKey objects without exposing them) ─────────────

function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('olimtalk-keys', 1);
    open.onupgradeneeded = () => open.result.createObjectStore('identity', { keyPath: 'userId' });
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
  });
}

async function idb<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const database = await db();
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = run(database.transaction('identity', mode).objectStore('identity'));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    database.close();
  }
}

async function remember(next: Identity) {
  identity = next;
  vaultCache = null;
  await idb('readwrite', (s) => s.put(next)).catch(() => undefined); // private browsing: keys last for the session
}

// ───────────── set-up ─────────────

export interface NewAccountKeys {
  secrets: Secrets;
  publicKey: string;
  privateKey: CryptoKey;
  encryptedPrivateKey: string;
}

/** Everything a sign-up needs, computed on the device before the server hears anything. */
export async function prepareSignup(email: string, password: string): Promise<NewAccountKeys> {
  const secrets = await deriveSecrets(email, password);
  const pair = await generateIdentity();
  return { secrets, publicKey: pair.publicKey, privateKey: pair.privateKey, encryptedPrivateKey: await wrapPrivateKey(pair.privateKey, secrets.wrapKey) };
}

/**
 * Install the keys on this device after signing in. With `created`, the account was just
 * made here; otherwise the wrapped private key is fetched and opened with the password-derived key.
 * Throws when the wrapped key cannot be opened.
 */
export async function setupKeys(userId: number, secrets: Secrets, created?: NewAccountKeys): Promise<void> {
  let publicKey: string;
  let wrapped: string;
  if (created) {
    publicKey = created.publicKey;
    wrapped = created.encryptedPrivateKey;
  } else {
    const keys = await api.get<{ publicKey: string | null; encryptedPrivateKey: string | null }>('/me/keys');
    if (keys.publicKey && keys.encryptedPrivateKey) {
      publicKey = keys.publicKey;
      wrapped = keys.encryptedPrivateKey;
    } else {
      // An account without keys yet: create them now.
      const pair = await generateIdentity();
      publicKey = pair.publicKey;
      wrapped = await wrapPrivateKey(pair.privateKey, secrets.wrapKey);
      await api.put('/me/keys', { publicKey, encryptedPrivateKey: wrapped });
    }
  }
  await remember({ userId, publicKey, privateKey: await unwrapPrivateKey(wrapped, secrets.wrapKey), vaultKey: secrets.vaultKey });
}

/** At start-up: reuse the keys kept on this device, if they still match the account. */
export async function restoreKeys(userId: number, publicKey: string | null): Promise<boolean> {
  identity = null;
  vaultCache = null;
  try {
    const saved = await idb<Identity | undefined>('readonly', (s) => s.get(userId));
    if (saved && publicKey && saved.publicKey === publicKey) {
      identity = saved;
      return true;
    }
  } catch {
    /* storage unavailable */
  }
  return false;
}

/** Replace the key pair. Past private messages become unreadable on every device. */
export async function resetKeys(userId: number, secrets: Secrets): Promise<void> {
  const pair = await generateIdentity();
  const wrapped = await wrapPrivateKey(pair.privateKey, secrets.wrapKey);
  await api.put('/me/keys', { publicKey: pair.publicKey, encryptedPrivateKey: wrapped });
  await remember({ userId, publicKey: pair.publicKey, privateKey: await unwrapPrivateKey(wrapped, secrets.wrapKey), vaultKey: secrets.vaultKey });
}

export async function forgetKeys(userId: number | undefined) {
  identity = null;
  vaultCache = null;
  if (userId != null) await idb('readwrite', (s) => s.delete(userId)).catch(() => undefined);
}

/**
 * What a password change must send along: the private key and the vault re-encrypted
 * for the new password. Throws if the current password is wrong.
 */
export async function rewrapForNewPassword(userId: number, email: string, currentPassword: string, newPassword: string) {
  const current = await deriveSecrets(email, currentPassword);
  const next = await deriveSecrets(email, newPassword);
  const keys = await api.get<{ publicKey: string | null; encryptedPrivateKey: string | null }>('/me/keys');
  const body: { password: string; currentPassword: string; encryptedPrivateKey?: string; vault?: string | null } = {
    password: next.authKey,
    currentPassword: current.authKey,
  };
  let rewrapped: { publicKey: string; wrapped: string } | null = null;
  if (keys.publicKey && keys.encryptedPrivateKey) {
    const extractable = await unwrapPrivateKey(keys.encryptedPrivateKey, current.wrapKey, true);
    rewrapped = { publicKey: keys.publicKey, wrapped: await wrapPrivateKey(extractable, next.wrapKey) };
    body.encryptedPrivateKey = rewrapped.wrapped;
  }
  // The vault is opened with the current password and closed with the new one, straight from
  // the server's copy: this also works on a device that does not hold the keys.
  const stored = await api.get<{ vault: string | null }>('/me/vault');
  const vault: Vault = stored.vault ? await decryptJson<Vault>(current.vaultKey, stored.vault).catch(() => ({})) : {};
  body.vault = Object.keys(vault).length ? await encryptJson(next.vaultKey, vault) : null;
  return {
    body,
    /** Call once the server accepted the change. */
    async done() {
      if (rewrapped) {
        await remember({ userId, publicKey: rewrapped.publicKey, privateKey: await unwrapPrivateKey(rewrapped.wrapped, next.wrapKey), vaultKey: next.vaultKey });
        vaultCache = vault;
      }
    },
  };
}

// ───────────── settings vault ─────────────

export interface CalendarLink {
  id: string;
  name: string;
  url: string;
}

export interface AiSettings {
  provider: 'anthropic' | 'openai' | 'gemini' | 'mistral' | 'openrouter' | 'custom';
  apiKey: string;
  model: string;
  /** Largest reply the chosen model accepts, when the provider told us. */
  maxOutput?: number;
  /** Address of a self-hosted or other OpenAI-compatible service. */
  baseUrl?: string;
}

/** What a person plugs into OlimTalk. Stored on the server only as ciphertext. */
export interface Vault {
  ai?: AiSettings;
  calendars?: CalendarLink[];
}

let vaultCache: Vault | null = null;

export async function loadVault(): Promise<Vault> {
  if (!identity) return {};
  if (vaultCache) return vaultCache;
  const key = identity.vaultKey;
  const { vault } = await api.get<{ vault: string | null }>('/me/vault');
  vaultCache = vault ? await decryptJson<Vault>(key, vault).catch(() => ({})) : {};
  return vaultCache;
}

export async function saveVault(next: Vault): Promise<void> {
  if (!identity) throw new Error('locked');
  vaultCache = next;
  await api.put('/me/vault', { vault: await encryptJson(identity.vaultKey, next) });
}

// ───────────── messages ─────────────

/** What is inside an encrypted message. */
export interface SecretPayload {
  type: MessageType;
  text: string;
  attachment?: Attachment | null;
}

export async function sealMessage(chatId: number, senderId: number, peerPublicKey: string, payload: SecretPayload): Promise<string> {
  if (!identity) throw new Error('locked');
  return encryptMessage(identity.privateKey, identity.publicKey, peerPublicKey, { chatId, senderId }, payload);
}

export type E2eState = 'ok' | 'locked' | 'failed';

interface Sealed {
  userId: number;
  enc?: string | null;
}

/**
 * Decrypt one envelope of a private conversation with `peerId`. A state instead of a
 * payload means it cannot be read on this device — including when it was not made with a
 * key known for that contact.
 */
export async function openEnvelope(chatId: number, item: Sealed, myId: number, peerId: number | null | undefined): Promise<SecretPayload | E2eState> {
  if (!item.enc) return 'ok';
  if (!identity) return 'locked';
  const mine = item.userId === myId;
  // In a private conversation, whoever is not me is the contact.
  if (!mine && peerId != null && item.userId !== peerId) return 'failed';
  try {
    return await decryptMessage<SecretPayload>(
      identity.privateKey,
      identity.publicKey,
      mine,
      { chatId, senderId: item.userId },
      item.enc,
      contactKeys(myId, mine ? peerId : item.userId),
    );
  } catch {
    return 'failed';
  }
}

// ───────────── files ─────────────

/** Encrypt a file on the device, upload the opaque result, and return the attachment to put inside the message. */
export async function uploadEncrypted(blob: Blob, meta: Omit<Attachment, 'url' | 'size' | 'key'>): Promise<Attachment> {
  const { cipher, key } = await encryptBytes(await blob.arrayBuffer());
  const stored = await api.upload(new Blob([cipher as BlobPart], { type: 'application/octet-stream' }), 'file.bin');
  return { ...meta, url: stored.url, size: blob.size, key };
}

const blobs = new Map<string, Promise<Blob>>();

/** The readable content of an attachment (decrypted on the device when needed). */
export function attachmentBlob(a: Pick<Attachment, 'url' | 'key' | 'mime'>): Promise<Blob> {
  let pending = blobs.get(a.url);
  if (!pending) {
    pending = (async () => {
      const res = await fetch(asset(a.url));
      if (!res.ok) throw new Error('download failed');
      const data = await res.arrayBuffer();
      return a.key ? new Blob([(await decryptBytes(data, a.key)) as BlobPart], { type: a.mime }) : new Blob([data], { type: a.mime });
    })();
    blobs.set(a.url, pending);
    pending.catch(() => blobs.delete(a.url));
    // Keep memory bounded: forget the oldest entries.
    if (blobs.size > 40) blobs.delete(blobs.keys().next().value as string);
  }
  return pending;
}

const urls = new Map<string, Promise<string>>();

/** An address an <img>, <video> or <audio> can display. Plain files are used as they are. */
export function attachmentUrl(a: Pick<Attachment, 'url' | 'key' | 'mime'>): Promise<string> {
  if (!a.key) return Promise.resolve(asset(a.url));
  let pending = urls.get(a.url);
  if (!pending) {
    pending = attachmentBlob(a).then((blob) => URL.createObjectURL(blob));
    urls.set(a.url, pending);
    pending.catch(() => urls.delete(a.url));
  }
  return pending;
}

// ───────────── which keys belong to which contact ─────────────

// Kept on the device: for each contact, the keys the server announced for them (the
// latest last), and whether a change is still waiting for the person's attention.
interface ContactKeys {
  keys: string[];
  changed?: boolean;
}

const trustKey = (myId: number) => `ot_peerkeys_${myId}`;
let trust: { myId: number; map: Record<string, ContactKeys> } | null = null;

function contacts(myId: number): Record<string, ContactKeys> {
  if (trust?.myId === myId) return trust.map;
  const map: Record<string, ContactKeys> = {};
  try {
    const saved = JSON.parse(localStorage.getItem(trustKey(myId)) || '{}') as Record<string, ContactKeys | string>;
    for (const [id, value] of Object.entries(saved)) {
      if (typeof value === 'string') map[id] = { keys: [value] };
      else if (value && Array.isArray(value.keys)) map[id] = { keys: value.keys.filter((k) => typeof k === 'string'), changed: !!value.changed };
    }
  } catch {
    /* storage unavailable: the keys are remembered for this session only */
  }
  trust = { myId, map };
  return map;
}

function persistContacts(myId: number) {
  try {
    localStorage.setItem(trustKey(myId), JSON.stringify(contacts(myId)));
  } catch {
    /* storage unavailable */
  }
}

/**
 * Record the key the server announces for a contact. Returns true while a change of key
 * (new device, reset… or someone in the middle) has not been acknowledged by the person.
 */
export function noteContactKey(myId: number, peerId: number, publicKey: string | null | undefined): boolean {
  const map = contacts(myId);
  const entry = map[peerId];
  if (!publicKey) return !!entry?.changed;
  const current = entry?.keys[entry.keys.length - 1];
  if (current !== publicKey) {
    map[peerId] = { keys: [...(entry?.keys ?? []).filter((k) => k !== publicKey), publicKey].slice(-10), changed: entry?.changed || current !== undefined };
    persistContacts(myId);
  }
  return !!map[peerId]?.changed;
}

/** The person has seen that this contact's security code changed. */
export function acknowledgeContactKey(myId: number, peerId: number) {
  const entry = contacts(myId)[peerId];
  if (!entry?.changed) return;
  entry.changed = false;
  persistContacts(myId);
}

const contactKeys = (myId: number, peerId: number | null | undefined): readonly string[] => (peerId == null ? [] : (contacts(myId)[peerId]?.keys ?? []));

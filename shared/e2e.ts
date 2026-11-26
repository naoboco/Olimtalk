// End-to-end encryption primitives, built only on the standard Web Crypto API so the
// same code runs in browsers, in the iOS / Android apps and on the server (Node).
//
// Design, in short:
//  - The password never leaves the device. PBKDF2 turns it into a master secret, from
//    which three independent keys are derived (HKDF): an *authentication key* sent to
//    the server in place of the password, a *wrapping key* that encrypts the person's
//    private key, and a *vault key* that encrypts their settings (AI key, calendar links…).
//  - Every person has one ECDH P-256 key pair. The public key is published; the private
//    key is only ever stored on the server wrapped with the wrapping key, which the
//    server cannot derive.
//  - A private conversation uses AES-256-GCM with a key both sides derive from
//    ECDH(own private key, other's public key). The server stores ciphertext only.
//  - "Sealing" encrypts to someone's public key without knowing who they talk to
//    (ephemeral ECDH): used for e-mails forwarded to OlimTalk.
//
// Limits to be honest about: keys are static (no ratchet), so there is no forward
// secrecy as in the Signal protocol, and metadata (who talks to whom, when) stays visible.

const subtle = globalThis.crypto.subtle;
const utf8 = new TextEncoder();
const fromUtf8 = new TextDecoder();

const CURVE = { name: 'ECDH', namedCurve: 'P-256' } as const;
export const PBKDF2_ITERATIONS = 600_000;

// ───────────── encoding ─────────────

export function toBase64(data: ArrayBuffer | Uint8Array): string {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

export function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

const randomBytes = (n: number) => globalThis.crypto.getRandomValues(new Uint8Array(n));

/** A raw, uncompressed P-256 public key: 65 bytes, base64. */
export const PUBLIC_KEY_RE = /^[A-Za-z0-9+/]{87}=$/;

// ───────────── keys derived from the password ─────────────

export interface Secrets {
  /** Sent to the server instead of the password. */
  authKey: string;
  /** Encrypts the private key before it is stored on the server. */
  wrapKey: CryptoKey;
  /** Encrypts the person's settings vault. */
  vaultKey: CryptoKey;
}

async function hkdfBits(master: CryptoKey, info: string): Promise<ArrayBuffer> {
  return subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: utf8.encode('olimtalk-v1'), info: utf8.encode(info) }, master, 256);
}

export async function deriveSecrets(email: string, password: string, iterations = PBKDF2_ITERATIONS): Promise<Secrets> {
  const material = await subtle.importKey('raw', utf8.encode(password.normalize('NFKC')), 'PBKDF2', false, ['deriveBits']);
  const salt = utf8.encode(`olimtalk:${email.trim().toLowerCase()}`);
  const masterBits = await subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, material, 256);
  const master = await subtle.importKey('raw', masterBits, 'HKDF', false, ['deriveBits']);
  const aes = async (info: string) =>
    subtle.importKey('raw', await hkdfBits(master, info), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  return {
    authKey: toBase64(await hkdfBits(master, 'auth')),
    wrapKey: await aes('wrap'),
    vaultKey: await aes('vault'),
  };
}

// ───────────── AES-GCM helpers ─────────────

async function aesEncrypt(key: CryptoKey, plaintext: Uint8Array, aad?: string): Promise<Uint8Array> {
  const iv = randomBytes(12);
  const ct = await subtle.encrypt({ name: 'AES-GCM', iv, ...(aad ? { additionalData: utf8.encode(aad) } : {}) }, key, plaintext as BufferSource);
  const out = new Uint8Array(12 + ct.byteLength);
  out.set(iv);
  out.set(new Uint8Array(ct), 12);
  return out;
}

async function aesDecrypt(key: CryptoKey, data: Uint8Array, aad?: string): Promise<Uint8Array> {
  if (data.length < 12 + 16) throw new Error('ciphertext too short');
  const pt = await subtle.decrypt(
    { name: 'AES-GCM', iv: data.subarray(0, 12) as BufferSource, ...(aad ? { additionalData: utf8.encode(aad) } : {}) },
    key,
    data.subarray(12) as BufferSource,
  );
  return new Uint8Array(pt);
}

/** Encrypt a JSON value with a symmetric key (the settings vault). */
export async function encryptJson(key: CryptoKey, value: unknown, aad?: string): Promise<string> {
  return toBase64(await aesEncrypt(key, utf8.encode(JSON.stringify(value)), aad));
}

export async function decryptJson<T>(key: CryptoKey, data: string, aad?: string): Promise<T> {
  return JSON.parse(fromUtf8.decode(await aesDecrypt(key, fromBase64(data), aad))) as T;
}

// ───────────── identity key pair ─────────────

export async function generateIdentity(): Promise<{ publicKey: string; privateKey: CryptoKey }> {
  const pair = await subtle.generateKey(CURVE, true, ['deriveBits']);
  return { publicKey: toBase64(await subtle.exportKey('raw', pair.publicKey)), privateKey: pair.privateKey };
}

const importPublic = (publicKey: string) => subtle.importKey('raw', fromBase64(publicKey), CURVE, true, []);

/** The private key, encrypted with the wrapping key: this is what the server stores. */
export async function wrapPrivateKey(privateKey: CryptoKey, wrapKey: CryptoKey): Promise<string> {
  return toBase64(await aesEncrypt(wrapKey, new Uint8Array(await subtle.exportKey('pkcs8', privateKey))));
}

/** Fails (throws) when the wrapping key — hence the password — is wrong. */
export async function unwrapPrivateKey(wrapped: string, wrapKey: CryptoKey, extractable = false): Promise<CryptoKey> {
  const pkcs8 = await aesDecrypt(wrapKey, fromBase64(wrapped));
  return subtle.importKey('pkcs8', pkcs8 as BufferSource, CURVE, extractable, ['deriveBits']);
}

// ───────────── private conversations ─────────────

const dmKeys = new WeakMap<CryptoKey, Map<string, Promise<CryptoKey>>>();

/** The AES key two people share for one conversation. Both sides derive the same one. */
export function conversationKey(privateKey: CryptoKey, peerPublicKey: string, chatId: number): Promise<CryptoKey> {
  let cache = dmKeys.get(privateKey);
  if (!cache) dmKeys.set(privateKey, (cache = new Map()));
  const id = `${chatId}:${peerPublicKey}`;
  let key = cache.get(id);
  if (!key) {
    key = (async () => {
      const shared = await subtle.deriveBits({ name: 'ECDH', public: await importPublic(peerPublicKey) }, privateKey, 256);
      const material = await subtle.importKey('raw', shared, 'HKDF', false, ['deriveKey']);
      return subtle.deriveKey(
        { name: 'HKDF', hash: 'SHA-256', salt: utf8.encode('olimtalk-dm-v1'), info: utf8.encode(String(chatId)) },
        material,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt'],
      );
    })();
    cache.set(id, key);
    key.catch(() => cache.delete(id));
  }
  return key;
}

/** What the server stores for an encrypted message. */
export interface Envelope {
  v: 1;
  /** Public key of the sender when the message was written. */
  f: string;
  /** Public key of the recipient when the message was written. */
  t: string;
  /** iv + ciphertext, base64. */
  c: string;
}

export interface EncryptContext {
  chatId: number;
  senderId: number;
}

/** The ciphertext is bound to its conversation and author: it cannot be replayed elsewhere. */
const aadOf = (ctx: EncryptContext) => `${ctx.chatId}:${ctx.senderId}`;

export async function encryptMessage(
  privateKey: CryptoKey,
  ownPublicKey: string,
  peerPublicKey: string,
  ctx: EncryptContext,
  payload: unknown,
): Promise<string> {
  const key = await conversationKey(privateKey, peerPublicKey, ctx.chatId);
  const envelope: Envelope = { v: 1, f: ownPublicKey, t: peerPublicKey, c: await encryptJson(key, payload, aadOf(ctx)) };
  return JSON.stringify(envelope);
}

export function parseEnvelope(enc: string): Envelope | null {
  try {
    const e = JSON.parse(enc) as Envelope;
    return e && e.v === 1 && PUBLIC_KEY_RE.test(e.f) && PUBLIC_KEY_RE.test(e.t) && typeof e.c === 'string' ? e : null;
  } catch {
    return null;
  }
}

/**
 * Decrypt a message of a conversation I take part in. `mine` tells whether I wrote it.
 *
 * `contactKeys` are the public keys this device knows for the other person. The envelope
 * names the key at its other end, and anyone can make an envelope that names a key of
 * their own: accepting only known keys is what stops whoever relays the messages (the
 * server included) from slipping one in under the contact's name — or under mine.
 *
 * Throws when the message was encrypted for another key (e.g. before I reset mine),
 * comes from an unknown key, or was tampered with.
 */
export async function decryptMessage<T>(
  privateKey: CryptoKey,
  ownPublicKey: string,
  mine: boolean,
  ctx: EncryptContext,
  enc: string,
  contactKeys: readonly string[],
): Promise<T> {
  const e = parseEnvelope(enc);
  if (!e) throw new Error('malformed envelope');
  if ((mine ? e.f : e.t) !== ownPublicKey) throw new Error('encrypted for another key');
  const other = mine ? e.t : e.f;
  if (!contactKeys.includes(other)) throw new Error('unknown contact key');
  const key = await conversationKey(privateKey, other, ctx.chatId);
  return decryptJson<T>(key, e.c, aadOf(ctx));
}

// ───────────── files ─────────────

/** Encrypt a file with a fresh random key; the key travels inside the encrypted message. */
export async function encryptBytes(data: ArrayBuffer | Uint8Array): Promise<{ cipher: Uint8Array; key: string }> {
  const raw = randomBytes(32);
  const key = await subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt']);
  return { cipher: await aesEncrypt(key, data instanceof Uint8Array ? data : new Uint8Array(data)), key: toBase64(raw) };
}

export async function decryptBytes(cipher: ArrayBuffer | Uint8Array, keyB64: string): Promise<Uint8Array> {
  const key = await subtle.importKey('raw', fromBase64(keyB64), { name: 'AES-GCM' }, false, ['decrypt']);
  return aesDecrypt(key, cipher instanceof Uint8Array ? cipher : new Uint8Array(cipher));
}

// ───────────── sealing: encrypt to a public key ─────────────

async function sealKey(shared: ArrayBuffer, ephemeralPublic: Uint8Array, usage: KeyUsage): Promise<CryptoKey> {
  const material = await subtle.importKey('raw', shared, 'HKDF', false, ['deriveKey']);
  return subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: ephemeralPublic as BufferSource, info: utf8.encode('olimtalk-seal-v1') },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    [usage],
  );
}

/** Encrypt bytes so that only the owner of `recipientPublicKey` can read them. */
export async function seal(recipientPublicKey: string, data: Uint8Array): Promise<Uint8Array> {
  const ephemeral = await subtle.generateKey(CURVE, true, ['deriveBits']);
  const epk = new Uint8Array(await subtle.exportKey('raw', ephemeral.publicKey));
  const shared = await subtle.deriveBits({ name: 'ECDH', public: await importPublic(recipientPublicKey) }, ephemeral.privateKey, 256);
  const body = await aesEncrypt(await sealKey(shared, epk, 'encrypt'), data);
  const out = new Uint8Array(epk.length + body.length);
  out.set(epk);
  out.set(body, epk.length);
  return out;
}

export async function unseal(privateKey: CryptoKey, sealed: Uint8Array): Promise<Uint8Array> {
  const epk = sealed.subarray(0, 65);
  const publicKey = await subtle.importKey('raw', epk as BufferSource, CURVE, false, []);
  const shared = await subtle.deriveBits({ name: 'ECDH', public: publicKey }, privateKey, 256);
  return aesDecrypt(await sealKey(shared, epk, 'decrypt'), sealed.subarray(65));
}

export const sealJson = async (recipientPublicKey: string, value: unknown) => toBase64(await seal(recipientPublicKey, utf8.encode(JSON.stringify(value))));
export const unsealJson = async <T>(privateKey: CryptoKey, sealed: string) => JSON.parse(fromUtf8.decode(await unseal(privateKey, fromBase64(sealed)))) as T;

// ───────────── security code ─────────────

/**
 * A 60-digit code two people can compare (in person, or by phone) to make sure nobody
 * swapped their keys in transit. It is the same on both sides.
 */
export async function safetyNumber(publicKeyA: string, publicKeyB: string): Promise<string> {
  const [first, second] = [publicKeyA, publicKeyB].sort();
  let digest = new Uint8Array(await subtle.digest('SHA-512', utf8.encode(`olimtalk-safety-v1:${first}:${second}`)));
  // A few more rounds make brute-forcing a look-alike code slower.
  for (let i = 0; i < 1000; i++) digest = new Uint8Array(await subtle.digest('SHA-512', digest));
  const groups: string[] = [];
  for (let i = 0; i < 12; i++) {
    const n = (((digest[i * 5]! << 24) >>> 0) + (digest[i * 5 + 1]! << 16) + (digest[i * 5 + 2]! << 8) + digest[i * 5 + 3]!) % 100000;
    groups.push(String(n).padStart(5, '0'));
  }
  return groups.join(' ');
}

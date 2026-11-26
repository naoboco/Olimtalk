import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  PUBLIC_KEY_RE,
  decryptBytes,
  decryptJson,
  decryptMessage,
  deriveSecrets,
  encryptBytes,
  encryptJson,
  encryptMessage,
  generateIdentity,
  parseEnvelope,
  safetyNumber,
  sealJson,
  unsealJson,
  unwrapPrivateKey,
  wrapPrivateKey,
} from './e2e.ts';

// Fewer PBKDF2 rounds keep the tests fast; the algorithm is the same.
const FAST = 1000;

test('the password yields three independent keys, and the server only ever sees one', async () => {
  const a = await deriveSecrets('Naomie@Example.com ', 'correct horse battery', FAST);
  const b = await deriveSecrets('naomie@example.com', 'correct horse battery', FAST);
  assert.equal(a.authKey, b.authKey, 'same person, same password: same authentication key');
  assert.notEqual(a.authKey, (await deriveSecrets('naomie@example.com', 'another password', FAST)).authKey);
  assert.notEqual(a.authKey, (await deriveSecrets('david@example.com', 'correct horse battery', FAST)).authKey, 'salted per account');
  assert.ok(!a.authKey.includes('correct'));
  // The wrapping and vault keys cannot be exported, and differ from each other.
  const secret = await encryptJson(a.vaultKey, { hello: 'world' });
  assert.deepEqual(await decryptJson(b.vaultKey, secret), { hello: 'world' });
  await assert.rejects(decryptJson(a.wrapKey, secret));
});

test('the private key is stored wrapped; only the right password unwraps it', async () => {
  const me = await generateIdentity();
  assert.match(me.publicKey, PUBLIC_KEY_RE);
  const good = await deriveSecrets('a@example.com', 'my password', FAST);
  const bad = await deriveSecrets('a@example.com', 'not my password', FAST);
  const wrapped = await wrapPrivateKey(me.privateKey, good.wrapKey);
  const restored = await unwrapPrivateKey(wrapped, good.wrapKey);
  assert.equal(restored.extractable, false, 'the key kept on the device cannot be exported');
  await assert.rejects(unwrapPrivateKey(wrapped, bad.wrapKey));
});

test('private messages: both sides read them, nobody else, and tampering is detected', async () => {
  const alice = await generateIdentity();
  const bob = await generateIdentity();
  const eve = await generateIdentity();
  const ctx = { chatId: 42, senderId: 1 };
  const enc = await encryptMessage(alice.privateKey, alice.publicKey, bob.publicKey, ctx, { text: 'Rendez-vous à 18h' });
  assert.ok(!enc.includes('Rendez-vous'));

  assert.deepEqual(await decryptMessage(bob.privateKey, bob.publicKey, false, ctx, enc), { text: 'Rendez-vous à 18h' });
  assert.deepEqual(await decryptMessage(alice.privateKey, alice.publicKey, true, ctx, enc), { text: 'Rendez-vous à 18h' }, 'the author re-reads it');
  await assert.rejects(decryptMessage(eve.privateKey, eve.publicKey, false, ctx, enc), /another key/);

  // Even with the envelope re-addressed to her, an outsider cannot decrypt.
  const forged = JSON.stringify({ ...parseEnvelope(enc)!, t: eve.publicKey });
  await assert.rejects(decryptMessage(eve.privateKey, eve.publicKey, false, ctx, forged));
  // The ciphertext is bound to its conversation and its author.
  await assert.rejects(decryptMessage(bob.privateKey, bob.publicKey, false, { chatId: 43, senderId: 1 }, enc));
  await assert.rejects(decryptMessage(bob.privateKey, bob.publicKey, false, { chatId: 42, senderId: 2 }, enc));
  // A flipped bit is rejected.
  const e = parseEnvelope(enc)!;
  const flipped = e.c.slice(0, 30) + (e.c[30] === 'A' ? 'B' : 'A') + e.c.slice(31);
  await assert.rejects(decryptMessage(bob.privateKey, bob.publicKey, false, ctx, JSON.stringify({ ...e, c: flipped })));
  // Two encryptions of the same text never look alike.
  assert.notEqual(enc, await encryptMessage(alice.privateKey, alice.publicKey, bob.publicKey, ctx, { text: 'Rendez-vous à 18h' }));
});

test('after a key reset, old messages still open for the person who kept their key', async () => {
  const alice = await generateIdentity();
  const bobOld = await generateIdentity();
  const bobNew = await generateIdentity();
  const ctx = { chatId: 7, senderId: 2 };
  const fromOldBob = await encryptMessage(bobOld.privateKey, bobOld.publicKey, alice.publicKey, ctx, { text: 'avant' });
  assert.deepEqual(await decryptMessage(alice.privateKey, alice.publicKey, false, ctx, fromOldBob), { text: 'avant' });
  // Bob, on his new key, can no longer read what he wrote with the old one.
  await assert.rejects(decryptMessage(bobNew.privateKey, bobNew.publicKey, true, ctx, fromOldBob), /another key/);
});

test('files are encrypted with their own random key', async () => {
  const data = new TextEncoder().encode('contenu du document '.repeat(500));
  const { cipher, key } = await encryptBytes(data);
  assert.notDeepEqual(cipher.subarray(12, 40), data.subarray(0, 28));
  assert.deepEqual(await decryptBytes(cipher, key), data);
  const other = await encryptBytes(data);
  await assert.rejects(decryptBytes(cipher, other.key));
});

test('sealing: anyone can encrypt to a public key, only its owner can read', async () => {
  const me = await generateIdentity();
  const other = await generateIdentity();
  const sealed = await sealJson(me.publicKey, { subject: 'Convocation Misrad HaPnim' });
  assert.deepEqual(await unsealJson(me.privateKey, sealed), { subject: 'Convocation Misrad HaPnim' });
  await assert.rejects(unsealJson(other.privateKey, sealed));
});

test('the security code is the same on both sides and changes with either key', async () => {
  const a = await generateIdentity();
  const b = await generateIdentity();
  const c = await generateIdentity();
  const code = await safetyNumber(a.publicKey, b.publicKey);
  assert.match(code, /^(\d{5} ){11}\d{5}$/);
  assert.equal(code, await safetyNumber(b.publicKey, a.publicKey));
  assert.notEqual(code, await safetyNumber(a.publicKey, c.publicKey));
});

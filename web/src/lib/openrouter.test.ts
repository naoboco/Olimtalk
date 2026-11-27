// "Sign in with my account" (OpenRouter): what is sent, what is kept, what comes back.
import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { complete } from './ai/index.ts';
import { authorizationUrl, challengeOf, createChallenge, exchangeCode, rememberVerifier, takeVerifier } from './ai/openrouter.ts';
import { AiError } from './ai/types.ts';
import { pathFromLink } from './links.ts';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

test('the challenge is the SHA-256 of the verifier, as the standard defines it', async () => {
  // Test vector of RFC 7636, appendix B.
  assert.equal(await challengeOf('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'), 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  const one = await createChallenge();
  const two = await createChallenge();
  assert.match(one.verifier, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(one.challenge, await challengeOf(one.verifier));
  assert.notEqual(one.verifier, two.verifier, 'a new secret for every sign-in');
});

test('the person is sent to OpenRouter with the return address and the challenge — never the verifier', async () => {
  const { verifier, challenge } = await createChallenge();
  const url = new URL(authorizationUrl('https://olimtalk.example/connect/openrouter', challenge));
  assert.equal(url.origin + url.pathname, 'https://openrouter.ai/auth');
  assert.deepEqual(Object.fromEntries(url.searchParams), {
    callback_url: 'https://olimtalk.example/connect/openrouter',
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });
  assert.ok(!url.href.includes(verifier));
});

test('the code that comes back is exchanged, with the verifier, for the key of the account', async () => {
  const calls: { url: string; method?: string; body: unknown }[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), method: init?.method, body: JSON.parse(String(init?.body)) });
    return new Response(JSON.stringify({ key: 'sk-or-v1-account-key', user_id: 'user_123' }), { status: 200 });
  }) as typeof fetch;
  assert.equal(await exchangeCode('the-code', 'the-verifier'), 'sk-or-v1-account-key');
  assert.deepEqual(calls, [
    { url: 'https://openrouter.ai/api/v1/auth/keys', method: 'POST', body: { code: 'the-code', code_verifier: 'the-verifier', code_challenge_method: 'S256' } },
  ]);

  // A code that was already used, or does not match the verifier, is refused.
  globalThis.fetch = (async () => new Response(JSON.stringify({ error: { message: 'Invalid code' } }), { status: 403 })) as typeof fetch;
  await assert.rejects(exchangeCode('stolen-code', 'another-verifier'), AiError);
  globalThis.fetch = (async () => new Response('{}', { status: 200 })) as typeof fetch;
  await assert.rejects(exchangeCode('code', 'verifier'), AiError, 'an answer without a key is an error');
});

test('the verifier waits on the device for the way back, and is used only once', () => {
  const stored = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => stored.get(k) ?? null,
    setItem: (k: string, v: string) => void stored.set(k, v),
    removeItem: (k: string) => void stored.delete(k),
  };
  try {
    assert.equal(takeVerifier(), null, 'nothing was started');
    rememberVerifier('secret-verifier');
    assert.equal(takeVerifier(), 'secret-verifier');
    assert.equal(takeVerifier(), null, 'gone once used');
    // A sign-in left unfinished for too long is forgotten.
    const realNow = Date.now;
    rememberVerifier('old-verifier');
    Date.now = () => realNow() + 16 * 60_000;
    try {
      assert.equal(takeVerifier(), null);
    } finally {
      Date.now = realNow;
    }
  } finally {
    delete (globalThis as { localStorage?: unknown }).localStorage;
  }
});

test('once connected, requests go to OpenRouter with the key of the account', async () => {
  let seen: { url: string; auth: string | null; model: string } | null = null;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    seen = { url: String(input), auth: new Headers(init?.headers).get('authorization'), model: JSON.parse(String(init?.body)).model };
    return new Response(JSON.stringify({ choices: [{ message: { content: 'Bonjour !' }, finish_reason: 'stop' }] }), { status: 200 });
  }) as typeof fetch;
  const answer = await complete({ provider: 'openrouter', apiKey: 'sk-or-v1-account-key', model: 'openrouter/auto' }, { messages: [{ role: 'user', content: 'Salut' }] });
  assert.equal(answer, 'Bonjour !');
  assert.deepEqual(seen, { url: 'https://openrouter.ai/api/v1/chat/completions', auth: 'Bearer sk-or-v1-account-key', model: 'openrouter/auto' });
});

test('links that open a screen of the app', () => {
  assert.equal(pathFromLink('https://olimtalk.example/join/abcDEF123'), '/join/abcDEF123');
  assert.equal(pathFromLink('olimtalk://join/abcDEF123'), '/join/abcDEF123');
  // The way back from signing in on the phone's browser.
  assert.equal(pathFromLink('olimtalk://connect/openrouter?code=a1-b2_c3'), '/connect/openrouter?code=a1-b2_c3');
  assert.equal(pathFromLink('olimtalk://connect/openrouter?code=a%26b%3Dc'), '/connect/openrouter?code=a%26b%3Dc', 'the code is kept as one value');
  for (const other of ['olimtalk://connect/openrouter', 'olimtalk://connect/elsewhere?code=x', 'olimtalk://me', 'https://olimtalk.example/chats/12', 'not a link']) {
    assert.equal(pathFromLink(other), null, other);
  }
});

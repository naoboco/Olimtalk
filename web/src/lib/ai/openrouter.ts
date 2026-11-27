// "Sign in with my account": OpenRouter lets a person connect their account to an app in
// one go (OAuth with PKCE). They sign in on OpenRouter's own page, the app receives a key
// tied to their account, and from then on answers come back inside OlimTalk. One account
// reaches the models of OpenAI, Anthropic, Google, Mistral and others.
//
// The flow, as documented by OpenRouter and implemented in its official SDK:
//   1. send the person to https://openrouter.ai/auth?callback_url=…&code_challenge=…&code_challenge_method=S256
//   2. they come back to callback_url with ?code=…
//   3. POST https://openrouter.ai/api/v1/auth/keys { code, code_verifier, code_challenge_method }
//      → { key, user_id }
// The verifier never leaves this device, so a code seen by anyone else is useless.
import { errorDetail, httpJson } from './http.ts';
import { OPENROUTER_BASE } from './openai-compatible.ts';
import { AiError, errorForStatus } from './types.ts';

const AUTHORIZE_URL = 'https://openrouter.ai/auth';

/** Lets OpenRouter choose a suitable model for each request. */
export const OPENROUTER_DEFAULT_MODEL = 'openrouter/auto';

const base64Url = (bytes: Uint8Array) => {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

/** The PKCE challenge of a verifier: base64url(SHA-256(verifier)), per RFC 7636. */
export async function challengeOf(verifier: string): Promise<string> {
  return base64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
}

/** A fresh secret (32 random bytes) and the challenge to show OpenRouter. */
export async function createChallenge(): Promise<{ verifier: string; challenge: string }> {
  const verifier = base64Url(crypto.getRandomValues(new Uint8Array(32)));
  return { verifier, challenge: await challengeOf(verifier) };
}

/** Where to send the person so that they sign in and authorise OlimTalk. */
export function authorizationUrl(callbackUrl: string, challenge: string): string {
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set('callback_url', callbackUrl);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  return url.toString();
}

/** Exchange the code that came back for the person's key. */
export async function exchangeCode(code: string, verifier: string): Promise<string> {
  const { status, data } = await httpJson(`${OPENROUTER_BASE}/auth/keys`, {
    method: 'POST',
    body: { code, code_verifier: verifier, code_challenge_method: 'S256' },
  });
  if (status < 200 || status >= 300) throw errorForStatus(status, errorDetail(data));
  const key = (data as { key?: unknown } | null)?.key;
  if (typeof key !== 'string' || !key) throw new AiError('empty');
  return key;
}

// ───────────── the sign-in in progress ─────────────
// The verifier has to survive the trip to OpenRouter and back (a page reload on the
// website, a detour through the browser on the phone). It is kept on the device for a
// few minutes and removed as soon as it has been used.

const PENDING_KEY = 'ot_openrouter_signin';
const PENDING_TTL = 15 * 60_000;

export function rememberVerifier(verifier: string) {
  localStorage.setItem(PENDING_KEY, JSON.stringify({ verifier, at: Date.now() }));
}

/** The verifier of the sign-in that was started on this device, once. */
export function takeVerifier(): string | null {
  try {
    const saved = localStorage.getItem(PENDING_KEY);
    localStorage.removeItem(PENDING_KEY);
    if (!saved) return null;
    const pending = JSON.parse(saved) as { verifier?: unknown; at?: unknown };
    if (typeof pending.verifier !== 'string' || typeof pending.at !== 'number' || Date.now() - pending.at > PENDING_TTL) return null;
    return pending.verifier;
  } catch {
    return null;
  }
}

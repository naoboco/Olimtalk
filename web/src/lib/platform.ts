// Where the code runs: the website (served by the OlimTalk server itself) or the
// iOS / Android apps (interface bundled in the app, server reached over the network).
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

const trim = (s: string | undefined) => (s ?? '').trim().replace(/\/+$/, '');

/** True inside the iOS / Android apps. */
export const IS_NATIVE = Capacitor.isNativePlatform();
export const PLATFORM = Capacitor.getPlatform(); // 'ios' | 'android' | 'web'

/**
 * Address of the OlimTalk server. Empty on the website (same origin).
 * The apps get it at build time: VITE_API_URL=https://your-domain npm run build:app
 */
export const API_ORIGIN = trim(import.meta.env.VITE_API_URL as string | undefined);

/** The apps cannot use the website's cookie: they keep a session token instead. */
export const TOKEN_MODE = IS_NATIVE || (API_ORIGIN !== '' && API_ORIGIN !== window.location.origin);

/** Public address used in the links people share (invitations, events…). */
export const PUBLIC_ORIGIN = trim(import.meta.env.VITE_PUBLIC_URL as string | undefined) || API_ORIGIN || window.location.origin;

/** An app built without a server address cannot work: say so instead of failing silently. */
export const MISCONFIGURED = IS_NATIVE && API_ORIGIN === '';

/** Uploaded files are stored as "/uploads/…": make them absolute for the apps. */
export function asset(url: string): string;
export function asset(url: string | null | undefined): string | undefined;
export function asset(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  return url.startsWith('/uploads/') ? API_ORIGIN + url : url;
}

// ───────────── session token (apps only) ─────────────

const TOKEN_KEY = 'ot_token';
let token: string | null = null;

export const getToken = () => token;

export async function loadToken(): Promise<void> {
  if (!TOKEN_MODE) return;
  try {
    token = (await Preferences.get({ key: TOKEN_KEY })).value;
  } catch {
    token = null;
  }
}

export async function saveToken(value: string | null): Promise<void> {
  token = value;
  if (!TOKEN_MODE) return;
  try {
    if (value) await Preferences.set({ key: TOKEN_KEY, value });
    else await Preferences.remove({ key: TOKEN_KEY });
  } catch {
    /* storage unavailable: the session lasts until the app is closed */
  }
}

/** Open a link outside the app: WhatsApp, the browser, the mail app… */
export async function openExternal(url: string): Promise<void> {
  if (IS_NATIVE) {
    try {
      const { AppLauncher } = await import('@capacitor/app-launcher');
      await AppLauncher.openUrl({ url });
      return;
    } catch {
      /* fall through to the web behaviour */
    }
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

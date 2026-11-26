// Glue between the web interface and the iOS / Android shells (Capacitor).
// Everything here is a no-op on the website.
import { App } from '@capacitor/app';
import { SystemBars, SystemBarsStyle } from '@capacitor/core';
import { SplashScreen } from '@capacitor/splash-screen';
import { dismissTop } from '../components/ui.tsx';
import { IS_NATIVE, PLATFORM } from './platform.ts';
import { useStore } from './store.ts';

/** Status-bar icons must contrast with the current theme. */
export function syncSystemBars() {
  if (!IS_NATIVE) return;
  const theme = useStore.getState().theme;
  const dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  void SystemBars.setStyle({ style: dark ? SystemBarsStyle.Dark : SystemBarsStyle.Light }).catch(() => undefined);
}

/**
 * Translate a shared OlimTalk link into a screen of the app:
 *   https://your-domain/join/abc  →  /join/abc
 *   olimtalk://join/abc           →  /join/abc
 */
export function pathFromLink(link: string): string | null {
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return null;
  }
  const path = url.protocol === 'http:' || url.protocol === 'https:' ? url.pathname : `/${url.host}${url.pathname}`;
  const match = /^\/join\/([A-Za-z0-9_-]{1,80})\/?$/.exec(path);
  return match ? `/join/${match[1]}` : null;
}

/** Reveal the interface once there is something to show. */
export function hideSplash() {
  if (IS_NATIVE) void SplashScreen.hide().catch(() => undefined);
}

type Navigate = (path: string, options?: { replace?: boolean }) => void;

/** Wire the native events. Returns a cleanup function. */
export function initNative(navigate: Navigate): () => void {
  if (!IS_NATIVE) return () => undefined;
  document.documentElement.classList.add('native', `platform-${PLATFORM}`);
  syncSystemBars();
  const scheme = window.matchMedia('(prefers-color-scheme: dark)');
  scheme.addEventListener('change', syncSystemBars);

  const listeners = [
    // Android back button: close what is open, then go back, then leave the app.
    App.addListener('backButton', ({ canGoBack }) => {
      if (dismissTop()) return;
      const path = window.location.pathname;
      if (/^\/chats\/\d+/.test(path)) return navigate('/chats', { replace: true });
      if (path === '/chats' || path === '/welcome') return void App.minimizeApp();
      if (canGoBack) window.history.back();
      else navigate('/chats', { replace: true });
    }),
    // An invitation link opened from WhatsApp, a browser…
    App.addListener('appUrlOpen', ({ url }) => {
      const path = pathFromLink(url);
      if (path) navigate(path);
    }),
    // Back to the foreground: reconnect and catch up.
    App.addListener('appStateChange', ({ isActive }) => {
      if (isActive) useStore.getState().resume();
    }),
  ];

  return () => {
    scheme.removeEventListener('change', syncSystemBars);
    for (const l of listeners) void l.then((h) => h.remove()).catch(() => undefined);
  };
}

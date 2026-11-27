// Links that open a screen of the app.

/**
 * Translate a shared OlimTalk link into a screen of the app:
 *   https://your-domain/join/abc  →  /join/abc
 *   olimtalk://join/abc           →  /join/abc
 * and the way back from signing in to one's AI account:
 *   olimtalk://connect/openrouter?code=…  →  /connect/openrouter?code=…
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
  if (match) return `/join/${match[1]}`;
  const code = url.searchParams.get('code');
  if (/^\/connect\/openrouter\/?$/.test(path) && code && code.length <= 500) return `/connect/openrouter?code=${encodeURIComponent(code)}`;
  return null;
}

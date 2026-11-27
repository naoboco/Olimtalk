// "Relay" mode: using one's own AI without any API key.
//
// Chat subscriptions (ChatGPT, Claude, Gemini…) cannot be driven by another app, so
// OlimTalk does the next best thing: it writes the request, copies it, and opens the AI
// application the person already uses, signed in with their own account. The answer is
// read there. Nothing goes through the OlimTalk server, and nobody needs a key.
export type AiAppId = 'chatgpt' | 'claude' | 'gemini' | 'mistral' | 'copilot' | 'other';

export interface AiApp {
  id: AiAppId;
  label: string;
  /** Where a new conversation starts. */
  home: string | null;
  /** Address parameter that carries the request, for the apps known to accept one. */
  queryParam?: string;
}

// Only ChatGPT and Le Chat are consistently reported to accept the request in the
// address. The others open on a new conversation, where the copied request is pasted.
export const AI_APPS: Record<AiAppId, AiApp> = {
  chatgpt: { id: 'chatgpt', label: 'ChatGPT', home: 'https://chatgpt.com/', queryParam: 'q' },
  claude: { id: 'claude', label: 'Claude', home: 'https://claude.ai/new' },
  gemini: { id: 'gemini', label: 'Gemini', home: 'https://gemini.google.com/app' },
  mistral: { id: 'mistral', label: 'Le Chat (Mistral)', home: 'https://chat.mistral.ai/chat', queryParam: 'q' },
  copilot: { id: 'copilot', label: 'Copilot', home: 'https://copilot.microsoft.com/' },
  other: { id: 'other', label: '', home: null },
};

export const AI_APP_ORDER: AiAppId[] = ['chatgpt', 'claude', 'gemini', 'mistral', 'copilot', 'other'];

export const isAiApp = (value: unknown): value is AiAppId => typeof value === 'string' && Object.hasOwn(AI_APPS, value);

/** What fits in an address; the copied request is not shortened this much. */
const MAX_IN_ADDRESS = 1500;
const MAX_REQUEST = 12_000;

const shorten = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

/** The address that opens the chosen app, carrying the request when the app accepts one. */
export function relayUrl(app: AiAppId, request: string): string | null {
  const { home, queryParam } = AI_APPS[app];
  if (!home) return null;
  if (!queryParam) return home;
  const url = new URL(home);
  url.searchParams.set(queryParam, shorten(request, MAX_IN_ADDRESS));
  return url.toString();
}

/** A request written from one of the app's templates ("Translate this message…\n\n{text}"). */
export function relayRequest(template: string, text: string): string {
  return shorten(template.replace('{text}', text.trim()), MAX_REQUEST);
}

// "Bring your own AI": a person plugs in the assistant they already pay for (or run
// themselves). Requests go straight from their device to that provider with their own
// key — OlimTalk's server takes no part in them.
import type { AiSettings } from '../e2ee.ts';

export type { AiSettings };

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface AiRequest {
  system?: string;
  messages: ChatTurn[];
  /** Called with each piece of text as it arrives, for providers that stream. */
  onText?: (delta: string) => void;
  signal?: AbortSignal;
}

export interface AiModel {
  id: string;
  name: string;
  maxOutput?: number;
}

export type AiErrorCode = 'invalid_key' | 'rate_limited' | 'refused' | 'network' | 'bad_request' | 'unavailable' | 'empty';

export class AiError extends Error {
  constructor(
    public code: AiErrorCode,
    message?: string,
  ) {
    super(message || code);
  }
}

/** Map an HTTP status of any provider to the error shown to the person. */
export function errorForStatus(status: number, detail?: string): AiError {
  if (status === 401 || status === 403) return new AiError('invalid_key', detail);
  if (status === 429) return new AiError('rate_limited', detail);
  if (status === 400 || status === 404 || status === 422) return new AiError('bad_request', detail);
  return new AiError('unavailable', detail);
}

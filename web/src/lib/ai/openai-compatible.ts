// OpenAI, Mistral, and any service that speaks the same "chat completions" protocol
// (a self-hosted model, a company gateway…), over plain HTTP.
import { errorDetail, httpJson } from './http.ts';
import { AiError, errorForStatus, type AiModel, type AiRequest, type AiSettings } from './types.ts';

export const OPENAI_BASE = 'https://api.openai.com/v1';
export const MISTRAL_BASE = 'https://api.mistral.ai/v1';

export function baseUrlOf(settings: AiSettings): string {
  if (settings.provider === 'openai') return OPENAI_BASE;
  if (settings.provider === 'mistral') return MISTRAL_BASE;
  return (settings.baseUrl ?? '').trim().replace(/\/+$/, '');
}

const auth = (settings: AiSettings): Record<string, string> => (settings.apiKey ? { Authorization: `Bearer ${settings.apiKey}` } : {});

interface Completion {
  choices?: { message?: { content?: string | { type?: string; text?: string }[] | null; refusal?: string | null }; finish_reason?: string }[];
}

export async function openAiCompatibleComplete(settings: AiSettings, request: AiRequest): Promise<string> {
  const base = baseUrlOf(settings);
  if (!/^https?:\/\//.test(base)) throw new AiError('bad_request', 'base url');
  const { status, data } = await httpJson(`${base}/chat/completions`, {
    method: 'POST',
    headers: auth(settings),
    signal: request.signal,
    body: {
      model: settings.model,
      messages: [...(request.system ? [{ role: 'system', content: request.system }] : []), ...request.messages],
    },
  });
  if (status < 200 || status >= 300) throw errorForStatus(status, errorDetail(data));
  const choice = (data as Completion).choices?.[0];
  if (choice?.message?.refusal || choice?.finish_reason === 'content_filter') throw new AiError('refused');
  const content = choice?.message?.content;
  const text = typeof content === 'string' ? content : Array.isArray(content) ? content.map((part) => part.text ?? '').join('') : '';
  if (!text.trim()) throw new AiError('empty');
  request.onText?.(text);
  return text;
}

export async function openAiCompatibleModels(settings: AiSettings): Promise<AiModel[]> {
  const base = baseUrlOf(settings);
  if (!/^https?:\/\//.test(base)) throw new AiError('bad_request', 'base url');
  const { status, data } = await httpJson(`${base}/models`, { method: 'GET', headers: auth(settings) });
  if (status < 200 || status >= 300) throw errorForStatus(status, errorDetail(data));
  const list = (data as { data?: { id: string }[] }).data ?? [];
  return list.map((m) => ({ id: m.id, name: m.id })).sort((a, b) => a.id.localeCompare(b.id));
}

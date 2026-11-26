// Google Gemini, over its REST API.
import { errorDetail, httpJson } from './http.ts';
import { AiError, errorForStatus, type AiModel, type AiRequest, type AiSettings } from './types.ts';

const BASE = 'https://generativelanguage.googleapis.com/v1beta';

interface GenerateResponse {
  candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
}

export async function geminiComplete(settings: AiSettings, request: AiRequest): Promise<string> {
  const model = settings.model.replace(/^models\//, '');
  const { status, data } = await httpJson(`${BASE}/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'x-goog-api-key': settings.apiKey },
    signal: request.signal,
    body: {
      ...(request.system ? { systemInstruction: { parts: [{ text: request.system }] } } : {}),
      contents: request.messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
    },
  });
  if (status < 200 || status >= 300) throw errorForStatus(status, errorDetail(data));
  const body = data as GenerateResponse;
  const candidate = body.candidates?.[0];
  if (body.promptFeedback?.blockReason || candidate?.finishReason === 'SAFETY' || candidate?.finishReason === 'PROHIBITED_CONTENT') throw new AiError('refused');
  const text = (candidate?.content?.parts ?? []).map((p) => p.text ?? '').join('');
  if (!text.trim()) throw new AiError('empty');
  request.onText?.(text);
  return text;
}

export async function geminiModels(settings: AiSettings): Promise<AiModel[]> {
  const { status, data } = await httpJson(`${BASE}/models?pageSize=200`, { method: 'GET', headers: { 'x-goog-api-key': settings.apiKey } });
  if (status < 200 || status >= 300) throw errorForStatus(status, errorDetail(data));
  const list = (data as { models?: { name: string; displayName?: string; outputTokenLimit?: number; supportedGenerationMethods?: string[] }[] }).models ?? [];
  return list
    .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
    .map((m) => ({ id: m.name.replace(/^models\//, ''), name: m.displayName || m.name, maxOutput: m.outputTokenLimit }));
}

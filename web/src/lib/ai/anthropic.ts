// Claude, through the official Anthropic SDK.
import Anthropic from '@anthropic-ai/sdk';
import { AiError, type AiModel, type AiRequest, type AiSettings } from './types.ts';

// The key belongs to the person using the app and never leaves their device except to
// reach Anthropic: calling the API directly from the app is the intended design here.
const clientFor = (settings: AiSettings) => new Anthropic({ apiKey: settings.apiKey, dangerouslyAllowBrowser: true });

/**
 * On these models a safety classifier may decline a request. Asking for the server-side
 * fallback lets the API route such a request to another Claude model inside the same call.
 */
const WITH_FALLBACK = new Set(['claude-fable-5-2', 'claude-fable-5-1', 'claude-opus-5-5', 'claude-opus-5', 'claude-sonnet-5-5']);
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

function toAiError(error: unknown): AiError {
  if (error instanceof AiError) return error;
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) return new AiError('invalid_key', error.message);
  if (error instanceof Anthropic.RateLimitError) return new AiError('rate_limited', error.message);
  if (error instanceof Anthropic.NotFoundError || error instanceof Anthropic.BadRequestError) return new AiError('bad_request', error.message);
  if (error instanceof Anthropic.APIConnectionError) return new AiError('network', error.message);
  if (error instanceof Anthropic.APIError) return new AiError('unavailable', error.message);
  return new AiError('network', error instanceof Error ? error.message : undefined);
}

export async function anthropicComplete(settings: AiSettings, request: AiRequest): Promise<string> {
  const client = clientFor(settings);
  const params = {
    model: settings.model,
    // Room for a long answer, within what the chosen model accepts.
    max_tokens: Math.min(settings.maxOutput ?? 16000, 16000),
    ...(request.system ? { system: request.system } : {}),
    messages: request.messages,
  };
  const options = { signal: request.signal };
  try {
    let final: { stop_reason: string | null; content: { type: string; text?: string }[] } | undefined;
    if (WITH_FALLBACK.has(settings.model)) {
      try {
        const stream = client.beta.messages.stream({ ...params, betas: [FALLBACK_BETA], fallbacks: 'default' }, options);
        stream.on('text', (delta) => request.onText?.(delta));
        final = await stream.finalMessage();
      } catch (error) {
        // An account or platform without the fallback beta rejects the request before
        // producing anything: send it again as a plain request.
        if (!(error instanceof Anthropic.BadRequestError)) throw error;
      }
    }
    if (!final) {
      const stream = client.messages.stream(params, options);
      stream.on('text', (delta) => request.onText?.(delta));
      final = await stream.finalMessage();
    }
    // Always look at why the model stopped before reading what it wrote.
    if (final.stop_reason === 'refusal') throw new AiError('refused');
    const text = final.content.map((block) => (block.type === 'text' ? (block.text ?? '') : '')).join('');
    if (!text.trim()) throw new AiError('empty');
    return text;
  } catch (error) {
    throw toAiError(error);
  }
}

export async function anthropicModels(settings: AiSettings): Promise<AiModel[]> {
  try {
    const models: AiModel[] = [];
    for await (const model of clientFor(settings).models.list()) {
      if (model.lifecycle === 'retired') continue;
      models.push({ id: model.id, name: model.display_name, maxOutput: model.max_tokens ?? undefined });
    }
    return models;
  } catch (error) {
    throw toAiError(error);
  }
}

// JSON over HTTP for the providers that have no SDK here. Inside the iOS / Android apps
// the request is made natively, which is not subject to browser cross-origin rules.
import { Capacitor } from '@capacitor/core';
import { AiError } from './types.ts';

export interface HttpResult {
  status: number;
  data: unknown;
}

function parse(text: unknown): unknown {
  if (typeof text !== 'string') return text;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function httpJson(
  url: string,
  init: { method: 'GET' | 'POST'; headers?: Record<string, string>; body?: unknown; signal?: AbortSignal },
): Promise<HttpResult> {
  const headers = { Accept: 'application/json', ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...init.headers };
  try {
    if (Capacitor.isNativePlatform()) {
      const { CapacitorHttp } = await import('@capacitor/core');
      const res = await CapacitorHttp.request({ url, method: init.method, headers, data: init.body, connectTimeout: 20_000, readTimeout: 180_000 });
      return { status: res.status, data: parse(res.data) };
    }
    const res = await fetch(url, {
      method: init.method,
      headers,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: init.signal,
    });
    return { status: res.status, data: parse(await res.text()) };
  } catch (error) {
    throw new AiError('network', error instanceof Error ? error.message : undefined);
  }
}

/** Best-effort extraction of a provider's error message. */
export function errorDetail(data: unknown): string | undefined {
  const d = data as { error?: { message?: string } | string; message?: string } | undefined;
  if (!d) return undefined;
  if (typeof d.error === 'string') return d.error;
  return d.error?.message ?? d.message;
}

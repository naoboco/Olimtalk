import type { Attachment } from '../../../shared/types.ts';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message?: string,
  ) {
    super(message || code);
  }
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch('/api' + url, {
      method,
      credentials: 'same-origin',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'network_error');
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
  if (!res.ok) throw new ApiError(res.status, data.error || 'server_error', data.message);
  return data as T;
}

export const api = {
  get: <T>(url: string) => request<T>('GET', url),
  post: <T>(url: string, body: unknown = {}) => request<T>('POST', url, body),
  patch: <T>(url: string, body: unknown = {}) => request<T>('PATCH', url, body),
  del: <T>(url: string) => request<T>('DELETE', url),

  async upload(file: Blob, name: string): Promise<Attachment> {
    const form = new FormData();
    form.append('file', file, name);
    let res: Response;
    try {
      res = await fetch('/api/upload', { method: 'POST', body: form, credentials: 'same-origin' });
    } catch {
      throw new ApiError(0, 'network_error');
    }
    const data = (await res.json().catch(() => ({}))) as Attachment & { error?: string };
    if (!res.ok) throw new ApiError(res.status, data.error || 'server_error');
    return data;
  },
};

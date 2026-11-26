import type { Attachment } from '../../../shared/types.ts';
import { API_ORIGIN, TOKEN_MODE, getToken } from './platform.ts';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message?: string,
  ) {
    super(message || code);
  }
}

/** The website relies on its httpOnly cookie; the apps send their session token. */
function authHeaders(): Record<string, string> {
  if (!TOKEN_MODE) return {};
  const token = getToken();
  return { 'X-OlimTalk-Client': 'app', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

const credentials: RequestCredentials = TOKEN_MODE ? 'omit' : 'same-origin';

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_ORIGIN}/api${url}`, {
      method,
      credentials,
      headers: { ...authHeaders(), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
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
  put: <T>(url: string, body: unknown = {}) => request<T>('PUT', url, body),
  del: <T>(url: string) => request<T>('DELETE', url),

  async upload(file: Blob, name: string): Promise<Attachment> {
    const form = new FormData();
    form.append('file', file, name);
    let res: Response;
    try {
      res = await fetch(`${API_ORIGIN}/api/upload`, { method: 'POST', body: form, credentials, headers: authHeaders() });
    } catch {
      throw new ApiError(0, 'network_error');
    }
    const data = (await res.json().catch(() => ({}))) as Attachment & { error?: string };
    if (!res.ok) throw new ApiError(res.status, data.error || 'server_error');
    return data;
  },
};

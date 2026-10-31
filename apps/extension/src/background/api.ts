import type { ApiError as ApiErrorBody } from '@vff/shared';
import { API_BASE } from '../env';

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: ApiErrorBody,
  ) {
    super(body.error);
  }
}

/** `form`: a multipart body (audio) in place of the JSON `body`. */
export async function api<T>(path: string, init: { method?: string; body?: unknown; form?: FormData; token?: string } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: init.method ?? (init.body || init.form ? 'POST' : 'GET'),
      headers: {
        ...(init.body ? { 'content-type': 'application/json' } : {}),
        ...(init.token ? { authorization: `Bearer ${init.token}` } : {}),
      },
      body: init.form ?? (init.body ? JSON.stringify(init.body) : undefined),
    });
  } catch {
    throw new ApiError(0, { error: `Can't reach the server at ${API_BASE}` });
  }
  const body = await res.json().catch(() => ({ error: `Server error (${res.status})` }));
  if (!res.ok) throw new ApiError(res.status, body as ApiErrorBody);
  return body as T;
}

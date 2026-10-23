import type { ApiError } from '@vff/shared';

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { 'content-type': 'application/json', ...init?.headers } });
  const body = await res.json();
  if (!res.ok) throw new Error((body as ApiError).error);
  return body as T;
}

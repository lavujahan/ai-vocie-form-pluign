// Sarvam AI REST client (https://docs.sarvam.ai). Server-side only; reads the key at call time.

export const SARVAM_BASE = 'https://api.sarvam.ai';

export class SarvamError extends Error {
  constructor(
    public status: number,
    public code: string | null,
    message: string,
  ) {
    super(message);
  }
}

/** Sarvam or OpenAI rate-limited or briefly down (HTTP 429 / 5xx): worth one more try. */
export function isTransient(e: unknown): boolean {
  const status = (e as { status?: unknown } | null)?.status;
  return typeof status === 'number' && (status === 429 || status >= 500);
}

export async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (!isTransient(e)) throw e;
    await new Promise((r) => setTimeout(r, 1000));
    return fn();
  }
}

function apiKey(): string {
  const key = process.env.SARVAM_API_KEY;
  if (!key) throw new Error('Missing environment variable SARVAM_API_KEY');
  return key;
}

/** POSTs JSON or multipart to Sarvam and returns the parsed JSON body, throwing SarvamError on failure. */
export async function sarvamPost<T>(path: string, body: FormData | Record<string, unknown>, signal?: AbortSignal): Promise<T> {
  const isForm = body instanceof FormData;
  const res = await fetch(`${SARVAM_BASE}${path}`, {
    method: 'POST',
    headers: {
      'api-subscription-key': apiKey(),
      ...(isForm ? {} : { 'content-type': 'application/json' }),
    },
    body: isForm ? body : JSON.stringify(body),
    signal,
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON error page */
  }
  if (!res.ok) {
    const err = (json as { error?: { message?: string; code?: string } } | null)?.error;
    throw new SarvamError(res.status, err?.code ?? null, err?.message ?? (text.slice(0, 300) || `Sarvam HTTP ${res.status}`));
  }
  return json as T;
}

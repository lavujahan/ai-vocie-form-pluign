import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { ZodError } from 'zod';
import type { ApiError } from '@vff/shared';

export class HttpError extends Error {
  constructor(
    public status: number,
    public body: ApiError,
  ) {
    super(body.error);
  }
}

export const fail = (status: number, error: string, extra: Omit<ApiError, 'error'> = {}) =>
  new HttpError(status, { error, ...extra });

type Handler<C> = (req: NextRequest, ctx: C) => Promise<Response>;

/** Wraps a route handler: maps HttpError / ZodError to JSON responses. */
export function route<C>(fn: Handler<C>): Handler<C> {
  return async (req, ctx) => {
    try {
      return await fn(req, ctx);
    } catch (e) {
      if (e instanceof HttpError) return NextResponse.json(e.body, { status: e.status });
      if (e instanceof ZodError) {
        const msg = e.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; ');
        return NextResponse.json({ error: msg } satisfies ApiError, { status: 400 });
      }
      console.error(e);
      return NextResponse.json({ error: 'Something went wrong' } satisfies ApiError, { status: 500 });
    }
  };
}

export function clientIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  );
}

/** Throws a 500 HttpError if a Supabase call failed. */
export function must<T>(res: { data: T; error: { message: string; code?: string } | null }): T {
  if (res.error) {
    console.error('supabase error', res.error);
    throw fail(500, 'Database error');
  }
  return res.data;
}

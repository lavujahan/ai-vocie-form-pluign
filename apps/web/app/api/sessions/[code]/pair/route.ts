import { NextResponse } from 'next/server';
import type { PairResponse } from '@vff/shared';
import { signSessionJwt } from '@/lib/auth';
import { fail, must, route } from '@/lib/http';
import { pairFailure } from '@/lib/session-rules';
import { getSessionByCode, getSnapshot, nextSeq, withSessionDefaults } from '@/lib/sessions';
import { db } from '@/lib/supabase-admin';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ code: string }> };

/** Exchanges a single-use QR code for a phone session JWT. */
export const POST = route<Ctx>(async (_req, { params }) => {
  const { code } = await params;

  // One conditional update: only a waiting, unexpired session can be paired, and only once.
  const row = must(
    await db()
      .from('form_sessions')
      .update({ status: 'paired', paired_at: new Date().toISOString() })
      .eq('session_code', code)
      .eq('status', 'waiting')
      .gt('expires_at', new Date().toISOString())
      .select('*')
      .maybeSingle(),
  ) as Record<string, unknown> | null;
  if (!row) {
    // Tell "already opened on another phone" apart from "expired".
    const existing = await getSessionByCode(code).catch(() => null);
    throw fail(410, pairFailure(existing));
  }
  const session = withSessionDefaults(row);

  const { token, expires_at } = await signSessionJwt(session.id);
  const snapshot = await getSnapshot(session);
  return NextResponse.json({
    token,
    token_expires_at: expires_at,
    ...snapshot,
    next_seq: nextSeq(snapshot.values, snapshot.utterances, snapshot.session.reset_seq),
  } satisfies PairResponse);
});

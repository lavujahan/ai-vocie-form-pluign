import { NextResponse } from 'next/server';
import type { TamilPadPairResponse } from '@vff/shared';
import { fail, must, route } from '@/lib/http';
import { db } from '@/lib/supabase-admin';
import { getPad, PAD_MSG, padPieces, signPadJwt, type PadRow } from '@/lib/tamil-pads';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ code: string }> };

/** The phone scanned a Tamil typing QR: single use, within its 10 minutes. */
export const POST = route<Ctx>(async (_req, { params }) => {
  const { code } = await params;
  const now = new Date().toISOString();
  const pad = must(
    await db()
      .from('tamil_pads')
      .update({ paired_at: now, last_seen_at: now })
      .eq('code', code)
      .is('paired_at', null)
      .is('ended_at', null)
      .gt('expires_at', now)
      .select('*')
      .maybeSingle(),
  ) as PadRow | null;
  if (!pad) {
    const existing = await getPad(code);
    throw fail(410, existing.ended_at ? PAD_MSG.gone : existing.paired_at ? PAD_MSG.used : PAD_MSG.expired);
  }
  const { token, expires_at } = await signPadJwt(pad.id);
  return NextResponse.json({ token, token_expires_at: expires_at, pieces: await padPieces(pad.id) } satisfies TamilPadPairResponse);
});

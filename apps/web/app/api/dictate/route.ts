import { NextResponse } from 'next/server';
import type { DictateResponse } from '@vff/shared';
import { requireUser } from '@/lib/auth';
import { assertCanUse } from '@/lib/billing/plans';
import { dictate, readPiece } from '@/lib/dictation';
import { route } from '@/lib/http';

export const runtime = 'nodejs';
export const maxDuration = 60;

/** Tamil typing in the extension popup, on the computer's mic: one piece of speech into Tamil text. */
export const POST = route(async (req) => {
  const user = await requireUser(req);
  const piece = readPiece(await req.formData());
  // As on the phone: checked on a recording's first piece only, so a recording that started is never cut off.
  if (piece.part === 0) await assertCanUse(user.id, user.role);
  const { text } = await dictate(piece, user.id, 'dictate');
  return NextResponse.json({ text } satisfies DictateResponse);
});

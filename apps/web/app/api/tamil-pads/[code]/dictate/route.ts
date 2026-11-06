import { NextResponse } from 'next/server';
import type { TamilPadDictateResponse, TamilPadPiece } from '@vff/shared';
import { assertCanUse } from '@/lib/billing/plans';
import { dictate, readPiece } from '@/lib/dictation';
import { fail, must, route } from '@/lib/http';
import { db } from '@/lib/supabase-admin';
import { addPiece, getPiece, joinText, requirePadPhone, touchPad, updatePiece } from '@/lib/tamil-pads';

export const runtime = 'nodejs';
export const maxDuration = 60;

type Ctx = { params: Promise<{ code: string }> };

/**
 * One piece of speech from the pad's phone into Tamil, saved as a sentence. A recording's first piece
 * makes a new sentence (or, with `replace=<seq>`, Speak again: it replaces that one); its later 28 s
 * pieces carry `seq` and are joined to it. The seconds count in the pad owner's voice minutes.
 */
export const POST = route<Ctx>(async (req, { params }) => {
  const pad = await requirePadPhone(req, (await params).code);
  const form = await req.formData();
  const piece = readPiece(form);
  const seq = form.get('seq') ? Number(form.get('seq')) : null;
  const replace = form.get('replace') ? Number(form.get('replace')) : null;
  for (const n of [seq, replace]) if (n !== null && (!Number.isInteger(n) || n < 1)) throw fail(400, 'Invalid seq');

  const owner = must(await db().from('users').select('id, role, is_active').eq('id', pad.user_id).maybeSingle()) as {
    id: string;
    role: 'admin' | 'user';
    is_active: boolean;
  } | null;
  if (!owner?.is_active) throw fail(403, 'Speaking is off. Ask at the counter.', { code: 'plan_expired' });
  // As everywhere: checked on a recording's first piece only, so a recording that started is never cut off.
  if (piece.part === 0) await assertCanUse(owner.id, owner.role);
  // Speak again on a sentence that is gone: refuse before anything is spent.
  const target = replace ?? seq;
  const before = target !== null ? await getPiece(pad.id, target) : null;

  const { text, audioMs } = await dictate(piece, owner.id, 'tamil-pad');
  let saved: TamilPadPiece | null = null;
  if (before && replace !== null) {
    saved = text ? await updatePiece(pad.id, replace, { text, deleted: false, audio_ms: audioMs }) : null;
  } else if (before) {
    saved = text ? await updatePiece(pad.id, before.seq, { text: joinText(before.text, text), audio_ms: before.audio_ms + audioMs }) : null;
  } else if (text) {
    saved = await addPiece(pad.id, text, audioMs);
  }
  await touchPad(pad.id);
  return NextResponse.json({ text, piece: saved } satisfies TamilPadDictateResponse);
});

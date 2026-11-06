import { NextResponse } from 'next/server';
import { TamilPieceUpdate, type TamilPadPiece } from '@vff/shared';
import { fail, route } from '@/lib/http';
import { getPiece, requirePadPhone, touchPad, updatePiece } from '@/lib/tamil-pads';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ code: string; seq: string }> };

/** Edit or delete a sentence on the phone. Costs nothing; the computer's text follows (Realtime). */
export const PATCH = route<Ctx>(async (req, { params }) => {
  const { code, seq: raw } = await params;
  const pad = await requirePadPhone(req, code);
  const seq = Number(raw);
  if (!Number.isInteger(seq) || seq < 1) throw fail(400, 'Invalid seq');
  const body = TamilPieceUpdate.parse(await req.json());
  await getPiece(pad.id, seq);
  const piece = await updatePiece(pad.id, seq, body);
  await touchPad(pad.id);
  return NextResponse.json(piece satisfies TamilPadPiece);
});

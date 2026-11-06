import { NextResponse } from 'next/server';
import type { TamilPadInfo } from '@vff/shared';
import { must, route } from '@/lib/http';
import { getPad, padAccess, padInfo } from '@/lib/tamil-pads';
import { db } from '@/lib/supabase-admin';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ code: string }> };

/** The pad and its sentences: the extension catching up after a missed event, the phone after a reload. */
export const GET = route<Ctx>(async (req, { params }) => {
  const pad = await getPad((await params).code);
  await padAccess(req, pad);
  return NextResponse.json((await padInfo(pad)) satisfies TamilPadInfo);
});

/** Done on the phone or Disconnect in the popup: the phone stops; the text stays on the computer. */
export const DELETE = route<Ctx>(async (req, { params }) => {
  const pad = await getPad((await params).code);
  await padAccess(req, pad);
  if (!pad.ended_at) must(await db().from('tamil_pads').update({ ended_at: new Date().toISOString() }).eq('id', pad.id));
  return NextResponse.json({ ok: true });
});

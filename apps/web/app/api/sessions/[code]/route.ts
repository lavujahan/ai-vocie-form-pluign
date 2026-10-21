import { NextResponse } from 'next/server';
import { requireSessionAccess } from '@/lib/auth';
import { route } from '@/lib/http';
import { getSessionByCode, getSnapshot, nextSeq } from '@/lib/sessions';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ code: string }> };

/** Current state of a session, for the owning extension user or the paired phone (e.g. after a reload). */
export const GET = route<Ctx>(async (req, { params }) => {
  const { code } = await params;
  const session = await getSessionByCode(code);
  await requireSessionAccess(req, session);
  const snapshot = await getSnapshot(session);
  return NextResponse.json({ ...snapshot, next_seq: nextSeq(snapshot.values, snapshot.utterances) });
});

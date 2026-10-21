import { NextResponse } from 'next/server';
import { requirePhone } from '@/lib/auth';
import { fail, must, route } from '@/lib/http';
import { assertWritable, getSessionByCode } from '@/lib/sessions';
import { db } from '@/lib/supabase-admin';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ code: string }> };

/** "Send to desktop": marks the session filled. Values already stream live; this is a signal for the popup. */
export const POST = route<Ctx>(async (req, { params }) => {
  const { code } = await params;
  const claims = await requirePhone(req);
  const session = await getSessionByCode(code);
  if (claims.session_id !== session.id) throw fail(403, 'Not allowed');
  assertWritable(session);
  must(await db().from('form_sessions').update({ status: 'filled' }).eq('id', session.id));
  return NextResponse.json({ ok: true });
});

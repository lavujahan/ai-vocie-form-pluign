import { NextResponse } from 'next/server';
import { requirePhone } from '@/lib/auth';
import { fail, must, route } from '@/lib/http';
import { sendBlock } from '@/lib/session-rules';
import { assertPhoneOf, assertWritable, getSessionByCode } from '@/lib/sessions';
import { db } from '@/lib/supabase-admin';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ code: string }> };

/** "Send to desktop": marks the session filled. Values already stream live; this is a signal for the popup. */
export const POST = route<Ctx>(async (req, { params }) => {
  const { code } = await params;
  const claims = await requirePhone(req);
  const session = await getSessionByCode(code);
  assertPhoneOf(claims, session);
  assertWritable(session);
  // The form tab on the computer is closed or on another site: nothing would be filled.
  const block = sendBlock(session);
  if (block) throw fail(409, block, { code: session.desktop_state === 'closed' ? 'tab_closed' : 'tab_moved' });
  // "Send again" (the computer didn't fill last time): the extension reacts to the change *into*
  // 'filled', so step back to 'paired' first.
  if (session.status === 'filled') must(await db().from('form_sessions').update({ status: 'paired' }).eq('id', session.id));
  must(await db().from('form_sessions').update({ status: 'filled' }).eq('id', session.id));
  return NextResponse.json({ ok: true });
});

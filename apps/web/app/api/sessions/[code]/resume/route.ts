import { NextResponse } from 'next/server';
import { RESUME_HOLD_MIN, type CreateSessionResponse } from '@vff/shared';
import { requireUser } from '@/lib/auth';
import { env } from '@/lib/env';
import { fail, must, route } from '@/lib/http';
import { isHeld, MSG } from '@/lib/session-rules';
import { getSessionByCode } from '@/lib/sessions';
import { db } from '@/lib/supabase-admin';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ code: string }> };

/**
 * From the extension, "Use": a form the customer sent carries on in a new tab (the old one logged out
 * or was closed). The same session, so nothing is read by the AI again and no voice minutes are used.
 * The form tab counts as open again, also for a phone still on the form, whose token keeps working.
 */
export const POST = route<Ctx>(async (req, { params }) => {
  const { code } = await params;
  const user = await requireUser(req);
  const session = await getSessionByCode(code);
  if (session.user_id !== user.id) throw fail(403, 'Not allowed');
  if (!isHeld(session)) throw fail(410, MSG.heldGone);

  const atLeast = Date.now() + RESUME_HOLD_MIN * 60_000;
  const holdUntil = new Date(Math.max(Date.parse(session.hold_until!), atLeast)).toISOString();
  must(await db().from('form_sessions').update({ desktop_state: 'open', hold_until: holdUntil }).eq('id', session.id));
  // A first fill used these up (the computer had them): their fields ask the phone again.
  await db().from('field_files').delete().eq('session_id', session.id).eq('status', 'filled');

  return NextResponse.json({
    session_id: session.id,
    session_code: code,
    qr_url: `${env.publicBaseUrl}/s/${code}`,
    expires_at: session.expires_at,
    form_name: session.form_name,
  } satisfies CreateSessionResponse);
});

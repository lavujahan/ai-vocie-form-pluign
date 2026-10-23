import { NextResponse } from 'next/server';
import { ResetRequest } from '@vff/shared';
import { requirePhone } from '@/lib/auth';
import { fail, must, route } from '@/lib/http';
import { removeSessionFiles } from '@/lib/files/storage';
import { assertPhoneCanWrite, getSessionByCode } from '@/lib/sessions';
import { db } from '@/lib/supabase-admin';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ code: string }> };

/**
 * "Start over" on the phone: every answer is cleared at the phone's next seq, so utterances still in
 * flight (older seq) can't bring old values back. Scope 'both' also tells the extension to clear the
 * form on the computer (it sees reset_seq / reset_scope change on form_sessions).
 */
export const POST = route<Ctx>(async (req, { params }) => {
  const { code } = await params;
  const claims = await requirePhone(req);
  const session = await getSessionByCode(code);
  if (claims.session_id !== session.id) throw fail(403, 'Not allowed');
  const body = ResetRequest.parse(await req.json());
  assertPhoneCanWrite(session, body.seq);

  // Uploaded photos / PDFs go too (reset_session deletes their rows; storage objects need the API).
  await removeSessionFiles(session.id);
  const done = must(
    await db().rpc('reset_session', { p_session: session.id, p_seq: body.seq, p_scope: body.scope }),
  ) as boolean;
  if (!done) throw fail(409, 'This form was already cleared. Reload the page.');
  return NextResponse.json({ ok: true, reset_seq: body.seq });
});

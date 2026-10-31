import { NextResponse } from 'next/server';
import { HideLatestRequest, type LatestFormsResponse } from '@vff/shared';
import { requireUser } from '@/lib/auth';
import { fail, must, route } from '@/lib/http';
import { latestForms, type OperatorForm } from '@/lib/queue';
import { getSessionById } from '@/lib/sessions';
import { db } from '@/lib/supabase-admin';

export const runtime = 'nodejs';

/** No operator_forms yet (migration 0025 not applied). */
const isMissingFunction = (code: string | undefined) => code === '42883' || code === 'PGRST202';

/** For the extension: the forms in form memory this user has used, each ready for a new QR code. */
export const GET = route(async (req) => {
  const user = await requireUser(req);
  const res = await db().rpc('operator_forms', { p_user: user.id });
  if (isMissingFunction(res.error?.code)) return NextResponse.json({ forms: [] } satisfies LatestFormsResponse);
  return NextResponse.json({ forms: latestForms(must(res) as OperatorForm[]) } satisfies LatestFormsResponse);
});

/**
 * From the extension, × on a form: it leaves this user's list. Their sessions of the form are hidden; they
 * stay, so answers waiting for the operator are untouched, and form memory is not changed. A later scan
 * lists the form again.
 */
export const DELETE = route(async (req) => {
  const user = await requireUser(req);
  const { source_id } = HideLatestRequest.parse(await req.json());
  const source = await getSessionById(source_id);
  if (source.user_id !== user.id) throw fail(403, 'Not allowed');
  if (!source.form_fingerprint) throw fail(410, 'This form is no longer available.');

  must(await db().from('form_sessions').update({ latest_hidden: true }).eq('user_id', user.id).eq('form_fingerprint', source.form_fingerprint));
  return NextResponse.json({ ok: true });
});

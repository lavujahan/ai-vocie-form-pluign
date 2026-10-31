import { NextResponse } from 'next/server';
import { HideLatestRequest, type LatestFormsResponse } from '@vff/shared';
import { requireUser } from '@/lib/auth';
import { fail, must, route } from '@/lib/http';
import { latestForms, type ScannedForm } from '@/lib/queue';
import { getSessionById } from '@/lib/sessions';
import { db } from '@/lib/supabase-admin';

export const runtime = 'nodejs';

/** No user_scanned_forms yet (migration 0023 not applied). */
const isMissingFunction = (code: string | undefined) => code === '42883' || code === 'PGRST202';

/** For the extension: the forms this user scanned lately, each ready for a new QR code. */
export const GET = route(async (req) => {
  const user = await requireUser(req);
  const res = await db().rpc('user_scanned_forms', { p_user: user.id });
  if (isMissingFunction(res.error?.code)) return NextResponse.json({ forms: [] } satisfies LatestFormsResponse);
  return NextResponse.json({ forms: latestForms(must(res) as ScannedForm[]) } satisfies LatestFormsResponse);
});

/**
 * From the extension, × on a form: it leaves this user's list. Every session of the form is hidden (the list
 * is made from them all); they stay, so answers waiting for the operator are untouched. A later scan lists
 * the form again.
 */
export const DELETE = route(async (req) => {
  const user = await requireUser(req);
  const { source_id } = HideLatestRequest.parse(await req.json());
  const source = await getSessionById(source_id);
  if (source.user_id !== user.id) throw fail(403, 'Not allowed');

  const res = await db()
    .from('form_sessions')
    .update({ latest_hidden: true })
    .eq('user_id', user.id)
    .eq('page_origin', source.page_origin)
    .eq('form_name', source.form_name);
  if (res.error?.code === 'PGRST204' || res.error?.code === '42703') {
    throw fail(503, 'Deleting forms needs a server update (migration 0024).');
  }
  must(res);
  return NextResponse.json({ ok: true });
});

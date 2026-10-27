import { NextResponse } from 'next/server';
import { DesktopUpdateRequest, type DesktopReport } from '@vff/shared';
import { requireUser } from '@/lib/auth';
import { isCompleted, isMissingCompletions } from '@/lib/completions';
import { fail, must, route } from '@/lib/http';
import { removeSessionFiles } from '@/lib/files/storage';
import { getSessionByCode } from '@/lib/sessions';
import { db } from '@/lib/supabase-admin';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ code: string }> };

/**
 * From the extension: the form tab's state ('open' | 'moved' to another site | 'closed') and the
 * result of a full fill. The phone gets both through Realtime (form_sessions UPDATE): it stops
 * sending when the tab isn't open, and shows "Filled on computer ✓ 14/16" after Send to desktop.
 */
export const PATCH = route<Ctx>(async (req, { params }) => {
  const { code } = await params;
  const user = await requireUser(req);
  const session = await getSessionByCode(code);
  if (session.user_id !== user.id) throw fail(403, 'Not allowed');
  const body = DesktopUpdateRequest.parse(await req.json());

  const patch: Record<string, unknown> = {};
  // A closed tab is final for this QR code: a late 'open' or 'moved' must not revive it.
  if (body.state && session.desktop_state !== 'closed') patch.desktop_state = body.state;
  if (body.report) patch.desktop_report = { ...body.report, at: new Date().toISOString() } satisfies DesktopReport;
  if (Object.keys(patch).length) must(await db().from('form_sessions').update(patch).eq('id', session.id));
  if (body.report) await recordCompletion(session, body.report.filled);
  // The form tab is closed: nothing can use the uploaded files any more.
  if (body.state === 'closed') {
    await removeSessionFiles(session.id);
    await db().from('field_files').delete().eq('session_id', session.id);
  }
  return NextResponse.json({ ok: true });
});

/**
 * A full fill that left at most 2 of the form's non-upload fields empty counts the form as completed,
 * once per session (a later Send again / Fill form doesn't count twice). Never fails the request.
 */
async function recordCompletion(
  session: { id: string; user_id: string; form_name: string | null; page_url: string },
  filled: number,
): Promise<void> {
  const { count } = await db()
    .from('form_fields')
    .select('id', { count: 'exact', head: true })
    .eq('session_id', session.id)
    .neq('field_type', 'file');
  const fields = count ?? 0;
  if (!isCompleted(filled, fields)) return;
  const { error } = await db()
    .from('form_completions')
    .upsert(
      { session_id: session.id, user_id: session.user_id, form_name: session.form_name ?? '', page_url: session.page_url, fields, filled },
      { onConflict: 'session_id', ignoreDuplicates: true },
    );
  if (error && !isMissingCompletions(error.code)) console.warn('form completion not recorded', error);
}

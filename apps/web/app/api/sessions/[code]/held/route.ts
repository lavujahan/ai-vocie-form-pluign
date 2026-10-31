import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { removeSessionFiles } from '@/lib/files/storage';
import { fail, must, route } from '@/lib/http';
import { getSessionByCode } from '@/lib/sessions';
import { db } from '@/lib/supabase-admin';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ code: string }> };

/** From the extension, × on a waiting form: the customer's answers and files are deleted now. */
export const DELETE = route<Ctx>(async (req, { params }) => {
  const { code } = await params;
  const user = await requireUser(req);
  const session = await getSessionByCode(code);
  if (session.user_id !== user.id) throw fail(403, 'Not allowed');

  // First, so a phone still on the form can't write while the rest goes.
  must(await db().from('form_sessions').update({ status: 'expired', desktop_state: 'closed', hold_until: null }).eq('id', session.id));
  await removeSessionFiles(session.id);
  await Promise.all([
    db().from('field_files').delete().eq('session_id', session.id),
    db().from('field_values').delete().eq('session_id', session.id),
    db().from('utterances').delete().eq('session_id', session.id),
    db().from('form_fields').update({ choice_hint: null }).eq('session_id', session.id).not('choice_hint', 'is', null),
  ]);
  return NextResponse.json({ ok: true });
});

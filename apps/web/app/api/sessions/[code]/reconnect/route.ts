import { NextResponse } from 'next/server';
import { PAIR_CODE_TTL_MIN, type ReconnectResponse } from '@vff/shared';
import { requireUser } from '@/lib/auth';
import { fail, must, route } from '@/lib/http';
import { getSessionByCode } from '@/lib/sessions';
import { db } from '@/lib/supabase-admin';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ code: string }> };

/**
 * From the extension, "Connect phone again": the phone page was closed (back button, tab closed), so
 * the same QR code is made scannable again for this form, with every answer kept. The next phone to
 * scan it pairs; tokens of the earlier phone stop working (they carry the old `paired_at`).
 */
export const POST = route<Ctx>(async (req, { params }) => {
  const { code } = await params;
  const user = await requireUser(req);
  const session = await getSessionByCode(code);
  if (session.user_id !== user.id) throw fail(403, 'Not allowed');

  const expiresAt = new Date(Date.now() + PAIR_CODE_TTL_MIN * 60_000).toISOString();
  // One conditional update: never for an expired session or a closed form tab.
  const row = must(
    await db()
      .from('form_sessions')
      .update({ status: 'waiting', paired_at: null, expires_at: expiresAt })
      .eq('id', session.id)
      .in('status', ['waiting', 'paired', 'filled'])
      .neq('desktop_state', 'closed')
      .select('id')
      .maybeSingle(),
  );
  if (!row) throw fail(409, 'This form session has ended. Scan the form again.');
  return NextResponse.json({ expires_at: expiresAt } satisfies ReconnectResponse);
});

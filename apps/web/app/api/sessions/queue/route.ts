import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { PAIR_CODE_TTL_MIN, QueueSessionRequest, type CreateSessionResponse } from '@vff/shared';
import { pageOf } from '@/lib/agents/formCache';
import { requireUser } from '@/lib/auth';
import { assertCanUse } from '@/lib/billing/plans';
import { env } from '@/lib/env';
import { fail, must, route } from '@/lib/http';
import { cloneFieldRows } from '@/lib/queue';
import { getFieldRows, getSessionById } from '@/lib/sessions';
import { db } from '@/lib/supabase-admin';

export const runtime = 'nodejs';

/**
 * A new QR code for a form under Latest forms: a customer fills it on their phone while waiting, and the
 * operator picks it up from the waiting list at their turn. The session starts from a copy of an earlier
 * scan's fields, so no page is needed and the AI reads nothing.
 */
export const POST = route(async (req) => {
  const user = await requireUser(req);
  const { source_id, voice } = QueueSessionRequest.parse(await req.json());
  await assertCanUse(user.id, user.role, { minutes: voice });

  const source = await getSessionById(source_id);
  if (source.user_id !== user.id) throw fail(403, 'Not allowed');
  const fields = await getFieldRows(source.id);
  if (!fields.length) throw fail(410, 'This form is no longer available. Scan it again.');

  const sessionCode = randomBytes(16).toString('base64url');
  const expiresAt = new Date(Date.now() + PAIR_CODE_TTL_MIN * 60_000).toISOString();
  const inserted = await db()
    .from('form_sessions')
    .insert({
      user_id: user.id,
      session_code: sessionCode,
      form_name: source.form_name,
      // Without the query string: it may hold the last applicant's id.
      page_url: pageOf(source.page_url),
      page_origin: source.page_origin,
      page_title: source.page_title,
      analysis_status: 'done',
      expires_at: expiresAt,
      queued: true,
      voice_enabled: voice,
    })
    .select('id')
    .single();
  if (inserted.error?.code === 'PGRST204' || inserted.error?.code === '42703') {
    throw fail(503, 'QR codes for saved forms need a server update (migration 0023).');
  }
  const session = must(inserted) as { id: string };
  must(await db().from('form_fields').insert(cloneFieldRows(fields, session.id)));

  return NextResponse.json(
    {
      session_id: session.id,
      session_code: sessionCode,
      qr_url: `${env.publicBaseUrl}/s/${sessionCode}`,
      expires_at: expiresAt,
      form_name: source.form_name,
    } satisfies CreateSessionResponse,
    { status: 201 },
  );
});

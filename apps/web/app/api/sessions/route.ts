import { randomBytes } from 'node:crypto';
import { after, NextResponse } from 'next/server';
import { FormSchema, PAIR_CODE_TTL_MIN, type CreateSessionResponse } from '@vff/shared';
import { analyzeAndStore } from '@/lib/agents/formAnalyzer';
import { purgeExpiredFiles } from '@/lib/files/storage';
import { requireUser } from '@/lib/auth';
import { env } from '@/lib/env';
import { must, route } from '@/lib/http';
import { fieldRows, insertFieldRows } from '@/lib/sessions';
import { db } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const maxDuration = 120;

/** Makes field keys unique (the detector may produce duplicates on messy pages). */
function dedupeKeys<T extends { field_key: string }>(fields: T[]): T[] {
  const seen = new Map<string, number>();
  return fields.map((f) => {
    const n = seen.get(f.field_key) ?? 0;
    seen.set(f.field_key, n + 1);
    return n ? { ...f, field_key: `${f.field_key}#${n + 1}` } : f;
  });
}

export const POST = route(async (req) => {
  const user = await requireUser(req);
  const schema = FormSchema.parse(await req.json());
  schema.fields = dedupeKeys(schema.fields);

  const url = new URL(schema.page_url);
  const sessionCode = randomBytes(16).toString('base64url');
  const expiresAt = new Date(Date.now() + PAIR_CODE_TTL_MIN * 60_000).toISOString();
  const formName = (schema.form_title || schema.page_title || url.hostname).slice(0, 120);

  const session = must(
    await db()
      .from('form_sessions')
      .insert({
        user_id: user.id,
        session_code: sessionCode,
        form_name: formName,
        page_url: schema.page_url,
        page_origin: url.origin,
        page_title: schema.page_title,
        expires_at: expiresAt,
      })
      .select('id')
      .single(),
  ) as { id: string };

  await insertFieldRows(fieldRows(session.id, schema.fields));

  // The Form Analyzer takes a few seconds; the QR is shown right away and the
  // analysis lands in form_fields (and reaches clients through Realtime) when done.
  after(() => analyzeAndStore(session.id, schema, { userId: user.id }));
  // Uploaded files of sessions that expired meanwhile (normally deleted once filled).
  after(() => purgeExpiredFiles().catch((e) => console.warn('file purge failed', e)));

  return NextResponse.json(
    {
      session_id: session.id,
      session_code: sessionCode,
      qr_url: `${env.publicBaseUrl}/s/${sessionCode}`,
      expires_at: expiresAt,
      form_name: formName,
    } satisfies CreateSessionResponse,
    { status: 201 },
  );
});

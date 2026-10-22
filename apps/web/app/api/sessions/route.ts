import { randomBytes } from 'node:crypto';
import { after, NextResponse } from 'next/server';
import { FormSchema, PAIR_CODE_TTL_MIN, type CreateSessionResponse } from '@vff/shared';
import { analyzeAndStore } from '@/lib/agents/formAnalyzer';
import { requireUser } from '@/lib/auth';
import { env } from '@/lib/env';
import { must, route } from '@/lib/http';
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

  const rows = schema.fields.map((f, position) => ({
    session_id: session.id,
    field_key: f.field_key,
    label: f.label,
    field_type: f.field_type,
    required: f.required,
    options: f.options,
    multiple: f.multiple,
    dynamic_options: f.dynamic_options,
    group_key: f.group_key,
    depends_on: f.depends_on,
    step_index: f.step_index,
    min: f.min,
    max: f.max,
    pattern: f.pattern,
    placeholder: f.placeholder,
    context: f.context,
    position,
  }));
  let inserted = await db().from('form_fields').insert(rows);
  // Migration 0004 (cascading dropdowns) not applied yet: save without the new column.
  if (inserted.error?.code === 'PGRST204') {
    inserted = await db().from('form_fields').insert(rows.map(({ dynamic_options: _d, ...r }) => r));
  }
  must(inserted);

  // The Form Analyzer takes a few seconds; the QR is shown right away and the
  // analysis lands in form_fields (and reaches clients through Realtime) when done.
  after(() => analyzeAndStore(session.id, schema));

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

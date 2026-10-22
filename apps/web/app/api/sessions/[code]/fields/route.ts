import { after, NextResponse } from 'next/server';
import { FormSchema, UpdateFieldsRequest, type AddFieldsResponse } from '@vff/shared';
import { analyzeAndStore } from '@/lib/agents/formAnalyzer';
import { requireUser } from '@/lib/auth';
import { fail, route } from '@/lib/http';
import {
  assertWritable,
  fieldRows,
  getFieldRows,
  getSessionByCode,
  insertFieldRows,
  newFieldsPlacement,
  toSessionField,
} from '@/lib/sessions';
import { db } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const maxDuration = 120;

type Ctx = { params: Promise<{ code: string }> };

/**
 * From the extension: fields that appeared after the first scan (a wizard's next step, a new page of
 * the form, a field shown by a checkbox). They go after the existing fields, as the next step; the
 * phone gets them through Realtime (form_fields INSERT). The Form Analyzer reads just these.
 */
export const POST = route<Ctx>(async (req, { params }) => {
  const { code } = await params;
  const user = await requireUser(req);
  const session = await getSessionByCode(code);
  if (session.user_id !== user.id) throw fail(403, 'Not allowed');
  assertWritable(session);

  const schema = FormSchema.parse(await req.json());
  const { fresh, startPosition, stepIndex } = newFieldsPlacement(await getFieldRows(session.id), schema.fields);
  if (!fresh.length) return NextResponse.json({ fields: [] } satisfies AddFieldsResponse);

  const inserted = await insertFieldRows(fieldRows(session.id, fresh, startPosition, stepIndex));
  after(() => analyzeAndStore(session.id, { ...schema, fields: fresh }, { partial: true }));
  return NextResponse.json({ fields: inserted.map(toSessionField) } satisfies AddFieldsResponse, { status: 201 });
});

/**
 * From the extension after a fill: dropdown options that loaded on the page (cascading dropdowns
 * are empty when the form is scanned) and "choose on your phone" hints for values it couldn't match.
 * The phone gets both through Realtime (form_fields UPDATE).
 */
export const PATCH = route<Ctx>(async (req, { params }) => {
  const { code } = await params;
  const user = await requireUser(req);
  const session = await getSessionByCode(code);
  if (session.user_id !== user.id) throw fail(403, 'Not allowed');

  const body = UpdateFieldsRequest.parse(await req.json());
  const results = await Promise.all(
    body.fields.map(async (f) => {
      const patch: Record<string, unknown> = {};
      if (f.options) patch.options = f.options;
      if (f.choice_hint !== undefined) patch.choice_hint = f.choice_hint;
      if (!Object.keys(patch).length) return 0;
      const { data, error } = await db()
        .from('form_fields')
        .update(patch)
        .eq('session_id', session.id)
        .eq('field_key', f.field_key)
        .select('id');
      if (error) throw fail(500, 'Database error');
      return data?.length ?? 0;
    }),
  );
  return NextResponse.json({ updated: results.reduce((a, b) => a + b, 0) });
});

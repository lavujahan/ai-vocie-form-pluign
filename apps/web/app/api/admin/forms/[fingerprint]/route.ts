import { NextResponse } from 'next/server';
import { AdminFormPatch, type AdminFormDetail, type FieldType, type FormAnalysis } from '@vff/shared';
import { cleanTamilLabel } from '@/lib/agents/formAnalyzer';
import { applyFieldEdits } from '@/lib/agents/formCache';
import { FORM_ROW_COLUMNS, toFormRow, type FormCacheRow } from '@/lib/admin-forms';
import { requireAdmin } from '@/lib/auth';
import { fail, route } from '@/lib/http';
import { db } from '@/lib/supabase-admin';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ fingerprint: string }> };
type SiteField = { field_key: string; label: string; field_type: FieldType; required: boolean };
type FullRow = FormCacheRow & { fields: SiteField[]; analysis: FormAnalysis };

const FINGERPRINT_RE = /^[0-9a-f]{64}$/;

async function load(fingerprint: string): Promise<FullRow> {
  if (!FINGERPRINT_RE.test(fingerprint)) throw fail(404, 'Form not found');
  const { data, error } = await db()
    .from('form_cache')
    .select(`${FORM_ROW_COLUMNS}, fields, analysis`)
    .eq('fingerprint', fingerprint)
    .maybeSingle();
  if (error) throw fail(500, 'Database error');
  if (!data) throw fail(404, 'Form not found');
  return data as FullRow;
}

/** The site's fields next to the reading's labels, in the site's order. */
function detail(row: FullRow): AdminFormDetail {
  const { fields: site, analysis, ...rest } = row;
  const read = new Map(analysis.fields.map((f) => [f.field_key, f]));
  return {
    ...toFormRow(rest),
    fields: site.map((s) => {
      const f = read.get(s.field_key);
      return {
        field_key: s.field_key,
        site_label: s.label,
        field_type: s.field_type,
        site_required: s.required,
        clean_label: f?.clean_label ?? s.label,
        label_ta: f?.label_ta ?? '',
        required: (f?.required ?? false) || s.required,
      };
    }),
  };
}

export const GET = route<Ctx>(async (req, { params }) => {
  await requireAdmin(req);
  return NextResponse.json(detail(await load((await params).fingerprint)));
});

/** Admin edits: English label, Tamil label, required. Later scans of this form use them. */
export const PATCH = route<Ctx>(async (req, { params }) => {
  const admin = await requireAdmin(req);
  const { fingerprint } = await params;
  const body = AdminFormPatch.parse(await req.json());
  const row = await load(fingerprint);
  const known = new Set(row.analysis.fields.map((f) => f.field_key));
  const unknown = body.fields.find((f) => !known.has(f.field_key));
  if (unknown) throw fail(400, `Unknown field ${unknown.field_key}`);
  const edits = body.fields.map((f) => {
    const ta = f.label_ta ? cleanTamilLabel(f.label_ta) : '';
    if (ta === null) throw fail(400, `Tamil label for "${f.clean_label}" must be in Tamil letters`);
    return { ...f, label_ta: ta };
  });
  const analysis: FormAnalysis = { ...row.analysis, fields: applyFieldEdits(row.analysis.fields, edits) };
  const { data, error } = await db()
    .from('form_cache')
    .update({ analysis, edited_at: new Date().toISOString(), edited_by: admin.id })
    .eq('fingerprint', fingerprint)
    .select(`${FORM_ROW_COLUMNS}, fields, analysis`)
    .single();
  if (error || !data) throw fail(500, 'Database error');
  return NextResponse.json(detail(data as FullRow));
});

/** Read again: the saved reading is cleared, so the next scan of this form is read by the AI. */
export const DELETE = route<Ctx>(async (req, { params }) => {
  await requireAdmin(req);
  const { fingerprint } = await params;
  if (!FINGERPRINT_RE.test(fingerprint)) throw fail(404, 'Form not found');
  const { error } = await db().from('form_cache').delete().eq('fingerprint', fingerprint);
  if (error) throw fail(500, 'Database error');
  return NextResponse.json({ ok: true });
});

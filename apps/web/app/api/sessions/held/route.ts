import { NextResponse } from 'next/server';
import { MAX_HELD_FORMS, type DesktopReport, type HeldFormsResponse } from '@vff/shared';
import { requireUser } from '@/lib/auth';
import { customerLabel, filledAt, sentAt } from '@/lib/held';
import { must, route } from '@/lib/http';
import type { FieldRow } from '@/lib/sessions';
import { db } from '@/lib/supabase-admin';

export const runtime = 'nodejs';

type Row = { id: string; session_code: string; form_name: string; page_origin: string; hold_until: string; desktop_report: DesktopReport | null };
type LabelField = Pick<FieldRow, 'id' | 'session_id' | 'field_type' | 'semantic_type'>;

/** For the extension: the last forms customers sent that still wait for the operator, newest first. */
export const GET = route(async (req) => {
  const user = await requireUser(req);
  const res = await db()
    .from('form_sessions')
    .select('id, session_code, form_name, page_origin, hold_until, desktop_report')
    .eq('user_id', user.id)
    .gt('hold_until', new Date().toISOString())
    .neq('status', 'expired')
    .order('hold_until', { ascending: false })
    .limit(MAX_HELD_FORMS);
  // Migration 0022 not applied yet: nothing is on hold.
  if (res.error?.code === '42703') return NextResponse.json({ forms: [] } satisfies HeldFormsResponse);
  const rows = must(res) as unknown as Row[];
  if (!rows.length) return NextResponse.json({ forms: [] } satisfies HeldFormsResponse);

  const ids = rows.map((r) => r.id);
  const [fields, values] = await Promise.all([
    db().from('form_fields').select('id, session_id, field_type, semantic_type').in('session_id', ids).order('position'),
    db().from('field_values').select('session_id, field_id, value').in('session_id', ids),
  ]);
  const allFields = must(fields) as LabelField[];
  const allValues = must(values) as { session_id: string; field_id: string; value: string | null }[];

  return NextResponse.json({
    forms: rows.map((r) => ({
      session_code: r.session_code,
      form_name: r.form_name,
      page_origin: r.page_origin,
      ...customerLabel(
        allFields.filter((f) => f.session_id === r.id),
        allValues.filter((v) => v.session_id === r.id),
      ),
      sent_at: sentAt(r.hold_until),
      hold_until: r.hold_until,
      filled_at: filledAt(r.desktop_report),
    })),
  } satisfies HeldFormsResponse);
});

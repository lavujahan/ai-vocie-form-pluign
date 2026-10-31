import { MAX_LATEST_FORMS, type LatestForm } from '@vff/shared';

/**
 * Queue QR: a form the operator scanned before gets a new QR code for each customer in the queue, with no
 * page open. Pure, like held.ts.
 */

/** A row of user_scanned_forms (migration 0023). */
export type ScannedForm = { id: string; form_name: string; page_origin: string; created_at: string; field_count: number };

/**
 * One row per form, most used first, then last used. The source is the scan with the most fields: a wizard
 * that was only opened at its first step has fewer than one that was followed to the end. The newest wins a
 * tie, so a form the site changed moves on to its new fields. Rows may come in any order. The form used
 * last always stays in the list: one scanned just now has 1 use, and must not look missing.
 */
export function latestForms(rows: ScannedForm[]): LatestForm[] {
  const forms = new Map<string, LatestForm>();
  const newestFirst = rows.filter((r) => r.field_count > 0).sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  for (const r of newestFirst) {
    const key = JSON.stringify([r.page_origin, r.form_name]);
    const form = forms.get(key);
    if (!form) {
      forms.set(key, {
        source_id: r.id,
        form_name: r.form_name,
        page_origin: r.page_origin,
        field_count: r.field_count,
        uses: 1,
        last_used_at: r.created_at,
      });
      continue;
    }
    form.uses++;
    if (r.field_count > form.field_count) {
      form.source_id = r.id;
      form.field_count = r.field_count;
    }
  }
  const all = [...forms.values()];
  const top = [...all]
    .sort((a, b) => b.uses - a.uses || Date.parse(b.last_used_at) - Date.parse(a.last_used_at))
    .slice(0, MAX_LATEST_FORMS);
  const newest = all[0];
  if (newest && !top.includes(newest)) top[top.length - 1] = newest;
  return top;
}

/**
 * A past session's fields for a new session. `context` (text near the field) was read from a page that
 * may have shown the last applicant's details, and only the Form Analyzer uses it. `choice_hint` holds
 * what the last customer said.
 */
export function cloneFieldRows<T extends { id: string; session_id: string }>(rows: T[], sessionId: string) {
  return rows.map(({ id: _id, context: _context, choice_hint: _hint, ...row }: T & { context?: unknown; choice_hint?: unknown }) => ({
    ...row,
    session_id: sessionId,
    context: null,
    choice_hint: null,
  }));
}

import { MAX_LATEST_FORMS, type LatestForm } from '@vff/shared';

/**
 * Queue QR: a form in form memory that the operator has used gets a new QR code for each customer, with no
 * page open. Pure, like held.ts.
 */

/** A row of operator_forms (migration 0025): one form_cache row this user has used. */
export type OperatorForm = {
  fingerprint: string;
  form_name: string;
  page_url: string;
  uses: number;
  last_used_at: string;
  source_id: string;
  field_count: number;
};

/**
 * Most used first, then last used. The form used last always stays in the list: one scanned just now has
 * 1 use, and must not look missing.
 */
export function latestForms(rows: OperatorForm[]): LatestForm[] {
  const used = (r: OperatorForm) => Date.parse(r.last_used_at);
  const top = [...rows].sort((a, b) => b.uses - a.uses || used(b) - used(a)).slice(0, MAX_LATEST_FORMS);
  const newest = [...rows].sort((a, b) => used(b) - used(a))[0];
  if (newest && !top.includes(newest)) top[top.length - 1] = newest;
  return top.map((r) => ({
    source_id: r.source_id,
    form_name: r.form_name,
    page_origin: new URL(r.page_url).origin,
    field_count: r.field_count,
    uses: r.uses,
    last_used_at: r.last_used_at,
  }));
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

import { LOW_CONFIDENCE, type FieldFile, type FillReport, type SessionField, type SessionSnapshot, type SessionValue } from '@vff/shared';
import { NOT_ON_PAGE } from '../messages';

/**
 * How the popup lists a form's fields, by what the operator has to do:
 * - `look`: needs a look (a value the AI wasn't sure of, a value the page refused, an upload the site
 *   refused or whose page button must be clicked, and, once the phone sent the form, required fields
 *   still empty);
 * - `filled`: answered (in the page after the next Fill form);
 * - `todo`: not answered yet, or waiting for its field to appear on the page;
 * - `hidden`: a choice on the page hides it now (the other branch of the form), answers kept.
 * Each list keeps the form's order.
 */
export type FieldGroup = 'look' | 'filled' | 'todo' | 'hidden';

export type FieldItem = {
  field: SessionField;
  value: SessionValue | undefined;
  file: FieldFile | undefined;
  /** Why the last fill skipped it. */
  reason: string | undefined;
  /** Filled upload whose page needs its own "Upload" button clicked. */
  needsClick: boolean;
  /** Spoken value the AI wasn't sure of. */
  low: boolean;
};

export type FieldGroups = Record<FieldGroup, FieldItem[]> & { filledCount: number; total: number };

export function groupFields(
  snap: Pick<SessionSnapshot, 'fields' | 'values' | 'files' | 'session'>,
  skipped: FillReport['skipped'] | undefined,
  uploadClicks: string[],
): FieldGroups {
  const valueOf = new Map(snap.values.map((v) => [v.field_id, v]));
  const fileOf = new Map((snap.files ?? []).map((f) => [f.field_id, f]));
  const reasonOf = new Map((skipped ?? []).map((x) => [x.field_key, x.reason]));
  const hidden = new Set(snap.session.hidden_fields ?? []);
  // Before the phone sends the form, an empty required field is just not answered yet.
  const sent = snap.session.status === 'filled';
  const out: FieldGroups = { look: [], filled: [], todo: [], hidden: [], filledCount: 0, total: 0 };

  for (const field of snap.fields) {
    const value = valueOf.get(field.id);
    const file = fileOf.get(field.id);
    const reason = reasonOf.get(field.field_key);
    const needsClick = uploadClicks.includes(field.field_key);
    const low = !!value?.value && (value.confidence ?? 1) < LOW_CONFIDENCE;
    const item: FieldItem = { field, value, file, reason, needsClick, low };
    out[groupOf(item, hidden.has(field.field_key), sent)].push(item);
  }
  out.filledCount = out.filled.length;
  out.total = out.look.length + out.filled.length + out.todo.length;
  return out;
}

function groupOf({ field, value, file, reason, needsClick, low }: FieldItem, hidden: boolean, sent: boolean): FieldGroup {
  if (hidden) return 'hidden';
  const missing = field.required && sent ? 'look' : 'todo';
  if (field.field_type === 'file') {
    if (file?.status === 'rejected' || needsClick) return 'look';
    if (file?.status === 'uploaded' || file?.status === 'filled') return 'filled';
    return missing;
  }
  if (low) return 'look';
  if (reason && reason !== NOT_ON_PAGE) return 'look';
  if (!value?.value) return missing;
  return reason === NOT_ON_PAGE ? 'todo' : 'filled';
}

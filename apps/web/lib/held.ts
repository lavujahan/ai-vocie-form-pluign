import type { DesktopReport, FieldType, SemanticType } from '@vff/shared';
import { SENT_HOLD_MIN } from '@vff/shared';

type LabelField = { id: string; field_type: FieldType; semantic_type: SemanticType | null };
type LabelValue = { field_id: string; value: string | null };

const MAX_NAME = 40;

/** A value that can stand for a name: never one with digits (a text box may hold an Aadhaar number). */
const nameLike = (v: string | undefined) => (v && !/\d/.test(v) ? v.trim() : '');

/**
 * Who a sent form is for: copies of one form would look the same in the extension's list. The name, and
 * the phone's last 4 digits. No other answer goes into the list.
 */
export function customerLabel(fields: LabelField[], values: LabelValue[]): { customer: string | null; phone_last4: string | null } {
  const valueOf = new Map(values.map((v) => [v.field_id, v.value ?? undefined]));
  const first = (type: SemanticType) => fields.filter((f) => f.semantic_type === type).map((f) => nameLike(valueOf.get(f.id))).find(Boolean) ?? '';
  // Before the Form Analyzer finishes semantic types are empty: the first plain text answer then.
  const plain = fields.filter((f) => f.field_type === 'text' && (!f.semantic_type || f.semantic_type === 'free_text' || f.semantic_type === 'other'));
  const name =
    first('full_name') ||
    [first('first_name'), first('last_name')].filter(Boolean).join(' ') ||
    plain.map((f) => nameLike(valueOf.get(f.id))).find(Boolean) ||
    '';

  const digits = fields
    .filter((f) => f.semantic_type === 'phone' || f.field_type === 'tel')
    .map((f) => (valueOf.get(f.id) ?? '').replace(/\D/g, ''))
    .find((d) => d.length >= 4);
  return { customer: name.slice(0, MAX_NAME) || null, phone_last4: digits?.slice(-4) ?? null };
}

/** Send time, from the hold it set (a hold raised by picking the form up reads a little later). */
export const sentAt = (holdUntil: string) => new Date(Date.parse(holdUntil) - SENT_HOLD_MIN * 60_000).toISOString();

/** When the computer last filled the form: a fill that put nothing in doesn't count. */
export const filledAt = (report: DesktopReport | null | undefined) => (report && report.filled > 0 ? report.at : null);

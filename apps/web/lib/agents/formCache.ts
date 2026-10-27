import { createHash } from 'node:crypto';
import type { FieldAnalysis, FormAnalysis, FormSchema } from '@vff/shared';

/**
 * Form readings shared by all users (table form_cache, migration 0012): a form is read by the AI once,
 * and later scans of the same form reuse the reading. Only form structure is stored, never values.
 */

/** A reading is reused this long, unless the admin edited it (then it is kept until cleared). */
export const FORM_CACHE_DAYS = 30;
const DAY_MS = 86_400_000;

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

/**
 * What identifies a form: the page (origin + path, no query or hash), the form heading, and every
 * field as the site shows it. A changed label, option or help text gives a new fingerprint, so the
 * changed form is read again. The page HTML is left out: it changes per load (dates, tokens).
 */
export function formFingerprint(schema: FormSchema): string {
  const url = new URL(schema.page_url);
  const fields = schema.fields.map((f) => [
    f.field_key,
    f.label,
    f.field_type,
    f.required,
    f.multiple,
    f.options.map((o) => o.label),
    f.group_key,
    f.placeholder,
    f.pattern,
    f.accept,
    f.context,
  ]);
  return sha256(JSON.stringify([url.origin + url.pathname, schema.form_title, fields]));
}

/** Short hash of the analyzer's instructions: changing them reads every form again. */
export const promptVersion = (instructions: string) => sha256(instructions).slice(0, 12);

/** The page a reading belongs to, as shown in the admin list. */
export function pageOf(pageUrl: string): string {
  const url = new URL(pageUrl);
  return url.origin + url.pathname;
}

export type CachedReading = {
  fingerprint: string;
  analysis: FormAnalysis;
  model: string;
  prompt_version: string;
  created_at: string;
  edited_at: string | null;
};

/** When a reading stops being reused; null for an edited reading (kept until the admin clears it). */
export function readingExpiresAt(r: Pick<CachedReading, 'created_at' | 'edited_at'>): Date | null {
  return r.edited_at ? null : new Date(Date.parse(r.created_at) + FORM_CACHE_DAYS * DAY_MS);
}

/**
 * Reused when the admin edited it, or when it is under 30 days old and was made with today's model and
 * instructions (a better model or prompt reads the form again).
 */
export function isFresh(
  r: Pick<CachedReading, 'created_at' | 'edited_at' | 'model' | 'prompt_version'>,
  current: { model: string; promptVersion: string },
  now = new Date(),
): boolean {
  if (r.edited_at) return true;
  const expires = readingExpiresAt(r)!;
  return now < expires && r.model === current.model && r.prompt_version === current.promptVersion;
}

/** The fields as the site shows them, kept with the reading for the admin page. */
export function fieldSnapshot(schema: FormSchema) {
  return schema.fields.map((f) => ({
    field_key: f.field_key,
    label: f.label,
    field_type: f.field_type,
    required: f.required,
    options: f.options.length,
  }));
}

/** No form_cache table yet (migration 0012 not applied): read every form, as before. */
export const isMissingTable = (code: string | undefined) => code === '42P01' || code === 'PGRST205';

/** An admin edit of one field: labels and the required flag. */
export function applyFieldEdits(
  fields: FieldAnalysis[],
  edits: { field_key: string; clean_label: string; label_ta: string; required: boolean }[],
): FieldAnalysis[] {
  const byKey = new Map(edits.map((e) => [e.field_key, e]));
  return fields.map((f) => {
    const e = byKey.get(f.field_key);
    return e ? { ...f, clean_label: e.clean_label, label_ta: e.label_ta, required: e.required } : f;
  });
}

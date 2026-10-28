import { createHash } from 'node:crypto';
import type { FieldAnalysis, FieldDescriptor, FormAnalysis, FormSchema } from '@vff/shared';

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
 * field's key, label and type. Nothing that depends on the page's state counts (options that loaded,
 * help text, the page HTML), so the same form scanned with its dropdowns filled in is the same form,
 * gets the same field list and the same prompt (see `template`). A new label or field reads it again.
 */
export function formFingerprint(schema: FormSchema): string {
  const url = new URL(schema.page_url);
  const fields = schema.fields.map((f) => [f.field_key, f.label, f.field_type]);
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
  /** The form's field list (migration 0018); null for readings saved before it. */
  template?: FieldDescriptor[] | null;
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
 * Reused when the admin edited it, or when it is under 30 days old and was made with today's
 * instructions (a new prompt reads the form again). Whatever model made it: a model change doesn't
 * read every form again, and the form keeps its field list; the admin's Read again refreshes one.
 */
export function isFresh(
  r: Pick<CachedReading, 'created_at' | 'edited_at' | 'prompt_version'>,
  current: { promptVersion: string },
  now = new Date(),
): boolean {
  if (r.edited_at) return true;
  const expires = readingExpiresAt(r)!;
  return now < expires && r.prompt_version === current.promptVersion;
}

/**
 * The form's field list, saved with its reading the first time the form is read, so every later
 * session of the form gets exactly these fields, whatever the page showed when it was scanned.
 * A dropdown keeps the options the scan saw (also one that was disabled then: its list is the form's),
 * except one that depends on another field (Taluk on District): the list one district happened to
 * show is not the form's list, so it is saved without options, like one that was empty when scanned.
 */
export function formTemplate(fields: FieldDescriptor[], analysis: Pick<FieldAnalysis, 'field_key' | 'depends_on'>[]): FieldDescriptor[] {
  return fields.map((f) => (emptiedByTemplate(f, analysis) ? { ...f, options: [], dynamic_options: true } : f));
}

/** True for a dropdown whose scanned options the saved field list leaves out (see formTemplate). */
export function emptiedByTemplate(f: FieldDescriptor, analysis: Pick<FieldAnalysis, 'field_key' | 'depends_on'>[]): boolean {
  return f.options.length > 0 && analysis.some((a) => a.field_key === f.field_key && a.depends_on);
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

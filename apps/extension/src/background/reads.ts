import type { FormSchemaInput } from '@vff/shared';

/**
 * Fields that appear later (a wizard's next step, a revealed field) are added to the session at once, so
 * the phone shows them, but the AI reads them only once the page has been quiet this long: one reading
 * for everything that appeared meanwhile, not one per change.
 */
export const READ_QUIET_MS = 2000;

/**
 * What waits for that one reading after a change: the fields the server just added (`added`, by key)
 * joined to those already waiting. A field seen again takes its latest details; the page's latest
 * address and title win. null: nothing to read.
 */
export function addToRead(waiting: FormSchemaInput | null, change: FormSchemaInput, added: string[]): FormSchemaInput | null {
  const keys = new Set(added);
  const fresh = change.fields.filter((f) => keys.has(f.field_key));
  if (!fresh.length) return waiting;
  return { ...change, fields: [...(waiting?.fields ?? []).filter((f) => !keys.has(f.field_key)), ...fresh] };
}

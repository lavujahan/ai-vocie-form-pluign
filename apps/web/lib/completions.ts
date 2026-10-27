/**
 * A form counts as completed when the computer filled it: after a full fill (Send to desktop / Fill
 * form), at most this many of its non-upload fields may be left empty (the user may skip one or two).
 */
export const ALLOWED_EMPTY = 2;

/** `filled`: fields the extension filled in this full fill; `fields`: the form's non-upload fields. */
export function isCompleted(filled: number, fields: number): boolean {
  return filled >= 1 && filled >= fields - ALLOWED_EMPTY;
}

/** No form_completions table yet (migration 0016 not applied). */
export const isMissingCompletions = (code: string | undefined) => code === '42P01' || code === 'PGRST205';

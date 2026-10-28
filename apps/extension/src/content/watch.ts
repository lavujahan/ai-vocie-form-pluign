import type { FieldDescriptorInput, FormSchemaInput } from '@vff/shared';

/**
 * Fields that appear after the form was scanned. While a form session is active, the page is watched
 * and new fields are reported (they are added to the session and shown on the phone): a wizard's next
 * step or a new page of the form (`newStep`), and fields a choice reveals (a checkbox, "Other", one
 * branch of a form). They are added after the session's fields, so the AI's prompt for the form still
 * starts with the same text. `present` says which fields are on the page now: a branch that was not
 * chosen is hidden on the phone, and values wait for their field until it appears.
 */

const DEBOUNCE_MS = 700;

const sig = (f: Pick<FieldDescriptorInput, 'label' | 'field_type'>) => `${f.label.trim().toLowerCase()}|${f.field_type}`;

/**
 * New fields among `scanned`. A position-based key (`path:…`, for fields without id or name) changes
 * when the page around it changes, so one whose label and type match a known field (`knownSigs`:
 * label|type → its key) isn't new, and is present under the known key.
 */
export function diffFields(known: Set<string>, knownSigs: Map<string, string>, scanned: FieldDescriptorInput[]) {
  const movedTo = (f: FieldDescriptorInput) => (!known.has(f.field_key) && f.field_key.startsWith('path:') ? knownSigs.get(sig(f)) : undefined);
  const added = scanned.filter((f) => !known.has(f.field_key) && !movedTo(f));
  return { added, present: scanned.map((f) => movedTo(f) ?? f.field_key) };
}

/**
 * A new step of the form: fewer than half of the fields that were on the page are still there (Next hid
 * them, or the form's next page loaded). New fields while the others stay are revealed by a choice
 * (a checkbox, "Other", a branch of the form): they belong to the step on the page.
 */
export function isNewStep(before: string[], present: string[]): boolean {
  const now = new Set(present);
  return before.filter((k) => now.has(k)).length * 2 < before.length || !before.length;
}

let observer: MutationObserver | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;

export function stopWatch() {
  observer?.disconnect();
  observer = null;
  clearTimeout(timer);
}

/**
 * Watches the page; after changes settle, re-scans and calls `onChange` when new fields appeared or
 * the set of fields on the page changed. Checks once right away (a new page of a multi-page form: the
 * session's fields are not on it).
 */
export function startWatch(
  knownKeys: string[],
  scan: () => FormSchemaInput,
  onChange: (change: { schema: FormSchemaInput; present: string[]; newStep: boolean }) => void,
) {
  stopWatch();
  const known = new Set(knownKeys);
  const knownSigs = new Map<string, string>();
  let lastPresent: string | null = null;
  // The fields on the page at the last change: a new step hides most of them. Before the first check
  // (a page just loaded) the session's fields may be from several pages, so then the page is a new
  // step when it has more new fields than known ones (a reload with a ticked checkbox is not).
  let onPage: string[] | null = null;

  const check = () => {
    const schema = scan();
    for (const f of schema.fields) if (known.has(f.field_key) && !knownSigs.has(sig(f))) knownSigs.set(sig(f), f.field_key);
    const { added, present } = diffFields(known, knownSigs, schema.fields);
    const newStep = added.length > 0 && (onPage ? isNewStep(onPage, present) : added.length > present.length - added.length);
    const presentSig = [...present].sort().join('\u0001');
    if (!added.length && presentSig === lastPresent) return;
    lastPresent = presentSig;
    onPage = present;
    for (const f of added) {
      known.add(f.field_key);
      if (!knownSigs.has(sig(f))) knownSigs.set(sig(f), f.field_key);
    }
    onChange({ schema: { ...schema, fields: added }, present, newStep });
  };

  observer = new MutationObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(check, DEBOUNCE_MS);
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['style', 'class', 'hidden', 'disabled', 'aria-hidden', 'open'],
  });
  check();
}

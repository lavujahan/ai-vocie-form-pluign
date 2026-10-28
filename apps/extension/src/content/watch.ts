import type { FieldDescriptorInput, FormSchemaInput } from '@vff/shared';

/**
 * Fields that appear after the form was scanned. While a form session is active, the page is watched:
 * the fields of a wizard's next step or a new page of the form are reported (they are added to the
 * session and shown on the phone). A field shown by a checkbox or by choosing "Other" is not: the form's
 * field list stays as it was first saved, so the AI's prompt for it starts with the same text every
 * time. `present` lets values that were waiting for their field be filled once it appears.
 */

const DEBOUNCE_MS = 700;

const sig = (f: Pick<FieldDescriptorInput, 'label' | 'field_type'>) => `${f.label.trim().toLowerCase()}|${f.field_type}`;

/**
 * New fields among `scanned`. A position-based key (`path:…`, for fields without id or name) changes
 * when the page around it changes, so one whose label and type match a known field isn't new.
 */
export function diffFields(known: Set<string>, knownSigs: Set<string>, scanned: FieldDescriptorInput[]) {
  const added = scanned.filter((f) => !known.has(f.field_key) && !(f.field_key.startsWith('path:') && knownSigs.has(sig(f))));
  return { added, present: scanned.map((f) => f.field_key) };
}

/**
 * A new step of the form: fewer than half of the fields that were on the page are still there (Next hid
 * them, or the form's next page loaded). New fields while the others stay are a checkbox's or an
 * "Other" choice's, not a step.
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
 * Watches the page; after changes settle, re-scans and calls `onChange` when a new step's fields
 * appeared or the set of fields on the page changed. Checks once right away (a new page of a
 * multi-page form: the session's fields are not on it).
 */
export function startWatch(
  knownKeys: string[],
  scan: () => FormSchemaInput,
  onChange: (change: { schema: FormSchemaInput; present: string[] }) => void,
) {
  stopWatch();
  const known = new Set(knownKeys);
  const knownSigs = new Set<string>();
  let lastPresent: string | null = null;
  // The fields on the page at the last change: a new step hides most of them. Before the first check
  // (a page just loaded) the session's fields may be from several pages, so then the page is a new
  // step when it has more new fields than known ones (a reload with a ticked checkbox is not).
  let onPage: string[] | null = null;

  const check = () => {
    const schema = scan();
    for (const f of schema.fields) if (known.has(f.field_key)) knownSigs.add(sig(f));
    const { added, present } = diffFields(known, knownSigs, schema.fields);
    const newStep = onPage ? isNewStep(onPage, present) : added.length > present.length - added.length;
    const step = added.length > 0 && newStep ? added : [];
    const presentSig = [...present].sort().join('\u0001');
    if (!step.length && presentSig === lastPresent) return;
    lastPresent = presentSig;
    onPage = present;
    for (const f of step) {
      known.add(f.field_key);
      knownSigs.add(sig(f));
    }
    onChange({ schema: { ...schema, fields: step }, present });
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

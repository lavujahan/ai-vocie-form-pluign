import type { FieldDescriptorInput, FormSchemaInput } from '@vff/shared';

/**
 * Fields that appear after the form was scanned: a wizard's next step, a new page of the form, a field
 * shown by a checkbox or by choosing "Other". While a form session is active, the page is watched and
 * new fields are reported (they are added to the session and shown on the phone); `present` lets
 * values that were waiting for their field be filled once it appears.
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

let observer: MutationObserver | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;

export function stopWatch() {
  observer?.disconnect();
  observer = null;
  clearTimeout(timer);
}

/**
 * Watches the page; after changes settle, re-scans and calls `onChange` when fields were added or the
 * set of fields on the page changed. Checks once right away (a new page of a multi-page form).
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

  const check = () => {
    const schema = scan();
    for (const f of schema.fields) if (known.has(f.field_key)) knownSigs.add(sig(f));
    const { added, present } = diffFields(known, knownSigs, schema.fields);
    const presentSig = [...present].sort().join('\u0001');
    if (!added.length && presentSig === lastPresent) return;
    lastPresent = presentSig;
    for (const f of added) {
      known.add(f.field_key);
      knownSigs.add(sig(f));
    }
    onChange({ schema: { ...schema, fields: added }, present });
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

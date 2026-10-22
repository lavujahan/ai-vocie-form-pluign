import {
  detectDateFormat,
  formatDate,
  matchOption,
  normalizeBoolean,
  normalizeDate,
  type ChoiceReason,
  type FieldOption,
  type FillReport,
} from '@vff/shared';
import { childrenOf, descendantsOf, fillSelect, isNativeSelect, liveSelect, memory, type Resolver, type SelectOutcome } from './cascade';
import type { Registry, RegistryEntry } from './detector';

const OPTION_MIN_SCORE = 0.75;

type Snapshot =
  | { kind: 'value'; value: string }
  | { kind: 'checked'; states: boolean[] }
  | { kind: 'aria'; checked: string | null }
  | { kind: 'text'; text: string };

/** Values from before our fills, for Undo (first fill wins, so Undo returns to the page's original state). */
const undoStack = new Map<string, { entry: RegistryEntry; snap: Snapshot }>();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function win(el: Element): Window & typeof globalThis {
  return (el.ownerDocument.defaultView ?? window) as Window & typeof globalThis;
}

function fire(el: Element, type: string) {
  const W = win(el);
  el.dispatchEvent(new W.Event(type, { bubbles: true, composed: true }));
}

/**
 * Sets .value through the prototype's native setter so frameworks that track the
 * instance value (React) notice the change, then fires the events they listen to.
 */
export function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) {
  const proto = Object.getPrototypeOf(el);
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  el.focus?.();
  if (setter) setter.call(el, value);
  else el.value = value;
  fire(el, 'input');
  fire(el, 'change');
  el.blur?.();
}

function pickOption(spoken: string, options: FieldOption[]): FieldOption | null {
  const s = spoken.trim().toLowerCase();
  const exact = options.find((o) => o.value === spoken || o.label.toLowerCase() === s || o.value.toLowerCase() === s);
  if (exact) return exact;
  const m = matchOption(spoken, options);
  return m.option && m.score >= OPTION_MIN_SCORE ? m.option : null;
}

function snapshot(entry: RegistryEntry): Snapshot {
  const el = entry.el;
  if (entry.group) return { kind: 'checked', states: entry.group.map((g) => g.el.checked) };
  if (el instanceof win(el).HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) {
    return { kind: 'checked', states: [el.checked] };
  }
  if (el.getAttribute('role') === 'checkbox' || el.getAttribute('role') === 'radio') {
    return { kind: 'aria', checked: el.getAttribute('aria-checked') };
  }
  if ('value' in el && typeof (el as HTMLInputElement).value === 'string') return { kind: 'value', value: (el as HTMLInputElement).value };
  return { kind: 'text', text: el.textContent ?? '' };
}

/** Returns true if the state changed. */
function setChecked(input: HTMLInputElement, want: boolean): boolean {
  if (input.checked === want) return false;
  // click() runs the page's own handlers and fires input/change like a real user.
  input.click();
  if (input.checked !== want) {
    // A radio can't be unchecked by clicking; set it directly.
    input.checked = want;
    fire(input, 'input');
    fire(input, 'change');
  }
  return true;
}

/**
 * Frameworks (e.g. Vue's checkbox v-model) sync their model on the next render, so a second
 * click in the same tick would read stale state. A real user can't click twice in one tick either.
 */
const nextTick = () => new Promise((r) => setTimeout(r, 0));

async function setGroup(inputs: HTMLInputElement[], want: (i: number) => boolean) {
  for (const [i, input] of inputs.entries()) {
    if (setChecked(input, want(i))) await nextTick();
  }
}

async function fillEntry(entry: RegistryEntry, value: string | null): Promise<string | null> {
  const { el, descriptor: d } = entry;
  const W = win(el);
  const v = value ?? '';

  // Radio / checkbox groups.
  if (entry.group) {
    if (d.field_type === 'radio') {
      if (!v) {
        await setGroup(entry.group.map((g) => g.el), () => false);
        return null;
      }
      const opt = pickOption(v, entry.group.map((g) => g.option));
      const target = opt && entry.group.find((g) => g.option === opt);
      if (!target) return `No option matches "${v}"`;
      setChecked(target.el, true);
      return null;
    }
    const wanted = new Set<FieldOption>();
    for (const part of v.split(/\s*[,;]\s*/).filter(Boolean)) {
      const opt = pickOption(part, entry.group.map((g) => g.option));
      if (!opt) return `No option matches "${part}"`;
      wanted.add(opt);
    }
    await setGroup(entry.group.map((g) => g.el), (i) => wanted.has(entry.group![i].option));
    return null;
  }

  if (el instanceof W.HTMLInputElement && el.type === 'checkbox') {
    const b = normalizeBoolean(v) ?? (v ? 'true' : 'false');
    setChecked(el, b === 'true');
    return null;
  }
  if (el instanceof W.HTMLInputElement && el.type === 'radio') {
    setChecked(el, normalizeBoolean(v) === 'true');
    return null;
  }

  const role = el.getAttribute('role');
  if ((role === 'checkbox' || role === 'radio') && !(el instanceof W.HTMLInputElement)) {
    const want = (normalizeBoolean(v) ?? 'false') === 'true';
    if ((el.getAttribute('aria-checked') === 'true') !== want) el.click();
    return null;
  }

  if (el instanceof W.HTMLInputElement || el instanceof W.HTMLTextAreaElement) {
    let out = v;
    if (el instanceof W.HTMLInputElement) {
      if (el.type === 'date') {
        out = v ? (normalizeDate(v) ?? '') : '';
        if (v && !out) return `"${v}" is not a date`;
      } else if (el.type === 'number') {
        out = v.replace(/[^\d.-]/g, '');
      } else if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
        // Text date inputs: match the page's format hint, e.g. DD/MM/YYYY.
        const fmt = detectDateFormat(el.placeholder) ?? detectDateFormat(el.pattern);
        if (fmt) out = formatDate(v, fmt);
      }
      if (el.maxLength > 0 && out.length > el.maxLength) out = out.slice(0, el.maxLength);
    }
    setNativeValue(el, out);
    return null;
  }

  const editable = el.getAttribute('contenteditable');
  if (el.isContentEditable || editable === '' || editable === 'true') {
    el.focus();
    const doc = el.ownerDocument;
    const sel = doc.getSelection();
    const range = doc.createRange();
    range.selectNodeContents(el);
    sel?.removeAllRanges();
    sel?.addRange(range);
    // execCommand keeps rich editors' undo stacks and models in sync; fall back to textContent.
    const ok = typeof doc.execCommand === 'function' && doc.execCommand('insertText', false, v);
    if (!ok || el.textContent !== v) {
      el.textContent = v;
      fire(el, 'input');
    }
    el.blur();
    return null;
  }

  if (role === 'combobox') return 'Custom dropdowns are not supported yet';
  return 'Unsupported field';
}

async function restore(entry: RegistryEntry, snap: Snapshot) {
  const el = entry.el;
  switch (snap.kind) {
    case 'checked': {
      const inputs = entry.group ? entry.group.map((g) => g.el) : [el as HTMLInputElement];
      await setGroup(inputs, (i) => snap.states[i]);
      break;
    }
    case 'aria':
      if (el.getAttribute('aria-checked') !== snap.checked) el.click();
      break;
    case 'value':
      setNativeValue(el as HTMLInputElement, snap.value);
      break;
    case 'text':
      el.textContent = snap.text;
      fire(el, 'input');
      break;
  }
}

const HIGHLIGHT_MS = 1500;

export function highlight(entry: RegistryEntry) {
  const target = (entry.group ? entry.group[0].el.closest('fieldset, [role="radiogroup"], div') : entry.el) as HTMLElement | null;
  if (!target) return;
  const prev = { outline: target.style.outline, offset: target.style.outlineOffset, transition: target.style.transition };
  target.style.transition = 'outline-color 0.3s';
  target.style.outline = '2px solid #f2b705';
  target.style.outlineOffset = '2px';
  setTimeout(() => {
    target.style.outline = prev.outline;
    target.style.outlineOffset = prev.offset;
    target.style.transition = prev.transition;
  }, HIGHLIGHT_MS);
}

export type FillOptions = {
  /** Wait after each fill so dependent fields can render. */
  settleMs?: number;
  highlight?: boolean;
  /** Re-detect fields (for fields that appear after a parent is filled). */
  redetect?: () => Registry;
  /** child field_key → parent field_key, from the Form Analyzer (District → Taluk). */
  edges?: Record<string, string>;
  /** AI option picker for unclear dropdown matches. */
  resolve?: Resolver;
};

const UNRESOLVED_REASON: Record<ChoiceReason, string> = {
  ambiguous: 'Several options match. Choose one on your phone',
  no_match: 'No option matches. Choose one on your phone',
  parent_changed: 'Not valid after the change above. Choose again on your phone',
  not_loaded: "The options didn't load. Choose on your phone",
};

/** Fills values in DOM order. Keys missing from the registry are retried once after re-detecting. */
export async function fillAll(
  values: Record<string, string | null>,
  registry: Registry,
  opts: FillOptions = {},
): Promise<FillReport & { registry: Registry }> {
  const settle = opts.settleMs ?? 60;
  const edges = opts.edges ?? {};
  const report: FillReport = { filled: [], skipped: [] };
  const unresolved = new Map<string, NonNullable<FillReport['unresolved']>[number]>();
  const loadedOptions: Record<string, FieldOption[]> = {};
  let reg = registry;
  const pending = new Set(Object.keys(values));
  for (const [k, v] of Object.entries(values)) memory.remembered.set(k, v);
  /** Value for a field: from this fill, else the last one asked for (children re-filled after a parent changed). */
  const valueFor = (k: string) => (k in values ? values[k] : (memory.remembered.get(k) ?? null));
  /** Children queued because their parent changed. */
  const recascade = new Map<string, ChoiceReason>();
  /** Dropdowns we set, to check at the end that the page didn't reset them. */
  const setSelects = new Map<string, string>();

  const fillDropdown = async (key: string, entry: RegistryEntry & { el: HTMLSelectElement }): Promise<SelectOutcome> => {
    const out = await fillSelect(key, entry, valueFor(key), {
      reg,
      edges,
      resolve: opts.resolve,
      setValue: setNativeValue,
      reason: recascade.get(key),
    });
    const remove = <T extends { field_key: string }>(list: T[]) => list.filter((x) => x.field_key !== key);
    report.filled = report.filled.filter((k) => k !== key);
    report.skipped = remove(report.skipped);
    unresolved.delete(key);
    if (entry.descriptor.dynamic_options && out.status !== 'skipped' && out.options.length) loadedOptions[key] = out.options;
    if (out.status === 'filled') {
      report.filled.push(key);
      setSelects.set(key, liveSelect(entry).value);
      if (out.changed && opts.highlight) highlight(entry);
      // Parent changed: re-check its direct children that aren't part of this fill. Grandchildren are
      // re-checked in turn when each child is re-filled.
      if (out.changed) {
        for (const child of childrenOf(key, edges)) {
          if (!(child in values) && memory.remembered.get(child) && !pending.has(child)) {
            pending.add(child);
            recascade.set(child, 'parent_changed');
          }
        }
      }
    } else if (out.status === 'unresolved') {
      unresolved.set(key, out.unresolved);
      report.skipped.push({ field_key: key, reason: UNRESOLVED_REASON[out.unresolved.reason] });
      // A re-checked child that no longer fits: everything below it must be chosen again too.
      if (recascade.has(key)) {
        for (const d of descendantsOf(key, edges)) {
          const spoken = memory.remembered.get(d);
          if (!spoken || d in values || unresolved.has(d)) continue;
          pending.delete(d);
          unresolved.set(d, { field_key: d, spoken, top: [], reason: 'parent_changed' });
          report.skipped.push({ field_key: d, reason: UNRESOLVED_REASON.parent_changed });
        }
      }
    } else {
      report.skipped.push({ field_key: key, reason: out.reason });
    }
    return out;
  };

  for (let pass = 0; pass < 2 && pending.size; pass++) {
    if (pass === 1) {
      if (!opts.redetect) break;
      await sleep(settle * 3);
      reg = opts.redetect();
    }
    for (const [key, entry] of reg) {
      if (!pending.has(key)) continue;
      pending.delete(key);
      if (isNativeSelect(entry)) liveSelect(entry);
      if (!entry.el.isConnected) {
        report.skipped.push({ field_key: key, reason: 'Field is no longer on the page' });
        continue;
      }
      if (!undoStack.has(key)) undoStack.set(key, { entry, snap: snapshot(entry) });
      if (isNativeSelect(entry)) {
        try {
          await fillDropdown(key, entry);
        } catch (e) {
          report.skipped.push({ field_key: key, reason: (e as Error).message });
        }
        continue;
      }
      try {
        const err = await fillEntry(entry, valueFor(key));
        if (err) report.skipped.push({ field_key: key, reason: err });
        else {
          report.filled.push(key);
          if (opts.highlight) highlight(entry);
        }
      } catch (e) {
        report.skipped.push({ field_key: key, reason: (e as Error).message });
      }
      if (settle) await sleep(settle);
    }
  }
  for (const key of pending) report.skipped.push({ field_key: key, reason: 'Field not found on the page' });

  // Final check: a slow page can reset a dropdown after we moved on (its parent's options arrived
  // late). Re-fill any dropdown that no longer holds what we set.
  if (setSelects.size) {
    await sleep(Math.max(settle, 300));
    for (const [key, val] of setSelects) {
      const entry = reg.get(key);
      if (entry && isNativeSelect(entry) && liveSelect(entry).isConnected && liveSelect(entry).value !== val) await fillDropdown(key, entry);
    }
  }

  if (unresolved.size) report.unresolved = [...unresolved.values()];
  if (Object.keys(loadedOptions).length) report.options = loadedOptions;
  return { ...report, registry: reg };
}

/** Puts every field we touched back the way it was before the first fill. */
export async function undoAll(): Promise<string[]> {
  const restored: string[] = [];
  for (const [key, { entry, snap }] of [...undoStack].reverse()) {
    if (!entry.el.isConnected) continue;
    await restore(entry, snap);
    restored.push(key);
  }
  undoStack.clear();
  return restored;
}

export const canUndo = () => undoStack.size > 0;

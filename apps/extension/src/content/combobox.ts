import type { ChoiceReason, FieldOption } from '@vff/shared';
import { pickOption, sleep, timing, waitUntil, type Resolver, type SelectOutcome } from './cascade';
import type { RegistryEntry } from './detector';
import { clean, cssEscape, fire, isHidden, setValueNatively, win } from './dom';

/**
 * Custom dropdowns (react-select, MUI Autocomplete / Select, choices.js, select2, AntD and any WAI-ARIA
 * combobox). They are not real <select>s, so they are filled like a user would:
 *   open → type to filter → wait for the options → pick (locally, else the AI resolver) → click → check.
 * Generic ARIA comes first; library class names are only used where a library differs.
 */

export type WidgetKind = 'aria' | 'react-select' | 'mui-autocomplete' | 'choices' | 'select2' | 'antd';

export type Widget = {
  kind: WidgetKind;
  /** The visible widget: liveness, highlight, display text. */
  root: HTMLElement;
  /** Clicked to open the list. */
  trigger: HTMLElement;
  /** Editable search box, if the widget has one before opening. */
  input: HTMLInputElement | null;
  /** Hidden <select> / input holding the value (choices.js, select2, react-select's `name`, MUI Select). */
  valueEl: HTMLInputElement | HTMLSelectElement | null;
  /** Element whose label names the field. */
  labelEl: HTMLElement;
  multiple: boolean;
  /** Typed text is a fine answer when nothing in the list matches (plain autocomplete inputs). */
  freeText: boolean;
  /** react-select: multi-select was checked by opening the list once. */
  probed?: boolean;
};

// ---------- detection ----------

const SELECT2_HIDDEN = 'select2-hidden-accessible';

/** The select2-enhanced <select> behind an element inside select2's container. */
function select2SelectFor(el: Element): HTMLSelectElement | null {
  const container = el.closest('.select2-container');
  const prev = container?.previousElementSibling;
  return prev?.tagName === 'SELECT' && prev.classList.contains(SELECT2_HIDDEN) ? (prev as HTMLSelectElement) : null;
}

/** react-select's container: holds the hidden `name` input or the live region next to the control. */
function reactSelectRoot(input: HTMLElement): HTMLElement | null {
  for (let n = input.parentElement, d = 0; n && d < 6; n = n.parentElement, d++) {
    if (n.querySelector(':scope > input[type="hidden"], :scope > span[id$="-live-region"]')) return n;
  }
  return null;
}

/**
 * The custom dropdown `el` belongs to; 'skip' for parts of a widget registered through another element;
 * null for anything else (handled as a normal field).
 */
export function widgetOf(el: HTMLElement): Widget | 'skip' | null {
  // select2: the original <select> stays (visually hidden) right before select2's container.
  const s2 = el.tagName === 'SELECT' && el.classList.contains(SELECT2_HIDDEN) ? (el as HTMLSelectElement) : select2SelectFor(el);
  if (s2) {
    if (el !== s2) return 'skip';
    const root = s2.nextElementSibling as HTMLElement | null;
    const trigger = root?.querySelector<HTMLElement>('.select2-selection');
    if (!root?.classList.contains('select2-container') || !trigger) return null;
    return { kind: 'select2', root, trigger, input: null, valueEl: s2, labelEl: s2, multiple: s2.multiple, freeText: false };
  }

  const choices = el.closest<HTMLElement>('.choices');
  if (choices) {
    const select = choices.querySelector<HTMLSelectElement>('select.choices__input');
    if (!select) return null; // choices.js on a text input (tags): a plain text field
    return {
      kind: 'choices',
      root: choices,
      trigger: choices.querySelector<HTMLElement>('.choices__inner') ?? choices,
      input: null,
      valueEl: select,
      labelEl: select,
      multiple: select.multiple,
      freeText: false,
    };
  }

  const ant = el.closest<HTMLElement>('.ant-select');
  if (ant) {
    const input = ant.querySelector<HTMLInputElement>('input[role="combobox"]');
    return {
      kind: 'antd',
      root: ant,
      trigger: ant.querySelector<HTMLElement>('.ant-select-selector') ?? ant,
      input: input && !input.readOnly ? input : null,
      valueEl: null,
      labelEl: input ?? ant,
      multiple: ant.classList.contains('ant-select-multiple'),
      freeText: false,
    };
  }

  const muiAuto = el.closest<HTMLElement>('.MuiAutocomplete-root');
  if (muiAuto) {
    const input = muiAuto.querySelector<HTMLInputElement>('input');
    if (!input) return null;
    return {
      kind: 'mui-autocomplete',
      root: muiAuto,
      trigger: input,
      input,
      valueEl: null,
      labelEl: input,
      multiple: !!muiAuto.querySelector('.MuiAutocomplete-tag, .MuiChip-root'),
      // freeSolo Autocompletes have no popup button: any typed text is a value.
      freeText: !muiAuto.classList.contains('MuiAutocomplete-hasPopupIcon'),
    };
  }

  const role = el.getAttribute('role');
  if (el.tagName === 'INPUT' && role === 'combobox') {
    const rs = reactSelectRoot(el);
    if (rs) {
      return {
        kind: 'react-select',
        root: rs,
        trigger: el,
        input: el as HTMLInputElement,
        valueEl: rs.querySelector<HTMLInputElement>('input[type="hidden"][name]'),
        labelEl: el,
        multiple: false, // seen when the list opens (aria-multiselectable)
        freeText: false,
      };
    }
    // A plain ARIA autocomplete input (e.g. address suggestions): typed text is kept if nothing matches.
    return { kind: 'aria', root: el, trigger: el, input: el as HTMLInputElement, valueEl: null, labelEl: el, multiple: false, freeText: true };
  }
  if (role === 'combobox' || (el.tagName === 'BUTTON' && el.getAttribute('aria-haspopup') === 'listbox')) {
    // ARIA 1.1 pattern: a role=combobox wrapper around a text input.
    const inner = el.querySelector<HTMLInputElement>('input:not([type="hidden"])');
    return {
      kind: 'aria',
      root: el,
      trigger: inner ?? el,
      input: inner,
      // MUI Select keeps the value in a hidden input next to the visible box.
      valueEl: el.parentElement?.querySelector<HTMLInputElement>(':scope > input[name]') ?? null,
      labelEl: el,
      multiple: el.getAttribute('aria-multiselectable') === 'true',
      freeText: !!inner,
    };
  }
  return null;
}

/** Options already in the page for widgets backed by a real <select> (choices.js, select2 without remote data). */
export function staticOptions(w: Widget): FieldOption[] {
  if (w.valueEl?.tagName !== 'SELECT') return [];
  return [...(w.valueEl as HTMLSelectElement).options]
    .filter((o, i) => o.value !== '' && !(i === 0 && o.disabled))
    .map((o) => ({ value: o.value, label: clean(o.textContent) || o.value }));
}

// ---------- events ----------

/** The real-user click sequence: libraries listen to different ones (mousedown, mouseup or click). */
export function press(el: Element) {
  const W = win(el);
  for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
    const Ctor = type.startsWith('pointer') && W.PointerEvent ? W.PointerEvent : W.MouseEvent;
    el.dispatchEvent(new Ctor(type, { bubbles: true, cancelable: true, composed: true, button: 0, buttons: type.endsWith('down') ? 1 : 0 }));
  }
}

function pressKey(el: Element, k: string, type: 'keydown' | 'keyup' = 'keydown') {
  const W = win(el);
  el.dispatchEvent(new W.KeyboardEvent(type, { key: k, code: k, bubbles: true, cancelable: true, composed: true }));
}

/** Types into a search box without blurring it (blur closes these menus). */
export function typeInto(input: HTMLInputElement, text: string) {
  input.focus?.();
  setValueNatively(input, text);
  fire(input, 'input');
  pressKey(input, text.slice(-1) || 'Backspace', 'keyup');
}

// ---------- reading the widget ----------

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

function doc(w: Widget) {
  return w.root.ownerDocument;
}

function isOpen(w: Widget): boolean {
  if (w.kind === 'choices') return w.root.classList.contains('is-open');
  if (w.kind === 'select2') return w.root.classList.contains('select2-container--open');
  return [w.input, w.trigger].some((n) => n?.getAttribute('aria-expanded') === 'true');
}

/** The open list of options, wherever the widget renders it (often a portal at the end of <body>). */
function listboxOf(w: Widget): HTMLElement | null {
  const d = doc(w);
  if (w.kind === 'choices') return w.root.querySelector<HTMLElement>('.choices__list--dropdown [role="listbox"]');
  for (const n of [w.input, w.trigger]) {
    for (const attr of ['aria-controls', 'aria-owns']) {
      const id = n?.getAttribute(attr);
      const lb = id ? d.getElementById(id) : null;
      if (lb && (lb.getAttribute('role') === 'listbox' || lb.querySelector('[role="option"]'))) return lb;
    }
  }
  if (w.kind === 'select2') return d.querySelector<HTMLElement>('.select2-container--open .select2-results__options');
  if (w.kind === 'antd') return [...d.querySelectorAll<HTMLElement>('.ant-select-dropdown:not(.ant-select-dropdown-hidden)')].at(-1) ?? null;
  if (w.kind === 'react-select') {
    // Older react-select versions have no listbox role.
    const menu = w.root.querySelector<HTMLElement>('[role="listbox"], [class*="-menu"]');
    if (menu) return menu;
  }
  const open = [...d.querySelectorAll<HTMLElement>('[role="listbox"]')].filter((l) => !isHidden(l) && !l.closest('.choices'));
  return open.at(-1) ?? null;
}

const OPTION_SELECTOR = '[role="option"], .select2-results__option, .ant-select-item-option, [id^="react-select-"][id*="-option-"]';

function optionEls(w: Widget): HTMLElement[] {
  const lb = listboxOf(w);
  if (!lb) return [];
  return [...lb.querySelectorAll<HTMLElement>(OPTION_SELECTOR)].filter(
    (o) =>
      o.getAttribute('aria-disabled') !== 'true' &&
      !o.classList.contains('loading-results') &&
      !o.classList.contains('select2-results__message') &&
      !o.classList.contains('choices__placeholder') &&
      !o.classList.contains('ant-select-item-option-disabled') &&
      !isHidden(o) &&
      !!clean(o.textContent),
  );
}

const optionLabel = (o: HTMLElement) => o.getAttribute('title') || clean(o.textContent);
const toOptions = (els: HTMLElement[]): FieldOption[] =>
  els.map((o) => ({ value: o.getAttribute('data-value') ?? optionLabel(o), label: optionLabel(o) }));

const NO_RESULTS = /^(no (options|results|matches|choices)|nothing found|not found)/i;

/** The widget says nothing matches (react-select "No options", MUI, select2, choices.js). */
function saysNoResults(w: Widget): boolean {
  const scopes = [w.root, listboxOf(w)?.parentElement, ...doc(w).querySelectorAll<HTMLElement>('.MuiAutocomplete-popper, .select2-container--open')];
  return scopes.some(
    (s) => !!s && [...s.querySelectorAll<HTMLElement>('div, li, span')].some((n) => n.children.length === 0 && NO_RESULTS.test(clean(n.textContent)) && !isHidden(n)),
  );
}

/**
 * Values in the widget's hidden inputs. react-select (multi) re-renders them after each pick, so the
 * one found when scanning may be detached: read the live inputs with the same name too.
 */
function hiddenValues(w: Widget): string[] {
  const el = w.valueEl as HTMLInputElement;
  const name = el.getAttribute('name');
  const inputs = new Set<HTMLInputElement>(el.isConnected ? [el] : []);
  if (name) w.root.querySelectorAll<HTMLInputElement>(`input[name="${cssEscape(name)}"]`).forEach((i) => inputs.add(i));
  return [...inputs].map((i) => i.value).filter(Boolean);
}

/** What the widget shows as selected now. */
export function selectedLabels(w: Widget): string[] {
  if (w.valueEl?.tagName === 'SELECT') {
    return [...(w.valueEl as HTMLSelectElement).selectedOptions].filter((o) => o.value !== '').map((o) => clean(o.textContent));
  }
  if (w.kind === 'antd') {
    return [...w.root.querySelectorAll<HTMLElement>('.ant-select-selection-item')].map((n) => n.getAttribute('title') || clean(n.textContent));
  }
  if (w.kind === 'mui-autocomplete' && !w.multiple) return w.input?.value ? [w.input.value] : [];
  // A plain autocomplete input: its text is the value.
  if (w.root === w.input) return w.input.value ? [w.input.value] : [];
  // An empty hidden value means nothing is chosen, whatever placeholder text the box shows.
  if (w.valueEl?.tagName === 'INPUT' && !hiddenValues(w).length) return [];
  // react-select / ARIA: the control's visible text, without the search box, the menu, the placeholder
  // and screen-reader-only announcements.
  const box = w.root.cloneNode(true) as HTMLElement;
  box
    .querySelectorAll(
      'input, [role="listbox"], [class*="-menu"], [id$="-placeholder"], [class*="placeholder"], [aria-live], [role="log"], svg, .MuiAutocomplete-popper',
    )
    .forEach((n) => n.remove());
  const text = clean(box.textContent).replace(/​/g, '');
  return text ? [text] : [];
}

function hasSelected(w: Widget, label: string): boolean {
  const want = norm(label);
  if (w.input && norm(w.input.value) === want && w.kind === 'mui-autocomplete') return true;
  return selectedLabels(w).some((t) => norm(t).includes(want));
}

// ---------- actions ----------

async function open(w: Widget) {
  if (isOpen(w) && optionEls(w).length) return;
  w.trigger.scrollIntoView?.({ block: 'center' });
  (w.input ?? w.trigger).focus?.();
  press(w.trigger);
  await sleep(60);
  if (!isOpen(w)) pressKey(w.input ?? w.trigger, 'ArrowDown');
  await sleep(60);
}

function close(w: Widget) {
  if (isOpen(w)) pressKey(searchInput(w) ?? w.input ?? w.trigger, 'Escape');
  const input = searchInput(w) ?? w.input;
  input?.blur?.();
}

/** The box to type into: the widget's own input, or one that appears when it opens (select2, choices.js). */
function searchInput(w: Widget): HTMLInputElement | null {
  if (w.input) return w.input;
  if (w.kind === 'choices') return w.root.querySelector<HTMLInputElement>('input.choices__input--cloned');
  if (w.kind === 'select2') return doc(w).querySelector<HTMLInputElement>('.select2-container--open .select2-search__field');
  return null;
}

/** Waits until the options stop changing (async search, animations); returns them (possibly none). */
async function waitForList(w: Widget, maxMs: number): Promise<HTMLElement[]> {
  const start = Date.now();
  let sig = '';
  let since = start;
  for (;;) {
    const els = optionEls(w);
    const none = !els.length && saysNoResults(w);
    const s = `${els.map(optionLabel).join('\u0001')}|${none}`;
    if (s !== sig) {
      sig = s;
      since = Date.now();
    }
    const settled = Date.now() - since >= 300 && Date.now() - start >= 250;
    if (settled && (els.length || none)) return els;
    if (Date.now() - start >= maxMs) return els;
    await sleep(100);
  }
}

type Choice =
  | { ok: true; changed: boolean; options: FieldOption[] }
  | { ok: false; options: FieldOption[]; top: string[]; reason: ChoiceReason }
  | { ok: false; error: string; options: FieldOption[] };

/** Selects one value: open, filter, pick, click, check. */
async function chooseOne(key: string, w: Widget, spoken: string, ctx: { resolve?: Resolver; reason?: ChoiceReason }): Promise<Choice> {
  if (hasSelected(w, spoken) && !w.multiple) return { ok: true, changed: false, options: [] };
  await open(w);
  const lb = listboxOf(w);
  if (lb?.getAttribute('aria-multiselectable') === 'true') w.multiple = true;

  const input = searchInput(w);
  if (input) typeInto(input, spoken);
  let els = await waitForList(w, input ? timing.optionsWaitMs : 3000);
  let options = toOptions(els);
  let pick = options.length ? await pickOption(key, spoken, options, ctx.resolve, ctx.reason) : null;

  // The widget's own filter can hide the right option for a different spelling ("Omaloor" vs "Omalur"):
  // look at the whole list too.
  if (!pick?.option && input) {
    typeInto(input, '');
    els = await waitForList(w, timing.optionsWaitMs);
    const all = toOptions(els);
    if (all.length) {
      options = all;
      pick = await pickOption(key, spoken, options, ctx.resolve, ctx.reason);
    }
  }

  if (!pick?.option) {
    if (w.freeText && input) {
      typeInto(input, spoken);
      pressKey(input, 'Escape');
      fire(input, 'change');
      input.blur?.();
      return { ok: true, changed: true, options };
    }
    if (input) typeInto(input, '');
    close(w);
    return { ok: false, options, top: pick?.top ?? [], reason: pick?.reason ?? ctx.reason ?? (options.length ? 'no_match' : 'not_loaded') };
  }

  // The AI call takes a moment and lists re-render: find the option element again by its label.
  const want = pick.option.label;
  let el = optionEls(w).find((o) => optionLabel(o) === want);
  if (!el) {
    await open(w);
    if (input) typeInto(input, want);
    el = (await waitForList(w, 3000)).find((o) => optionLabel(o) === want);
  }
  if (!el) {
    close(w);
    return { ok: false, error: "Couldn't select in this dropdown", options };
  }
  el.scrollIntoView?.({ block: 'nearest' });
  press(el);
  const took = await waitUntil(() => hasSelected(w, want), 1500, 50);
  close(w);
  return took ? { ok: true, changed: true, options } : { ok: false, error: "Couldn't select in this dropdown", options };
}

/** Clears the widget (Start over, Undo, a value that no longer fits). Returns an error, or null. */
export async function clearWidget(w: Widget): Promise<string | null> {
  if (!selectedLabels(w).length) return null;
  const clearBtn =
    w.root.querySelector<HTMLElement>('.MuiAutocomplete-clearIndicator, .select2-selection__clear, .ant-select-clear, .choices__button') ??
    // react-select: with a value, the clear indicator comes before the dropdown indicator.
    (w.kind === 'react-select' ? ((): HTMLElement | null => {
      const inds = w.root.querySelectorAll<HTMLElement>('[class*="indicatorContainer"]');
      return inds.length >= 2 ? inds[0] : null;
    })() : null);
  if (clearBtn) press(clearBtn);
  else if (w.root === w.input) {
    typeInto(w.input, '');
    fire(w.input, 'change');
  } else if (w.kind === 'react-select' && w.input) {
    w.input.focus?.();
    for (let i = 0; i < 20 && selectedLabels(w).length; i++) {
      pressKey(w.input, 'Backspace');
      await sleep(30);
    }
  } else {
    // A placeholder / empty option in the list (choices.js, many ARIA listboxes).
    await open(w);
    const empty = [...(listboxOf(w)?.querySelectorAll<HTMLElement>('[role="option"]') ?? [])].find(
      (o) => o.getAttribute('data-value') === '' || o.classList.contains('choices__placeholder') || /^(none|select|choose|--)/i.test(clean(o.textContent)),
    );
    if (empty) press(empty);
  }
  await waitUntil(() => !selectedLabels(w).length, 1000, 50);
  close(w);
  return selectedLabels(w).length ? 'Clear this dropdown on the computer' : null;
}

/**
 * Fills a custom dropdown with the spoken value (comma-separated for multi-select). Same result shape as
 * native dropdowns (`fillSelect`), so unresolved values go to the phone's "Pick one" picker.
 */
export async function fillCombobox(
  key: string,
  entry: RegistryEntry & { widget: Widget },
  value: string | null,
  ctx: { resolve?: Resolver; reason?: ChoiceReason } = {},
): Promise<SelectOutcome> {
  const w = entry.widget;
  const v = (value ?? '').trim();
  if (!v) {
    const err = await clearWidget(w);
    return err ? { status: 'skipped', reason: err } : { status: 'filled', changed: false, options: [] };
  }

  // select2 with its options in the <select>: set the <select>; select2 follows its 'change' event.
  if (w.kind === 'select2' && staticOptions(w).length) {
    const options = staticOptions(w);
    const { option, top, reason } = await pickOption(key, v, options, ctx.resolve, ctx.reason);
    if (!option) return { status: 'unresolved', options, unresolved: { field_key: key, spoken: v, top, reason } };
    const sel = w.valueEl as HTMLSelectElement;
    if (sel.value === option.value) return { status: 'filled', changed: false, options };
    setValueNatively(sel, option.value);
    fire(sel, 'change');
    return { status: 'filled', changed: true, options };
  }

  // react-select only says whether it is multi-select once its list is open: look once.
  if (w.kind === 'react-select' && !w.probed) {
    await open(w);
    w.multiple = listboxOf(w)?.getAttribute('aria-multiselectable') === 'true';
    w.probed = true;
    close(w);
  }

  const parts = w.multiple ? v.split(/\s*[,;]\s*/).filter(Boolean) : [v];
  let changed = false;
  let seen: FieldOption[] = [];
  for (const part of parts) {
    if (w.multiple && hasSelected(w, part)) continue;
    const r = await chooseOne(key, w, part, ctx);
    seen = r.options.length ? r.options : seen;
    if (r.ok) changed ||= r.changed;
    else if ('error' in r) return { status: 'skipped', reason: r.error };
    else {
      // A value that no longer fits its new parent: don't leave the old choice in place.
      if (ctx.reason === 'parent_changed') await clearWidget(w);
      return { status: 'unresolved', options: seen, unresolved: { field_key: key, spoken: part, top: r.top, reason: r.reason } };
    }
  }
  return { status: 'filled', changed, options: seen };
}

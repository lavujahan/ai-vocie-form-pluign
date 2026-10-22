import { matchOption, type ChoiceReason, type FieldOption, type ResolveOptionResponse } from '@vff/shared';
import type { Registry, RegistryEntry } from './detector';

/**
 * Cascading dropdowns (State → District → Taluk → Village): a child's options only load after its
 * parent is chosen. This module fills dropdowns one by one, waits for options to load, learns which
 * dropdown feeds which, and re-checks children when a parent changes.
 */

export const timing = {
  /** Max wait for a dropdown's options to load (server round-trip on slow government sites). */
  optionsWaitMs: 8000,
  /** After filling a dropdown with no known children: how long to watch for other dropdowns reacting. */
  noticeMs: 1500,
};
/** A dropdown's options count as loaded once they stop changing for this long. */
const QUIET_MS = 300;
const POLL_MS = 100;

/** Asks the AI to pick an option (via the service worker → /api/resolve-option). */
export type Resolver = (fieldKey: string, spoken: string, options: FieldOption[]) => Promise<ResolveOptionResponse | null>;

export type Unresolved = { field_key: string; spoken: string; top: string[]; reason: ChoiceReason };

/** Per page: learned parent links and the last value asked for each field (for re-cascading). */
export const memory = {
  /** child field_key → parent field_key, learned by watching which dropdowns react to which. */
  learned: new Map<string, string>(),
  /** Last value requested per field, so children can be re-filled after their parent changes. */
  remembered: new Map<string, string | null>(),
};

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function waitUntil(pred: () => boolean, timeoutMs: number, pollMs = POLL_MS): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (pred()) return true;
    if (Date.now() >= deadline) return false;
    await sleep(pollMs);
  }
}

export function isNativeSelect(entry: RegistryEntry): entry is RegistryEntry & { el: HTMLSelectElement } {
  return !entry.group && entry.el.tagName === 'SELECT';
}

/**
 * JSF/AJAX pages (like tnedistrict) often replace a dropdown's whole element when they reload its
 * options. Follow it by id (or name) so we keep watching the live element, and update the registry.
 */
export function liveSelect(entry: RegistryEntry): HTMLSelectElement {
  const el = entry.el as HTMLSelectElement;
  if (el.isConnected) return el;
  const doc = el.ownerDocument;
  const name = el.getAttribute('name');
  const fresh =
    (el.id ? doc.getElementById(el.id) : null) ??
    (name ? doc.querySelector(`select[name="${name.replace(/["\\]/g, '\\$&')}"]`) : null);
  if (fresh?.tagName === 'SELECT') entry.el = fresh as HTMLSelectElement;
  return entry.el as HTMLSelectElement;
}

const optText = (o: HTMLOptionElement) => (o.textContent ?? '').replace(/\s+/g, ' ').trim();

function isPlaceholder(o: HTMLOptionElement, index: number): boolean {
  if (o.value === '') return true;
  return index === 0 && (o.disabled || /^(--|select|choose|pick|loading)\b/i.test(optText(o)));
}

/** Real (non-placeholder) options as they are on the page right now. */
export function liveOptions(el: HTMLSelectElement): FieldOption[] {
  return [...el.options].filter((o, i) => !isPlaceholder(o, i)).map((o) => ({ value: o.value, label: optText(o) || o.value }));
}

/** Changes whenever the options are replaced or the dropdown is enabled/disabled. */
export function signature(el: HTMLSelectElement): string {
  return `${el.disabled ? 'D' : 'E'}|${[...el.options].map((o) => o.value).join('\u0001')}`;
}

export const isReady = (el: HTMLSelectElement) => !el.disabled && liveOptions(el).length > 0;

/** Some pages only load a dropdown's options when it is focused or clicked. */
function nudge(el: HTMLSelectElement) {
  const W = (el.ownerDocument.defaultView ?? window) as Window & typeof globalThis;
  el.focus?.();
  el.dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true }));
  el.dispatchEvent(new W.Event('focusin', { bubbles: true }));
  el.blur?.();
}

/** Waits for a dropdown to have real options (and be enabled), following it if the page replaces it. */
export async function waitForOptions(entry: RegistryEntry, timeoutMs = timing.optionsWaitMs): Promise<boolean> {
  if (isReady(liveSelect(entry))) return true;
  nudge(liveSelect(entry));
  return waitUntil(() => isReady(liveSelect(entry)), timeoutMs);
}

/** Local choice. `confident` = clear winner; otherwise the AI resolver is asked. */
export function chooseLocally(spoken: string, options: FieldOption[]) {
  const s = spoken.trim().toLowerCase();
  const exact = options.find((o) => o.label.toLowerCase() === s || o.value.toLowerCase() === s || o.value === spoken);
  if (exact) return { option: exact, confident: true, top: [exact.label] };
  const m = matchOption(spoken, options);
  const confident = !!m.option && (m.score >= 0.92 || (m.score >= 0.8 && m.score - m.runner_up >= 0.1));
  return { option: m.option && m.score >= 0.75 ? m.option : null, confident, top: m.top.filter((t) => t.score >= 0.5).map((t) => t.option.label) };
}

/** Parent of a field: from the Form Analyzer (`edges`) or learned on this page. */
export function parentOf(key: string, edges: Record<string, string>): string | null {
  return edges[key] ?? memory.learned.get(key) ?? null;
}

/** Fields whose options depend directly on `parent`. */
export function childrenOf(parent: string, edges: Record<string, string>): string[] {
  const links = new Map<string, string>([...memory.learned, ...Object.entries(edges)]);
  return [...links].filter(([child, par]) => par === parent && child !== parent).map(([child]) => child);
}

/** Fields whose options depend on `parent`, directly or further down the chain. */
export function descendantsOf(parent: string, edges: Record<string, string>): string[] {
  const links = new Map<string, string>([...memory.learned, ...Object.entries(edges)]);
  const out: string[] = [];
  const queue = [parent];
  while (queue.length) {
    const p = queue.shift()!;
    for (const [child, par] of links) {
      if (par === p && !out.includes(child) && child !== parent) {
        out.push(child);
        queue.push(child);
      }
    }
  }
  return out;
}

const signatures = (reg: Registry, except: string) =>
  new Map([...reg].filter(([k, e]) => k !== except && isNativeSelect(e)).map(([k, e]) => [k, signature(liveSelect(e))]));

/**
 * After a dropdown changes, waits for the page to react: known children must reload their options;
 * otherwise watches briefly (only if some dropdown is still empty) for any dropdown that reacts.
 * Dropdowns that react are learned as children of `parentKey`.
 */
export async function settleAfter(parentKey: string, reg: Registry, before: Map<string, string>, edges: Record<string, string>) {
  const known = descendantsOf(parentKey, edges).filter((k) => {
    const e = reg.get(k);
    return e && isNativeSelect(e) && liveSelect(e).isConnected;
  });
  const someEmpty = [...reg].some(([k, e]) => k !== parentKey && isNativeSelect(e) && !isReady(liveSelect(e)));
  if (!known.length && !someEmpty) return;

  const direct = known.filter((k) => parentOf(k, edges) === parentKey);
  const deadline = Date.now() + (direct.length ? timing.optionsWaitMs : timing.noticeMs);
  const changed = new Set<string>();
  let lastChange = Date.now();
  while (Date.now() < deadline) {
    await sleep(POLL_MS);
    for (const [k, sig] of before) {
      const e = reg.get(k);
      if (!e || !liveSelect(e).isConnected) continue;
      const now = signature(liveSelect(e));
      if (now !== sig) {
        changed.add(k);
        before.set(k, now);
        lastChange = Date.now();
      }
    }
    const quiet = Date.now() - lastChange >= QUIET_MS;
    if (direct.length) {
      if (direct.every((k) => changed.has(k)) && quiet) break;
    } else if (changed.size && quiet) break;
  }
  // Learn only direct children: dropdowns that reloaded WITH options. Grandchildren that were merely
  // reset (emptied) are not children of this parent.
  for (const k of changed) {
    const e = reg.get(k);
    if (e && isReady(liveSelect(e)) && !memory.learned.has(k) && !edges[k]) memory.learned.set(k, parentKey);
  }
}

export type SelectOutcome =
  | { status: 'filled'; changed: boolean; options: FieldOption[] }
  | { status: 'skipped'; reason: string }
  | { status: 'unresolved'; unresolved: Unresolved; options: FieldOption[] };

/**
 * Fills one native dropdown: waits for its options, picks the spoken value (locally, then the AI
 * resolver when unsure), sets it, then waits for the page to load any dependent dropdowns.
 */
export async function fillSelect(
  key: string,
  entry: RegistryEntry & { el: HTMLSelectElement },
  value: string | null,
  ctx: {
    reg: Registry;
    edges: Record<string, string>;
    resolve?: Resolver;
    setValue: (el: HTMLSelectElement, v: string) => void;
    reason?: ChoiceReason;
  },
): Promise<SelectOutcome> {
  const v = (value ?? '').trim();
  if (!v) {
    const el = liveSelect(entry);
    if (el.value !== '' && [...el.options].some((o) => o.value === '')) ctx.setValue(el, '');
    return { status: 'filled', changed: false, options: liveOptions(el) };
  }

  if (!(await waitForOptions(entry))) {
    return { status: 'unresolved', options: [], unresolved: { field_key: key, spoken: v, top: [], reason: 'not_loaded' } };
  }

  let el = liveSelect(entry);
  const options = liveOptions(el);
  const local = chooseLocally(v, options);
  let option = local.confident ? local.option : null;
  let top = local.top;
  let reason: ChoiceReason = ctx.reason ?? (local.option ? 'ambiguous' : 'no_match');

  if (!option && ctx.resolve) {
    const r = await ctx.resolve(key, v, options).catch(() => null);
    if (r?.choice) option = options.find((o) => o.label === r.choice) ?? null;
    if (r && !option) {
      top = r.top.length ? r.top : top;
      reason = ctx.reason ?? (r.ambiguous ? 'ambiguous' : 'no_match');
    }
  }
  // No resolver available (e.g. tests): accept the best local match if it is reasonably close.
  if (!option && !ctx.resolve && local.option) option = local.option;

  el = liveSelect(entry); // the AI call takes a moment; the page may have re-rendered meanwhile
  if (!option) {
    // A child whose old value doesn't fit its new parent: never leave a stale choice in place.
    if (ctx.reason === 'parent_changed' && el.value !== '' && [...el.options].some((o) => o.value === '')) ctx.setValue(el, '');
    return { status: 'unresolved', options, unresolved: { field_key: key, spoken: v, top: top.slice(0, 5), reason } };
  }

  if (el.value === option.value) return { status: 'filled', changed: false, options };
  const before = signatures(ctx.reg, key);
  ctx.setValue(el, option.value);
  await settleAfter(key, ctx.reg, before, ctx.edges);
  return { status: 'filled', changed: true, options };
}

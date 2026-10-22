import type { FieldDescriptorInput, FieldOption, FieldType, FormSchemaInput } from '@vff/shared';
import { staticOptions, widgetOf, type Widget } from './combobox';
import { clean, cssEscape, isHidden } from './dom';

/** A detected field and the live element(s) behind it. */
export type RegistryEntry = {
  descriptor: FieldDescriptorInput;
  /** The primary element (first radio / checkbox for groups). */
  el: HTMLElement;
  /** All radios / checkboxes of a group, with their option. */
  group?: { el: HTMLInputElement; option: FieldOption }[];
  /** Custom dropdown (react-select, MUI, choices.js, select2…): filled through its own UI. */
  widget?: Widget;
};
export type Registry = Map<string, RegistryEntry>;

const CANDIDATES = [
  'input',
  'select',
  'textarea',
  '[contenteditable=""]',
  '[contenteditable="true"]',
  '[role="combobox"]',
  '[role="radio"]',
  '[role="checkbox"]',
  'button[aria-haspopup="listbox"]',
].join(',');

const SKIP_INPUT_TYPES = new Set(['hidden', 'submit', 'button', 'reset', 'image', 'file', 'password', 'search', 'range', 'color']);
const SKIP_NAME = /csrf|xsrf|token|captcha|honeypot|recaptcha|authenticity/i;

/** Text of an element without the text of form controls inside it (e.g. a <label> wrapping a <select>). */
function textWithoutControls(el: Element): string {
  const clone = el.cloneNode(true) as Element;
  clone.querySelectorAll('input, select, textarea, option, button, script, style').forEach((n) => n.remove());
  return clean(clone.textContent);
}

function byIds(doc: Document | ShadowRoot, ids: string): string {
  return ids
    .split(/\s+/)
    .map((id) => {
      const n = (doc as Document).getElementById?.(id) ?? (doc as ShadowRoot).querySelector?.(`#${cssEscape(id)}`);
      return n ? clean(n.textContent) : '';
    })
    .filter(Boolean)
    .join(' ');
}

/** Short text right before the control: previous siblings, then the parent's previous siblings. */
function nearbyText(el: Element): string {
  let node: Element | null = el;
  for (let depth = 0; node && depth < 3; depth++, node = node.parentElement) {
    let sib = node.previousElementSibling;
    for (let i = 0; sib && i < 3; i++, sib = sib.previousElementSibling) {
      if (sib.matches(CANDIDATES) || sib.querySelector(CANDIDATES)) break;
      const t = clean(sib.textContent);
      if (t && t.length <= 80) return t;
    }
    // Text nodes directly before the control.
    let prev = node.previousSibling;
    while (prev && prev.nodeType === 3 && !clean(prev.textContent)) prev = prev.previousSibling;
    if (prev?.nodeType === 3) {
      const t = clean(prev.textContent);
      if (t && t.length <= 80) return t;
    }
  }
  return '';
}

export function resolveLabel(el: HTMLElement): string {
  const root = el.getRootNode() as Document | ShadowRoot;
  const id = el.id;
  if (id) {
    const lbl = root.querySelector?.(`label[for="${cssEscape(id)}"]`);
    if (lbl) {
      const t = textWithoutControls(lbl);
      if (t) return t;
    }
  }
  const wrapping = el.closest('label');
  if (wrapping) {
    const t = textWithoutControls(wrapping);
    if (t) return t;
  }
  const aria = clean(el.getAttribute('aria-label'));
  if (aria) return aria;
  const labelledby = el.getAttribute('aria-labelledby');
  if (labelledby) {
    const t = byIds(root, labelledby);
    if (t) return t;
  }
  const placeholder = clean(el.getAttribute('placeholder'));
  if (placeholder) return placeholder;
  const near = nearbyText(el);
  if (near) return near;
  return clean(el.getAttribute('title')) || clean(el.getAttribute('name'));
}

/** Label for a radio/checkbox group: fieldset legend, radiogroup label, or the text before the group. */
function groupLabel(first: HTMLInputElement, name: string): string {
  const fieldset = first.closest('fieldset');
  const legend = fieldset?.querySelector('legend');
  if (legend && clean(legend.textContent)) return clean(legend.textContent);
  const rg = first.closest('[role="radiogroup"], [role="group"]');
  if (rg) {
    const t = clean(rg.getAttribute('aria-label')) || (rg.getAttribute('aria-labelledby') ? byIds(first.getRootNode() as Document, rg.getAttribute('aria-labelledby')!) : '');
    if (t) return t;
  }
  // The text before the first option's label/wrapper.
  const anchor = first.closest('label') ?? first;
  return nearbyText(anchor.parentElement?.matches('div, span, p, li, td') ? anchor.parentElement : anchor) || clean(name);
}

function optionLabel(input: HTMLInputElement): string {
  return resolveLabelForChoice(input) || input.value;
}
function resolveLabelForChoice(input: HTMLInputElement): string {
  const root = input.getRootNode() as Document | ShadowRoot;
  if (input.id) {
    const lbl = root.querySelector?.(`label[for="${cssEscape(input.id)}"]`);
    if (lbl && textWithoutControls(lbl)) return textWithoutControls(lbl);
  }
  const wrap = input.closest('label');
  if (wrap && textWithoutControls(wrap)) return textWithoutControls(wrap);
  const aria = clean(input.getAttribute('aria-label'));
  if (aria) return aria;
  // <input> followed by a text node or <span>
  const next = input.nextSibling;
  if (next && clean(next.textContent)) return clean(next.textContent);
  return '';
}

function isPlaceholderOption(o: HTMLOptionElement, index: number): boolean {
  if (o.value === '') return true;
  return index === 0 && (o.disabled || /^(--|select|choose|pick)\b/i.test(clean(o.textContent)));
}

function selectOptions(sel: HTMLSelectElement): FieldOption[] {
  return [...sel.options]
    .filter((o, i) => !isPlaceholderOption(o, i))
    .map((o) => ({ value: o.value, label: clean(o.textContent) || o.value }));
}

/** CSS-ish path used when an element has neither id nor name. */
function domPath(el: Element): string {
  const parts: string[] = [];
  for (let n: Element | null = el; n && n.tagName !== 'BODY' && parts.length < 6; n = n.parentElement) {
    const parent: Element | null = n.parentElement;
    const idx = parent ? [...parent.children].filter((c) => c.tagName === n!.tagName).indexOf(n) : 0;
    parts.unshift(`${n.tagName.toLowerCase()}${idx ? `[${idx}]` : ''}`);
  }
  return parts.join('>');
}

function fieldTypeOf(el: HTMLElement): FieldType | null {
  const tag = el.tagName;
  if (tag === 'SELECT') return 'select';
  if (tag === 'TEXTAREA') return 'textarea';
  if (tag === 'INPUT') {
    const t = ((el as HTMLInputElement).type || 'text').toLowerCase();
    if (SKIP_INPUT_TYPES.has(t)) return null;
    if (t === 'radio') return 'radio';
    if (t === 'checkbox') return 'checkbox';
    if (t === 'email') return 'email';
    if (t === 'tel') return 'tel';
    if (t === 'number') return 'number';
    if (t === 'url') return 'url';
    if (t === 'date' || t === 'datetime-local' || t === 'month') return 'date';
    if (el.getAttribute('role') === 'combobox') return 'text';
    return 'text';
  }
  const role = el.getAttribute('role');
  if (role === 'radio') return 'radio';
  if (role === 'checkbox') return 'checkbox';
  if (role === 'combobox') return 'combobox';
  if (el.isContentEditable || el.getAttribute('contenteditable') !== null) return 'contenteditable';
  return null;
}

function isRequired(el: HTMLElement, label: string, rawLabel?: string): boolean {
  return (
    (el as HTMLInputElement).required === true ||
    el.getAttribute('aria-required') === 'true' ||
    /\*\s*:?\s*$/.test(rawLabel ?? '') ||
    /\(required\)/i.test(label)
  );
}

function rawLabelText(el: HTMLElement): string {
  const root = el.getRootNode() as Document | ShadowRoot;
  const lbl = (el.id && root.querySelector?.(`label[for="${cssEscape(el.id)}"]`)) || el.closest('label');
  return lbl ? (lbl.textContent ?? '') : '';
}

/** Collects the document, same-origin iframes and open shadow roots. */
function collectRoots(doc: Document): (Document | ShadowRoot)[] {
  const roots: (Document | ShadowRoot)[] = [];
  const visit = (root: Document | ShadowRoot) => {
    roots.push(root);
    root.querySelectorAll('*').forEach((n) => {
      if (n.shadowRoot) visit(n.shadowRoot);
      if (n.tagName === 'IFRAME') {
        try {
          const d = (n as HTMLIFrameElement).contentDocument;
          if (d?.body) visit(d);
        } catch {
          /* cross-origin: not supported in the MVP */
        }
      }
    });
  };
  visit(doc);
  return roots;
}

function contextText(el: HTMLElement): string | null {
  const ids = el.getAttribute('aria-describedby');
  const t = ids ? byIds(el.getRootNode() as Document, ids) : '';
  return t ? t.slice(0, 500) : null;
}

export function detect(doc: Document = document): { schema: FormSchemaInput; registry: Registry } {
  const registry: Registry = new Map();
  const usedKeys = new Map<string, number>();
  const uniqueKey = (k: string) => {
    const n = usedKeys.get(k) ?? 0;
    usedKeys.set(k, n + 1);
    return n ? `${k}#${n + 1}` : k;
  };
  const seenGroups = new Set<string>();
  /** Custom dropdowns found so far: their inner inputs / hidden selects are part of them. */
  const widgets: Widget[] = [];
  const inWidget = (el: Element) => widgets.some((w) => w.root.contains(el) || w.valueEl === el);

  for (const root of collectRoots(doc)) {
    const els = [...root.querySelectorAll<HTMLElement>(CANDIDATES)];
    for (const el of els) {
      if (el.closest('[role="search"]') || el.closest('[data-vff-ignore]')) continue;
      if (inWidget(el)) continue;
      const widget = widgetOf(el);
      if (widget === 'skip') continue;
      if (widget) {
        if (isHidden(widget.root)) continue;
        widgets.push(widget);
        registerWidget(widget);
        continue;
      }
      const type = fieldTypeOf(el);
      if (!type) continue;
      // Disabled dropdowns are kept: in a cascade (District → Taluk) the child is disabled until its parent is chosen.
      if (((el as HTMLInputElement).disabled && el.tagName !== 'SELECT') || (el as HTMLInputElement).readOnly) continue;
      const name = el.getAttribute('name') ?? '';
      if (SKIP_NAME.test(name) || SKIP_NAME.test(el.id)) continue;
      if (isHidden(el)) continue;
      // Contenteditable children of an editable region are covered by their parent.
      if (type === 'contenteditable' && el.parentElement?.closest('[contenteditable=""],[contenteditable="true"]')) continue;

      const form = el.closest('form');
      const formIdx = form ? [...doc.forms].indexOf(form) : -1;

      // Native radio / checkbox groups by name.
      if (el.tagName === 'INPUT' && (type === 'radio' || type === 'checkbox') && name) {
        const groupId = `${formIdx}|${type}|${name}`;
        if (seenGroups.has(groupId)) continue;
        const scope: ParentNode = form ?? root;
        const members = [...scope.querySelectorAll<HTMLInputElement>(`input[type="${type}"][name="${cssEscape(name)}"]`)].filter(
          (m) => !m.disabled && !isHidden(m),
        );
        if (type === 'radio' || members.length > 1) {
          seenGroups.add(groupId);
          const group = members.map((m) => ({ el: m, option: { value: m.value, label: optionLabel(m) } }));
          const label = groupLabel(members[0], name);
          const key = uniqueKey(name);
          registry.set(key, {
            el: members[0],
            group,
            descriptor: {
              field_key: key,
              label,
              field_type: type,
              required: members.some((m) => m.required) || /\*\s*$/.test(label),
              options: group.map((g) => g.option),
              multiple: type === 'checkbox',
              group_key: clean(members[0].closest('fieldset')?.querySelector('legend')?.textContent) || null,
              context: contextText(members[0]),
            },
          });
          continue;
        }
      }

      const label = resolveLabel(el);
      const raw = rawLabelText(el);
      const key = uniqueKey(el.id || name || `path:${domPath(el)}`);
      const input = el as HTMLInputElement;
      const fieldsetLegend = el.closest('fieldset')?.querySelector('legend')?.textContent;
      registry.set(key, {
        el,
        descriptor: {
          field_key: key,
          label: label || key,
          field_type: type,
          required: isRequired(el, label, raw),
          options: el.tagName === 'SELECT' ? selectOptions(el as HTMLSelectElement) : [],
          dynamic_options:
            el.tagName === 'SELECT' && ((el as HTMLSelectElement).disabled || selectOptions(el as HTMLSelectElement).length === 0),
          multiple: el.tagName === 'SELECT' ? (el as HTMLSelectElement).multiple : false,
          group_key: clean(fieldsetLegend) || null,
          min: input.min || null,
          max: input.max || null,
          pattern: input.pattern || null,
          placeholder: el.getAttribute('placeholder') || null,
          context: contextText(el),
        },
      });
    }
  }

  /** A custom dropdown is a 'select' field to the server, the mapper and the phone. */
  function registerWidget(w: Widget) {
    const name = w.valueEl?.getAttribute('name') ?? '';
    const key = uniqueKey(name || w.valueEl?.id || w.input?.id || w.trigger.id || w.root.id || `path:${domPath(w.root)}`);
    const label = resolveLabel(w.labelEl);
    const options = staticOptions(w);
    registry.set(key, {
      el: w.root,
      widget: w,
      descriptor: {
        field_key: key,
        label: label || key,
        field_type: 'select',
        required:
          (w.valueEl as HTMLInputElement | null)?.required === true ||
          [w.labelEl, w.input, w.trigger].some((n) => n?.getAttribute('aria-required') === 'true') ||
          /\*\s*:?\s*$/.test(rawLabelText(w.labelEl)),
        options,
        // Lists that load when opened (or while typing) are read at fill time and sent to the phone.
        dynamic_options: options.length === 0,
        multiple: w.multiple,
        group_key: clean(w.root.closest('fieldset')?.querySelector('legend')?.textContent) || null,
        placeholder: w.input?.getAttribute('placeholder') || null,
        context: contextText(w.labelEl),
      },
    });
  }

  const schema: FormSchemaInput = {
    page_url: doc.location?.href ?? 'about:blank',
    page_title: clean(doc.title).slice(0, 500),
    form_title: formTitle(doc, registry),
    html_snippet: htmlSnippet(doc, registry),
    fields: [...registry.values()].map((r) => r.descriptor),
  };
  return { schema, registry };
}

function formTitle(doc: Document, registry: Registry): string | null {
  const first = registry.values().next().value?.el;
  const container = first?.closest('form') ?? doc.body;
  const h = container?.querySelector('h1, h2, h3, legend') ?? doc.querySelector('h1');
  const t = clean(h?.textContent);
  return t ? t.slice(0, 200) : null;
}

/** Visible text of the form(s), so the analyzer sees help text and instructions. */
function htmlSnippet(doc: Document, registry: Registry): string {
  const forms = new Set<Element>();
  for (const r of registry.values()) forms.add(r.el.closest('form') ?? doc.body);
  const text = [...forms].map((f) => textWithoutControls(f)).join('\n');
  return text.slice(0, 6000);
}

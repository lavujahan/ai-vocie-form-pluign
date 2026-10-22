/** Small DOM helpers shared by the detector, the filler and the custom-dropdown adapter. */

/** CSS.escape with a fallback for environments without it (jsdom). */
export const cssEscape = (s: string) =>
  typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(s) : s.replace(/([^\w-])/g, '\\$1');

export const clean = (s: string | null | undefined) =>
  (s ?? '')
    .replace(/\s+/g, ' ')
    .replace(/\s*[*:]+\s*$/, '')
    .replace(/^\s*[*]\s*/, '')
    .trim();

/** Visibility without layout (works in jsdom too): hidden attr, display/visibility, aria-hidden ancestors. */
export function isHidden(el: Element): boolean {
  for (let n: Element | null = el; n; n = n.parentElement) {
    if (n.hasAttribute('hidden') || n.getAttribute('aria-hidden') === 'true') return true;
    const view: Window | null = n.ownerDocument.defaultView;
    const style = view?.getComputedStyle(n);
    if (style && (style.display === 'none' || style.visibility === 'hidden')) return true;
  }
  return false;
}

export function win(el: Element): Window & typeof globalThis {
  return (el.ownerDocument.defaultView ?? window) as Window & typeof globalThis;
}

export function fire(el: Element, type: string) {
  const W = win(el);
  el.dispatchEvent(new W.Event(type, { bubbles: true, composed: true }));
}

/** Sets .value through the prototype's native setter, so frameworks that track the instance value (React) see it. */
export function setValueNatively(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')?.set;
  if (setter) setter.call(el, value);
  else el.value = value;
}

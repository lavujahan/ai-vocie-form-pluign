import type { RegistryEntry } from './detector';
import { clean, fire, isHidden } from './dom';

/**
 * Puts a file from the phone into the website's upload field, as if the user had chosen it: a real
 * File in `input.files` and the usual input / change events. The site's own checks (size, type) run
 * on it as for any upload; if it shows an error or throws the file away, that is reported back.
 */

export type FileFillResult =
  | { ok: true; needsUploadClick: boolean }
  | { ok: false; error: string };

const SETTLE_MS = 700;
const ERROR_SELECTOR = '[role="alert"], [aria-live], .error, .invalid-feedback, .text-danger, .help-block, [class*="error"], [class*="invalid"]';

/** The block around the field where sites print "file too large" and similar messages. */
function areaOf(input: HTMLElement): HTMLElement {
  let n: HTMLElement = input.parentElement ?? input;
  for (let d = 0; d < 3 && n.parentElement && n.parentElement.tagName !== 'FORM' && n.parentElement !== n.ownerDocument.body; d++) n = n.parentElement;
  return n;
}

const errorTexts = (area: HTMLElement) =>
  new Set([...area.querySelectorAll<HTMLElement>(ERROR_SELECTOR)].filter((e) => !isHidden(e)).map((e) => clean(e.textContent)).filter(Boolean));

function decode(base64: string): Uint8Array {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function mark(el: HTMLElement | null, ms = 4000) {
  if (!el) return;
  const prev = { outline: el.style.outline, offset: el.style.outlineOffset };
  el.style.outline = '3px solid #f2b705';
  el.style.outlineOffset = '2px';
  setTimeout(() => {
    el.style.outline = prev.outline;
    el.style.outlineOffset = prev.offset;
  }, ms);
}

/** Fills (or, with `data` null, empties) an upload field. */
export async function fillFile(
  entry: RegistryEntry,
  data: { name: string; mime: string; base64: string } | null,
  opts: { highlight?: boolean } = {},
): Promise<FileFillResult> {
  const input = entry.el as HTMLInputElement;
  if (!input.isConnected) return { ok: false, error: "The upload field isn't on the page any more" };
  if (!data) {
    input.value = '';
    fire(input, 'input');
    fire(input, 'change');
    return { ok: true, needsUploadClick: false };
  }

  const area = areaOf(input);
  const before = errorTexts(area);
  const W = (input.ownerDocument.defaultView ?? window) as Window & typeof globalThis;
  const file = new W.File([decode(data.base64) as BlobPart], data.name, { type: data.mime, lastModified: Date.now() });
  const dt = new W.DataTransfer();
  dt.items.add(file);
  input.files = dt.files;
  fire(input, 'input');
  fire(input, 'change');

  await new Promise((r) => setTimeout(r, SETTLE_MS));
  // The site's own check: a new error message next to the field, or the file taken out again.
  const fresh = [...errorTexts(area)].filter((t) => !before.has(t));
  if (fresh.length) return { ok: false, error: fresh.join(' ').slice(0, 300) };
  if (!input.files?.length) return { ok: false, error: 'The website removed the file. Check its size and type rules.' };

  const uploadButton = entry.file?.uploadButton && entry.file.uploadButton.isConnected ? entry.file.uploadButton : null;
  if (opts.highlight !== false) {
    mark(entry.file?.trigger ?? input, 1500);
    // Sites that only upload when their own button is clicked: show the user which one.
    mark(uploadButton, 8000);
  }
  return { ok: true, needsUploadClick: !!uploadButton };
}

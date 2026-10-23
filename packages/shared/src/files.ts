import type { FileFormat, FileRules } from './schemas';

/**
 * File upload fields: what a field accepts and whether a file fits. Shared by the phone (before
 * converting / uploading), the server (after the upload) and the extension (popup labels).
 */

const MIME: Record<FileFormat, 'image/jpeg' | 'image/png' | 'application/pdf'> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  pdf: 'application/pdf',
};
const ALL: FileFormat[] = ['jpg', 'png', 'pdf'];

export const mimeOf = (f: FileFormat) => MIME[f];
export const formatOfMime = (mime: string): FileFormat | null =>
  (Object.entries(MIME).find(([, m]) => m === mime)?.[0] as FileFormat | undefined) ?? null;
export const extensionOf = (f: FileFormat) => (f === 'jpg' ? 'jpg' : f);

/** Formats an `accept` attribute allows (".pdf, image/*" → pdf, jpg, png). Empty when it says nothing usable. */
export function formatsFromAccept(accept: string | null | undefined): FileFormat[] {
  const out = new Set<FileFormat>();
  for (const raw of (accept ?? '').toLowerCase().split(',')) {
    const t = raw.trim();
    if (!t) continue;
    if (t === 'image/*') {
      out.add('jpg');
      out.add('png');
    } else if (t === '.pdf' || t === 'application/pdf') out.add('pdf');
    else if (t === '.jpg' || t === '.jpeg' || t === 'image/jpeg' || t === 'image/jpg') out.add('jpg');
    else if (t === '.png' || t === 'image/png') out.add('png');
  }
  return ALL.filter((f) => out.has(f));
}

const clamp = (n: number | null | undefined, lo: number, hi: number) =>
  n == null || !Number.isFinite(n) ? null : Math.min(hi, Math.max(lo, n));

/** Keeps the analyzer's rules within sane bounds; `accept` wins over what the AI read from the text. */
export function sanitizeFileRules(rules: FileRules | null | undefined, accept: string | null | undefined): FileRules {
  const fromAccept = formatsFromAccept(accept);
  const said = (rules?.formats ?? []).filter((f) => ALL.includes(f));
  let formats = fromAccept.length ? (said.filter((f) => fromAccept.includes(f)).length ? said.filter((f) => fromAccept.includes(f)) : fromAccept) : said;
  if (!formats.length) formats = [...ALL];
  const max_kb = clamp(rules?.max_kb, 1, 20_480);
  const min = clamp(rules?.min_kb, 0, max_kb ?? 20_480);
  const shape = cleanShape(rules?.shape);
  let width_px = clamp(rules?.width_px, 16, 5000);
  let height_px = clamp(rules?.height_px, 16, 5000);
  // A size stated in pixels is an exact size.
  if (shape?.unit === 'px' && !(width_px && height_px)) {
    width_px = clamp(Math.round(shape.w), 16, 5000);
    height_px = clamp(Math.round(shape.h), 16, 5000);
  }
  return {
    kind: rules?.kind ?? (formats.length === 1 && formats[0] === 'pdf' ? 'document' : 'photo'),
    formats: [...new Set(formats)],
    max_kb,
    min_kb: min ? min : null,
    max_pages: clamp(rules?.max_pages, 1, 200),
    width_px: width_px && height_px ? width_px : null,
    height_px: width_px && height_px ? height_px : null,
    shape,
    note: rules?.note?.trim().slice(0, 200) || null,
  };
}

/** A stated photo size that makes sense (positive, not absurdly thin), or null. */
function cleanShape(shape: FileRules['shape'] | undefined): FileRules['shape'] {
  if (!shape || !(shape.w > 0) || !(shape.h > 0)) return null;
  const ratio = shape.w / shape.h;
  if (ratio < 0.2 || ratio > 5) return null;
  return { w: shape.w, h: shape.h, unit: shape.unit };
}

const PER_INCH: Record<'mm' | 'cm' | 'in', number> = { mm: 25.4, cm: 2.54, in: 1 };
/** Print resolution for a size stated in cm / mm / inches; capped so the file stays small. */
const DPI = 300;
const MAX_SHAPE_PX = 1200;

/**
 * The shape the photo must have, only when the page states a size (never assumed, not even for
 * "passport size"): `ratio` = width / height for the crop frame, and the pixel size to produce.
 * `exact` sizes (stated in px) must be met exactly; others may shrink to fit the KB limit.
 */
export function photoShape(rules: FileRules): { ratio: number; w: number; h: number; exact: boolean } | null {
  if (rules.width_px && rules.height_px) return { ratio: rules.width_px / rules.height_px, w: rules.width_px, h: rules.height_px, exact: true };
  const s = rules.shape;
  if (!s || s.unit === 'px') return null;
  let w = (s.w / PER_INCH[s.unit]) * DPI;
  let h = (s.h / PER_INCH[s.unit]) * DPI;
  const scale = Math.min(1, MAX_SHAPE_PX / Math.max(w, h));
  w = Math.round(w * scale);
  h = Math.round(h * scale);
  return { ratio: s.w / s.h, w, h, exact: false };
}

const trim = (n: number) => String(Math.round(n * 100) / 100);

/** The rules to apply for a field: the analyzer's (sanitized), else what `accept` says. */
export function effectiveFileRules(field: { accept?: string | null; file_rules?: FileRules | null }): FileRules {
  return sanitizeFileRules(field.file_rules ?? null, field.accept ?? null);
}

/** The format to produce: a PDF for several pages or PDF-only fields, else an image (JPG preferred). */
export function targetFormat(rules: FileRules, pages: number): FileFormat {
  const images = rules.formats.filter((f) => f !== 'pdf');
  const pdf = rules.formats.includes('pdf');
  if (pdf && (pages > 1 || !images.length || (rules.kind === 'document' && images.length < rules.formats.length))) return 'pdf';
  return images.includes('jpg') ? 'jpg' : images[0] ?? 'pdf';
}

/** The real type of a file from its first bytes (JPEG / PNG / PDF), whatever its name says. */
export function sniffMime(head: Uint8Array): 'image/jpeg' | 'image/png' | 'application/pdf' | null {
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'image/jpeg';
  if (head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47) return 'image/png';
  if (head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46) return 'application/pdf';
  return null;
}

export const formatSize = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

/** Why a file doesn't fit the field (English, for the server's reply), or null when it does. */
export function checkFile(rules: FileRules, file: { mime: string; bytes: number; pages?: number | null }): string | null {
  const format = formatOfMime(file.mime);
  if (!format || !rules.formats.includes(format)) {
    return `This field takes ${rules.formats.map((f) => f.toUpperCase()).join(' or ')}, not ${format?.toUpperCase() ?? file.mime}.`;
  }
  if (rules.max_kb && file.bytes > rules.max_kb * 1024) return `The file is ${formatSize(file.bytes)}; the limit is ${formatSize(rules.max_kb * 1024)}.`;
  if (rules.min_kb && file.bytes < rules.min_kb * 1024) return `The file is ${formatSize(file.bytes)}; it must be at least ${formatSize(rules.min_kb * 1024)}.`;
  if (rules.max_pages && file.pages && file.pages > rules.max_pages) return `The PDF has ${file.pages} pages; at most ${rules.max_pages} are allowed.`;
  return null;
}

/** Short summary for labels: "JPG · max 50 KB", "PDF · max 1.0 MB · up to 3 pages". */
export function describeFileRules(rules: FileRules): string {
  const parts = [rules.formats.map((f) => f.toUpperCase()).join(' / ')];
  if (rules.max_kb) parts.push(`max ${formatSize(rules.max_kb * 1024)}`);
  if (rules.max_pages && rules.formats.includes('pdf')) parts.push(`up to ${rules.max_pages} ${rules.max_pages === 1 ? 'page' : 'pages'}`);
  if (rules.width_px && rules.height_px) parts.push(`${rules.width_px}×${rules.height_px} px`);
  else if (rules.shape && rules.shape.unit !== 'px') parts.push(`${trim(rules.shape.w)}×${trim(rules.shape.h)} ${rules.shape.unit}`);
  return parts.join(' · ');
}

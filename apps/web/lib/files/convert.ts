import { checkFile, mimeOf, targetFormat, type FileFormat, type FileRules } from '@vff/shared';

/**
 * Runs on the phone (browser only). Turns camera photos into what the website's upload field takes:
 * a JPG / PNG under the size limit, or one PDF made of several photos under the size limit. Re-encoding
 * through a canvas also drops EXIF data (including the GPS location). Nothing is sent anywhere here.
 */

/** Part of the photo to keep, as fractions of its width / height (after rotation). */
export type Crop = { x: number; y: number; w: number; h: number };
export type Rotation = 0 | 90 | 180 | 270;
export type Page = { id: string; file: Blob; rotate: Rotation; crop: Crop | null };

export type Prepared = {
  file: File;
  format: FileFormat;
  pages: number;
  /** Why it still doesn't fit the field (English, shown translated), or null. */
  problem: string | null;
};

const MAX_SIDE = 1600;
/** A4 portrait in PDF points. */
const A4 = { w: 595.28, h: 841.89 };
const MARGIN = 18;

type Source = ImageBitmap | HTMLImageElement;

async function decode(blob: Blob): Promise<Source> {
  if (typeof createImageBitmap === 'function') {
    try {
      // Applies the camera's EXIF rotation, so the photo is upright before the user's own rotation.
      return await createImageBitmap(blob, { imageOrientation: 'from-image' } as ImageBitmapOptions);
    } catch {
      /* older browsers: fall back to <img> */
    }
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

const sizeOf = (s: Source) => ({ w: 'naturalWidth' in s ? s.naturalWidth : s.width, h: 'naturalHeight' in s ? s.naturalHeight : s.height });

/**
 * Draws the page rotated and cropped onto a white canvas: at most `maxSide` px on the long side, or
 * exactly `exact` px (filling it and trimming the overflow evenly) when the field asks for a size.
 */
function render(src: Source, page: Page, maxSide: number, exact?: { w: number; h: number }): HTMLCanvasElement {
  const { w: sw, h: sh } = sizeOf(src);
  const turned = page.rotate === 90 || page.rotate === 270;
  // Rotated size, then the crop (fractions of the rotated photo).
  const rw = turned ? sh : sw;
  const rh = turned ? sw : sh;
  const c = page.crop ?? { x: 0, y: 0, w: 1, h: 1 };
  const cw = Math.max(1, rw * c.w);
  const ch = Math.max(1, rh * c.h);

  let outW: number;
  let outH: number;
  let scale: number;
  let offX = 0;
  let offY = 0;
  if (exact) {
    outW = exact.w;
    outH = exact.h;
    scale = Math.max(outW / cw, outH / ch);
    offX = (outW - cw * scale) / 2;
    offY = (outH - ch * scale) / 2;
  } else {
    scale = Math.min(1, maxSide / Math.max(cw, ch));
    outW = Math.round(cw * scale);
    outH = Math.round(ch * scale);
  }

  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, outW, outH);
  ctx.imageSmoothingQuality = 'high';
  ctx.save();
  // Move so the crop's top-left lands at the offset, then rotate the full photo around its origin.
  ctx.translate(offX - rw * c.x * scale, offY - rh * c.y * scale);
  ctx.scale(scale, scale);
  if (page.rotate === 90) ctx.translate(rw, 0);
  if (page.rotate === 180) ctx.translate(rw, rh);
  if (page.rotate === 270) ctx.translate(0, rh);
  ctx.rotate((page.rotate * Math.PI) / 180);
  ctx.drawImage(src as CanvasImageSource, 0, 0);
  ctx.restore();
  return canvas;
}

const toBlob = (canvas: HTMLCanvasElement, type: string, quality?: number) =>
  new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode failed'))), type, quality));

/** The best JPEG quality (0.35–0.92) that fits `maxBytes`, by binary search; null if even 0.35 is too big. */
async function jpegUnder(canvas: HTMLCanvasElement, maxBytes: number | null, floor = 0.35): Promise<Blob | null> {
  if (!maxBytes) return toBlob(canvas, 'image/jpeg', 0.85);
  let lo = floor;
  let hi = 0.92;
  let best: Blob | null = null;
  const top = await toBlob(canvas, 'image/jpeg', hi);
  if (top.size <= maxBytes) return top;
  for (let i = 0; i < 7; i++) {
    const q = (lo + hi) / 2;
    const b = await toBlob(canvas, 'image/jpeg', q);
    if (b.size <= maxBytes) {
      best = b;
      lo = q;
    } else hi = q;
  }
  if (best) return best;
  const bottom = await toBlob(canvas, 'image/jpeg', floor);
  return bottom.size <= maxBytes ? bottom : null;
}

const exactSize = (rules: FileRules) => (rules.width_px && rules.height_px ? { w: rules.width_px, h: rules.height_px } : undefined);

/** One image: as large and sharp as the size limit allows, shrinking the photo only when needed. */
async function makeImage(page: Page, rules: FileRules, format: 'jpg' | 'png'): Promise<Blob> {
  const src = await decode(page.file);
  const exact = exactSize(rules);
  const max = rules.max_kb ? rules.max_kb * 1024 : null;
  if (format === 'png') {
    const png = await toBlob(render(src, page, MAX_SIDE, exact), 'image/png');
    if (!max || png.size <= max) return png;
  }
  let side = MAX_SIDE;
  for (let i = 0; i < 10; i++) {
    const blob = await jpegUnder(render(src, page, side, exact), max, exact ? 0.15 : 0.35);
    if (blob) return blob;
    if (exact) break;
    side = Math.round(side * 0.8);
  }
  // Smallest we could make: the field's rule check below reports it.
  return toBlob(render(src, page, Math.min(side, 400), exact), 'image/jpeg', 0.3);
}

/** Several photos as one PDF, one per A4 page; re-built smaller until it fits the limit. */
async function makePdf(pages: Page[], rules: FileRules): Promise<Blob> {
  const { PDFDocument } = await import('pdf-lib');
  const sources = await Promise.all(pages.map((p) => decode(p.file)));
  const max = rules.max_kb ? rules.max_kb * 1024 : null;
  const steps: [number, number][] = [
    [1600, 0.8],
    [1600, 0.6],
    [1300, 0.55],
    [1100, 0.5],
    [900, 0.45],
    [750, 0.4],
    [600, 0.35],
    [480, 0.3],
  ];
  let last: Blob | null = null;
  for (const [side, quality] of steps) {
    const doc = await PDFDocument.create();
    for (const [i, page] of pages.entries()) {
      const canvas = render(sources[i], page, side);
      const jpg = await doc.embedJpg(await (await toBlob(canvas, 'image/jpeg', quality)).arrayBuffer());
      const landscape = jpg.width > jpg.height;
      const pw = landscape ? A4.h : A4.w;
      const ph = landscape ? A4.w : A4.h;
      const fit = Math.min((pw - 2 * MARGIN) / jpg.width, (ph - 2 * MARGIN) / jpg.height);
      const pdfPage = doc.addPage([pw, ph]);
      pdfPage.drawImage(jpg, { x: (pw - jpg.width * fit) / 2, y: (ph - jpg.height * fit) / 2, width: jpg.width * fit, height: jpg.height * fit });
    }
    last = new Blob([(await doc.save()) as BlobPart], { type: 'application/pdf' });
    if (!max || last.size <= max) return last;
  }
  return last!;
}

/** Number of pages in a PDF (null when it can't be read). */
export async function pdfPageCount(blob: Blob): Promise<number | null> {
  try {
    const { PDFDocument } = await import('pdf-lib');
    return (await PDFDocument.load(await blob.arrayBuffer(), { ignoreEncryption: true, updateMetadata: false })).getPageCount();
  } catch {
    return null;
  }
}

/** The photo turned the way the user rotated it (no crop), small, for the crop screen. */
export async function rotatedPreview(page: Page, maxSide = 900): Promise<string> {
  const canvas = render(await decode(page.file), { ...page, crop: null }, maxSide);
  return canvas.toDataURL('image/jpeg', 0.8);
}

/** A PDF the user picked on the phone: checked as it is (shrinking an existing PDF comes later). */
export async function checkPickedPdf(file: File, rules: FileRules): Promise<Prepared> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (String.fromCharCode(...bytes.slice(0, 4)) !== '%PDF') {
    return { file, format: 'pdf', pages: 0, problem: 'This is not a PDF file.' };
  }
  // Unreadable structure: count it as one page and let the size check speak.
  const pages = (await pdfPageCount(file)) ?? 1;
  const problem = checkFile(rules, { mime: 'application/pdf', bytes: file.size, pages });
  return {
    file: new File([bytes], 'upload.pdf', { type: 'application/pdf' }),
    format: 'pdf',
    pages,
    problem: problem && rules.max_kb && file.size > rules.max_kb * 1024 ? `${problem} Take photos of the pages instead.` : problem,
  };
}

/** Turns the photos into the field's format, within its size limit. */
export async function preparePages(pages: Page[], rules: FileRules): Promise<Prepared> {
  const format = targetFormat(rules, pages.length);
  const blob = format === 'pdf' ? await makePdf(pages, rules) : await makeImage(pages[0], rules, format);
  const mime = format === 'pdf' ? 'application/pdf' : blob.type || mimeOf(format);
  const realFormat: FileFormat = mime === 'image/png' ? 'png' : mime === 'application/pdf' ? 'pdf' : 'jpg';
  const n = realFormat === 'pdf' ? pages.length : 1;
  return {
    file: new File([blob], `upload.${realFormat}`, { type: mime }),
    format: realFormat,
    pages: n,
    problem: checkFile(rules, { mime, bytes: blob.size, pages: realFormat === 'pdf' ? n : null }),
  };
}

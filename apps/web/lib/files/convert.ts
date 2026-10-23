import { checkFile, mimeOf, photoShape, targetFormat, type FileFormat, type FileRules } from '@vff/shared';
import { cleanScan, findDocument, straightSize, warp, type Quad } from './docscan';

/**
 * Runs on the phone (browser only). Turns camera photos into what the website's upload field takes:
 * a JPG / PNG under the size limit, or one PDF made of several photos under the size limit. Re-encoding
 * through a canvas also drops EXIF data (including the GPS location). Document photos can be straightened
 * from the sheet's 4 corners and given a white "scan look". Nothing is sent anywhere here.
 */

/** Part of the photo to keep, as fractions of its width / height (after rotation). */
export type Crop = { x: number; y: number; w: number; h: number };
export type Rotation = 0 | 90 | 180 | 270;
export type Page = {
  id: string;
  file: Blob;
  rotate: Rotation;
  crop: Crop | null;
  /** Corners of the document (fractions of the turned photo): the sheet is cut out and straightened. */
  quad?: Quad | null;
  /** Scan look: white paper, darker writing. */
  clean?: boolean;
};

export type Prepared = {
  file: File;
  format: FileFormat;
  pages: number;
  /** Why it still doesn't fit the field (English, shown translated), or null. */
  problem: string | null;
  /** A picked PDF that was made smaller: its size before. */
  shrunkFrom?: number;
};

/** Messages for a picked PDF that can't be made smaller (shown translated). */
export const PDF_LOCKED = 'This PDF is locked with a password. Take photos of the pages instead.';
export const PDF_TOO_LONG = 'This PDF has too many pages to make smaller on the phone. Take photos of the pages instead.';

const MAX_SIDE = 1600;
/** A4 portrait in PDF points. */
const A4 = { w: 595.28, h: 841.89 };
const MARGIN = 18;

type Source = ImageBitmap | HTMLImageElement | HTMLCanvasElement;

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
 * Draws the page rotated and cropped (or cut out along the document's corners) onto a white canvas: at
 * most `maxSide` px on the long side, or exactly `exact` px (filling it and trimming the overflow evenly)
 * when the field asks for a size.
 */
function render(src: Source, page: Page, maxSide: number, exact?: { w: number; h: number }): HTMLCanvasElement {
  if (page.quad) return render(straighten(src, page, maxSide), { ...page, rotate: 0, crop: null, quad: null }, maxSide, exact);
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
  if (page.clean) {
    const img = ctx.getImageData(0, 0, outW, outH);
    cleanScan(img.data, outW, outH);
    ctx.putImageData(img, 0, 0);
  }
  return canvas;
}

/** The document inside the page's corners, straightened (perspective corrected), at most `maxSide` px. */
function straighten(src: Source, page: Page, maxSide: number): HTMLCanvasElement {
  const q = page.quad!;
  const xs = q.map((p) => p.x);
  const ys = q.map((p) => p.y);
  const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  // The turned photo, drawn large enough that the document keeps about the result's sharpness.
  const turned = render(src, { ...page, crop: null, quad: null, clean: false }, Math.min(3000, Math.round(maxSide / Math.max(0.25, span))));
  const img = turned.getContext('2d')!.getImageData(0, 0, turned.width, turned.height);
  const corners = q.map((p) => ({ x: p.x * turned.width, y: p.y * turned.height })) as Quad;
  const { w, h } = straightSize(corners, maxSide);
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  out.getContext('2d')!.putImageData(new ImageData(warp(img, corners, w, h), w, h), 0, 0);
  turned.width = turned.height = 0; // frees the canvas memory now
  return out;
}

/** Where the sheet of paper is in a document photo (after the user's rotation), or null when unclear. */
export async function detectQuad(page: Page): Promise<Quad | null> {
  const canvas = render(await decode(page.file), { ...page, crop: null, quad: null, clean: false }, 480);
  const { data } = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height);
  return findDocument(data, canvas.width, canvas.height);
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

/**
 * One image: as large and sharp as the size limit allows, shrinking the photo only when needed. When
 * the page states a size, the photo gets that shape: exactly the stated pixels, or (for cm / mm / inch)
 * the stated proportions at print resolution, made smaller if needed to fit the KB limit.
 */
async function makeImage(page: Page, rules: FileRules, format: 'jpg' | 'png'): Promise<Blob> {
  const src = await decode(page.file);
  const shape = photoShape(rules);
  const max = rules.max_kb ? rules.max_kb * 1024 : null;
  if (shape && !shape.exact) {
    for (let scale = 1; scale > 0.2; scale *= 0.85) {
      const size = { w: Math.max(16, Math.round(shape.w * scale)), h: Math.max(16, Math.round(shape.h * scale)) };
      const canvas = render(src, page, MAX_SIDE, size);
      if (format === 'png') {
        const png = await toBlob(canvas, 'image/png');
        if (!max || png.size <= max) return png;
      }
      const blob = await jpegUnder(canvas, max);
      if (blob) return blob;
    }
    // Still too big: keep the shape at the smallest size; the field's rule check reports the size.
    const tiny = { w: Math.max(16, Math.round(shape.w * 0.2)), h: Math.max(16, Math.round(shape.h * 0.2)) };
    return toBlob(render(src, page, MAX_SIDE, tiny), 'image/jpeg', 0.3);
  }
  const exact = shape?.exact ? { w: shape.w, h: shape.h } : undefined;
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

/**
 * Several photos as one PDF, one per A4 page (or per page of `paper`, its size in points, filled edge to
 * edge); re-built smaller until it fits the limit.
 */
async function makePdf(pages: Page[], rules: FileRules, paper?: { w: number; h: number }[]): Promise<Blob> {
  const { PDFDocument } = await import('pdf-lib');
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
      // One photo decoded at a time: a dozen full-size camera photos at once can run a phone out of memory.
      const src = await decode(page.file);
      const canvas = render(src, page, side);
      if ('close' in src) src.close();
      const jpg = await doc.embedJpg(await (await toBlob(canvas, 'image/jpeg', quality)).arrayBuffer());
      if (paper) {
        const { w, h } = paper[i];
        doc.addPage([w, h]).drawImage(jpg, { x: 0, y: 0, width: w, height: h });
        continue;
      }
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
  const canvas = render(await decode(page.file), { ...page, crop: null, quad: null, clean: false }, maxSide);
  return canvas.toDataURL('image/jpeg', 0.8);
}

/** The page as it will be sent (turned, cropped or straightened, scan look), small, for the thumbnails. */
export async function pagePreview(page: Page, maxSide = 360): Promise<string> {
  return render(await decode(page.file), page, maxSide).toDataURL('image/jpeg', 0.8);
}

/**
 * A PDF the user picked on the phone. Sent as it is when it fits; when only its size is over the limit,
 * it is made smaller here (re-saved, else its pages redrawn as images), keeping every page.
 */
export async function checkPickedPdf(file: File, rules: FileRules, onPage?: (n: number, of: number) => void): Promise<Prepared> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (String.fromCharCode(...bytes.slice(0, 4)) !== '%PDF') {
    return { file, format: 'pdf', pages: 0, problem: 'This is not a PDF file.' };
  }
  // Unreadable structure: count it as one page and let the size check speak.
  const pages = (await pdfPageCount(file)) ?? 1;
  const mime = 'application/pdf';
  const problem = checkFile(rules, { mime, bytes: file.size, pages });
  const asIs: Prepared = { file: new File([bytes], 'upload.pdf', { type: mime }), format: 'pdf', pages, problem };
  const max = rules.max_kb ? rules.max_kb * 1024 : null;
  if (!problem || !max || file.size <= max) return asIs; // fits, or the problem isn't its size
  // Too many pages as well: say that (pages are never dropped). Checked as if the size were at the limit.
  const pageProblem = checkFile(rules, { mime, bytes: max, pages });
  if (pageProblem) return { ...asIs, problem: pageProblem };

  const smaller = (blob: Blob, n: number): Prepared => {
    const left = checkFile(rules, { mime, bytes: blob.size, pages: n });
    return {
      file: new File([blob], 'upload.pdf', { type: mime }),
      format: 'pdf',
      pages: n,
      problem: left && blob.size > max ? `${left} Take photos of the pages instead.` : left,
      shrunkFrom: file.size,
    };
  };
  const { drawPdfPages, resavePdf } = await import('./pdf-shrink');
  const resaved = await resavePdf(bytes);
  if (resaved && resaved.size <= max) return smaller(resaved, pages);
  const drawn = await drawPdfPages(bytes, onPage);
  if (drawn === 'locked') return { ...asIs, problem: PDF_LOCKED };
  if (drawn === 'too_many') return { ...asIs, problem: PDF_TOO_LONG };
  if (drawn === 'unreadable') return { ...asIs, problem: `${problem} Take photos of the pages instead.` };
  const asPages = drawn.images.map((image, i): Page => ({ id: String(i), file: image, rotate: 0, crop: null }));
  return smaller(await makePdf(asPages, rules, drawn.sizes), asPages.length);
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

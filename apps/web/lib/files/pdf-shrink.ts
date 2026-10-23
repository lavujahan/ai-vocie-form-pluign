/// <reference path="./pdfjs-worker.d.ts" />
/**
 * A PDF picked on the phone that is over the field's size limit, made smaller on the phone. First a
 * plain re-save (keeps the text as text; helps with badly saved files), else each page is drawn as an
 * image with pdf.js and `convert.ts` puts the pages back together within the limit. The pages then look
 * the same but their text can't be selected, which upload fields don't need.
 */

/** The most pages redrawn on a phone (memory and time). */
export const MAX_SHRINK_PAGES = 30;
/** Pages are drawn at about 150 dpi, at most 1600 px on the long side. */
const DPI = 150;
const MAX_SIDE = 1600;

export type DrawnPages = { images: Blob[]; sizes: { w: number; h: number }[] };

/** The same PDF, re-saved compactly; null when it can't be re-saved as it is (e.g. it is encrypted). */
export async function resavePdf(data: Uint8Array): Promise<Blob | null> {
  try {
    const { PDFDocument } = await import('pdf-lib');
    const doc = await PDFDocument.load(data, { updateMetadata: false });
    return new Blob([(await doc.save({ useObjectStreams: true })) as BlobPart], { type: 'application/pdf' });
  } catch {
    return null;
  }
}

async function loadPdfjs() {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const g = globalThis as { pdfjsWorker?: unknown };
  // pdf.js runs on the page itself instead of in a worker file: nothing extra to serve, fine for a few pages.
  g.pdfjsWorker ??= await import('pdfjs-dist/legacy/build/pdf.worker.mjs');
  return pdfjs;
}

const toJpeg = (canvas: HTMLCanvasElement) =>
  new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode failed'))), 'image/jpeg', 0.92));

/** Every page drawn as a JPEG, with the page's size in PDF points. */
export async function drawPdfPages(data: Uint8Array, onPage?: (n: number, of: number) => void): Promise<DrawnPages | 'locked' | 'too_many' | 'unreadable'> {
  const pdfjs = await loadPdfjs();
  let doc: Awaited<ReturnType<typeof pdfjs.getDocument>['promise']>;
  try {
    // pdf.js takes over the buffer it is given: pass a copy.
    doc = await pdfjs.getDocument({ data: data.slice(), isEvalSupported: false }).promise;
  } catch (e) {
    return (e as { name?: string }).name === 'PasswordException' ? 'locked' : 'unreadable';
  }
  try {
    if (doc.numPages > MAX_SHRINK_PAGES) return 'too_many';
    const out: DrawnPages = { images: [], sizes: [] };
    for (let n = 1; n <= doc.numPages; n++) {
      onPage?.(n, doc.numPages);
      const page = await doc.getPage(n);
      const size = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: Math.min(DPI / 72, MAX_SIDE / Math.max(size.width, size.height)) });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport }).promise;
      out.images.push(await toJpeg(canvas));
      out.sizes.push({ w: size.width, h: size.height });
      page.cleanup();
      canvas.width = canvas.height = 0; // frees the canvas memory now
    }
    return out;
  } catch {
    return 'unreadable';
  } finally {
    await doc.destroy();
  }
}

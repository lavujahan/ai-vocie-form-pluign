// Exposes the phone's converter to Playwright (it needs a real browser: canvas, image decoding).
import { sanitizeFileRules, type FileRules } from '@vff/shared';
import { checkPickedPdf, pdfPageCount, preparePages, type Page } from '../../web/lib/files/convert';

/** A noisy photo-like image (noise doesn't compress, like a real photo), as a JPEG blob. */
async function photo(w: number, h: number, seed = 1): Promise<Blob> {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(w, h);
  let x = seed;
  for (let i = 0; i < img.data.length; i += 4) {
    x = (x * 1103515245 + 12345) & 0x7fffffff;
    img.data[i] = x & 255;
    img.data[i + 1] = (x >> 8) & 255;
    img.data[i + 2] = (x >> 16) & 255;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  // A solid left half, so a crop / rotation can be checked by colour.
  ctx.fillStyle = '#ff0000';
  ctx.fillRect(0, 0, w / 2, h);
  return new Promise((r) => c.toBlob((b) => r(b!), 'image/jpeg', 0.95));
}

const rules = (r: Partial<FileRules>) =>
  sanitizeFileRules({ kind: 'photo', formats: ['jpg'], max_kb: null, min_kb: null, max_pages: null, width_px: null, height_px: null, note: null, ...r }, null);

async function dims(blob: Blob) {
  const b = await createImageBitmap(blob);
  return { w: b.width, h: b.height };
}

const pdfPages = pdfPageCount;

declare global {
  interface Window {
    convertTests: () => Promise<Record<string, unknown>>;
  }
}

window.convertTests = async () => {
  const big = await photo(3000, 2000);
  const page = (file: Blob, extra: Partial<Page> = {}): Page => ({ id: crypto.randomUUID(), file, rotate: 0, crop: null, ...extra });

  const small = await preparePages([page(big)], rules({ max_kb: 50 }));
  const three = await preparePages([page(big), page(await photo(2000, 3000, 7)), page(await photo(2400, 1800, 9))], rules({ formats: ['jpg', 'pdf'], max_kb: 500 }));
  const rotated = await preparePages([page(await photo(400, 200), { rotate: 90 })], rules({}));
  const cropped = await preparePages([page(await photo(400, 200), { crop: { x: 0, y: 0, w: 0.5, h: 1 } })], rules({}));
  const exact = await preparePages([page(big)], rules({ width_px: 200, height_px: 230, max_kb: 50 }));
  const tooBigPdf = await checkPickedPdf(new File([three.file], 'scan.pdf', { type: 'application/pdf' }), rules({ formats: ['pdf'], max_kb: 100 }));

  return {
    bigBytes: big.size,
    small: { type: small.file.type, bytes: small.file.size, problem: small.problem, ...(await dims(small.file)) },
    three: { type: three.file.type, bytes: three.file.size, pages: await pdfPages(three.file), problem: three.problem },
    rotated: await dims(rotated.file),
    cropped: await dims(cropped.file),
    exact: { ...(await dims(exact.file)), bytes: exact.file.size, problem: exact.problem },
    tooBigPdf: { pages: tooBigPdf.pages, problem: tooBigPdf.problem },
  };
};

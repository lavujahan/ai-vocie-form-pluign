// Exposes the phone's converter to Playwright (it needs a real browser: canvas, image decoding).
import { sanitizeFileRules, type FileRules } from '@vff/shared';
import { checkPickedPdf, detectQuad, pdfPageCount, preparePages, type Page } from '../../web/lib/files/convert';

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
  sanitizeFileRules({ kind: 'photo', formats: ['jpg'], max_kb: null, min_kb: null, max_pages: null, width_px: null, height_px: null, shape: null, note: null, ...r }, null);

async function dims(blob: Blob) {
  const b = await createImageBitmap(blob);
  return { w: b.width, h: b.height };
}

const pdfPages = pdfPageCount;

/** A tilted A4 sheet (sides 1 : 1.41) with writing on a dark, noisy table, lit unevenly (a shadow on the left), as a JPEG. */
const SHEET = [
  { x: 0.3, y: 0.1 },
  { x: 0.68, y: 0.14 },
  { x: 0.645, y: 0.86 },
  { x: 0.265, y: 0.82 },
];
async function documentPhoto(w: number, h: number): Promise<Blob> {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(w, h);
  let seed = 5;
  for (let i = 0; i < img.data.length; i += 4) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    img.data[i] = 70 + (seed % 30);
    img.data[i + 1] = 50 + ((seed >> 5) % 30);
    img.data[i + 2] = 40 + ((seed >> 10) % 30);
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  ctx.save();
  ctx.beginPath();
  SHEET.forEach((p, i) => (i ? ctx.lineTo(p.x * w, p.y * h) : ctx.moveTo(p.x * w, p.y * h)));
  ctx.closePath();
  ctx.clip();
  const light = ctx.createLinearGradient(0, 0, w, 0);
  light.addColorStop(0.25, '#a8a49c');
  light.addColorStop(0.7, '#ecebe6');
  ctx.fillStyle = light;
  ctx.fillRect(0, 0, w, h);
  // Lines of "writing", following the sheet's tilt.
  ctx.translate(SHEET[0].x * w, SHEET[0].y * h);
  ctx.rotate(Math.atan2((SHEET[1].y - SHEET[0].y) * h, (SHEET[1].x - SHEET[0].x) * w));
  ctx.fillStyle = '#222';
  for (let y = 60; y < h * 0.6; y += 34) for (let x = 40; x < w * 0.33; x += 26) ctx.fillRect(x, y, 18, 5);
  ctx.restore();
  return new Promise((r) => c.toBlob((b) => r(b!), 'image/jpeg', 0.92));
}

/** A tiny PDF that needs a password to open (made-up keys), padded to `bytes`. */
function lockedPdf(bytes: number): Blob {
  const id = '<00112233445566778899aabbccddeeff>';
  const key = `<${'ab'.repeat(32)}>`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >>',
    `<< /Filter /Standard /V 1 /R 2 /O ${key} /U ${key.replace(/ab/g, 'cd')} /P -4 >>`,
  ];
  let out = `%PDF-1.4\n%${'x'.repeat(Math.max(0, bytes - 700))}\n`;
  const offsets: number[] = [];
  objects.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 5\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size 5 /Root 1 0 R /Encrypt 4 0 R /ID [${id} ${id}] >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Blob([out], { type: 'application/pdf' });
}

/** Share of near-white pixels in an image. */
async function whiteShare(blob: Blob) {
  const b = await createImageBitmap(blob);
  const c = document.createElement('canvas');
  c.width = b.width;
  c.height = b.height;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(b, 0, 0);
  const { data } = ctx.getImageData(0, 0, b.width, b.height);
  let white = 0;
  for (let i = 0; i < data.length; i += 4) if (data[i] > 240 && data[i + 1] > 240 && data[i + 2] > 240) white++;
  return white / (data.length / 4);
}

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
  // "Photo 3.5 x 4.5 cm, below 50 KB": the stated shape, framed off-centre with the locked crop.
  const passport = await preparePages(
    [page(big, { crop: { x: 0.1, y: 0.05, w: 0.39, h: 0.75 } })],
    rules({ max_kb: 50, shape: { w: 3.5, h: 4.5, unit: 'cm' } }),
  );
  // "Passport size" with no numbers: no shape is assumed.
  const noSize = await preparePages([page(big)], rules({ max_kb: 50, note: 'Passport size' }));
  const asPdf = (b: Blob) => new File([b], 'scan.pdf', { type: 'application/pdf' });
  // A picked PDF over the limit is made smaller, keeping its pages.
  const pages = [];
  for (let i = 0; i < 5; i++) pages.push(page(await photo(2000, 2800, 11 + i)));
  const bigPdf = (await preparePages(pages.slice(0, 3), rules({ formats: ['pdf'] }))).file;
  const seen: number[] = [];
  const shrunk = await checkPickedPdf(asPdf(bigPdf), rules({ formats: ['pdf'], max_kb: 300 }), (n) => seen.push(n));
  const tooBigPdf = await checkPickedPdf(asPdf(three.file), rules({ formats: ['pdf'], max_kb: 100 }));
  // 5 pages for a field that takes 3: said plainly, never cut.
  const fivePdf = (await preparePages(pages, rules({ formats: ['pdf'] }))).file;
  const tooLong = await checkPickedPdf(asPdf(fivePdf), rules({ formats: ['pdf'], max_kb: 300, max_pages: 3 }));
  const locked = await checkPickedPdf(asPdf(lockedPdf(4096)), rules({ formats: ['pdf'], max_kb: 2 }));

  // A document photo: the sheet is found, straightened and given the scan look.
  const docPage = page(await documentPhoto(2000, 1500));
  const quad = await detectQuad(docPage);
  const scanned = await preparePages([{ ...docPage, quad, clean: true }], rules({ kind: 'document', max_kb: 300 }));
  const plain = await preparePages([{ ...docPage, quad }], rules({ kind: 'document', max_kb: 300 }));

  return {
    bigBytes: big.size,
    small: { type: small.file.type, bytes: small.file.size, problem: small.problem, ...(await dims(small.file)) },
    three: { type: three.file.type, bytes: three.file.size, pages: await pdfPages(three.file), problem: three.problem },
    rotated: await dims(rotated.file),
    cropped: await dims(cropped.file),
    exact: { ...(await dims(exact.file)), bytes: exact.file.size, problem: exact.problem },
    tooBigPdf: { pages: tooBigPdf.pages, problem: tooBigPdf.problem, bytes: tooBigPdf.file.size, from: tooBigPdf.shrunkFrom },
    shrunk: { from: bigPdf.size, bytes: shrunk.file.size, pages: await pdfPages(shrunk.file), problem: shrunk.problem, shrunkFrom: shrunk.shrunkFrom, seen },
    tooLong: { problem: tooLong.problem, pages: tooLong.pages },
    locked: { problem: locked.problem },
    scan: {
      quad,
      truth: SHEET,
      ...(await dims(scanned.file)),
      bytes: scanned.file.size,
      problem: scanned.problem,
      white: await whiteShare(scanned.file),
      plainWhite: await whiteShare(plain.file),
    },
    passport: { ...(await dims(passport.file)), bytes: passport.file.size, problem: passport.problem },
    noSize: await dims(noSize.file),
  };
};

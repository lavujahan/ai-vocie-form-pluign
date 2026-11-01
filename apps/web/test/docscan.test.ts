import { describe, expect, it } from 'vitest';
import { cleanScan, findDocument, findOnScanner, homography, project, straightSize, warp, type Pt, type Quad } from '@vff/shared/ui/files/docscan';

/** Inside a convex polygon (corners in order). */
const inside = (q: Pt[], x: number, y: number) => {
  let sign = 0;
  for (let i = 0; i < q.length; i++) {
    const a = q[i];
    const b = q[(i + 1) % q.length];
    const c = Math.sign((b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x));
    if (c && sign && c !== sign) return false;
    if (c) sign = c;
  }
  return true;
};

/** A "photo": a sheet (corners as fractions) with lines of writing, on a noisy table. */
function photo(w: number, h: number, sheet: Quad, { paper = 225, table = 60 } = {}) {
  const data = new Uint8ClampedArray(w * h * 4);
  const px = sheet.map((p) => ({ x: p.x * w, y: p.y * h }));
  let seed = 3;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      const noise = (seed % 31) - 15;
      let v = table + noise;
      if (inside(px, x + 0.5, y + 0.5)) v = y % 14 < 2 && x % 9 < 6 ? 50 : paper + noise / 3; // writing
      const i = (y * w + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = v;
      data[i + 3] = 255;
    }
  return data;
}

const TILTED: Quad = [
  { x: 0.22, y: 0.12 },
  { x: 0.74, y: 0.18 },
  { x: 0.7, y: 0.9 },
  { x: 0.16, y: 0.84 },
];

describe('document scan', () => {
  it('computes the perspective transform that maps the 4 corners exactly', () => {
    const rect = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 140 },
      { x: 0, y: 140 },
    ];
    const q = TILTED.map((p) => ({ x: p.x * 500, y: p.y * 400 }));
    const H = homography(rect, q);
    rect.forEach((p, i) => {
      const r = project(H, p);
      expect(r.x).toBeCloseTo(q[i].x, 6);
      expect(r.y).toBeCloseTo(q[i].y, 6);
    });
  });

  it('finds the corners of a tilted sheet on a dark table', () => {
    const q = findDocument(photo(500, 400, TILTED), 500, 400);
    expect(q).not.toBeNull();
    q!.forEach((p, i) => {
      expect(Math.abs(p.x - TILTED[i].x)).toBeLessThan(0.02);
      expect(Math.abs(p.y - TILTED[i].y)).toBeLessThan(0.02);
    });
  });

  it('gives up (the user sets the corners) on a light table or a sheet filling the photo', () => {
    expect(findDocument(photo(400, 300, TILTED, { paper: 150, table: 135 }), 400, 300)).toBeNull();
    const full: Quad = [
      { x: -0.1, y: -0.1 },
      { x: 1.1, y: -0.1 },
      { x: 1.1, y: 1.1 },
      { x: -0.1, y: 1.1 },
    ];
    expect(findDocument(photo(400, 300, full), 400, 300)).toBeNull();
  });

  it('straightens the sheet: the result is the paper only, in A4 proportions', () => {
    const w = 500;
    const h = 400;
    // An A4 sheet seen at an angle: sides about 1 : 1.41.
    const sheet: Quad = [
      { x: 0.3, y: 0.08 },
      { x: 0.66, y: 0.1 },
      { x: 0.68, y: 0.74 },
      { x: 0.32, y: 0.72 },
    ];
    const data = photo(w, h, sheet);
    const px = sheet.map((p) => ({ x: p.x * w, y: p.y * h })) as Quad;
    // A red table, so any of it left in the result shows.
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (!inside(px, x + 0.5, y + 0.5)) data.set([200, 0, 0], (y * w + x) * 4);
    const size = straightSize(px, 1600);
    expect(size.h / size.w).toBeCloseTo(Math.SQRT2, 2);
    const out = warp({ data, width: w, height: h }, px, size.w, size.h);
    // Every border pixel (2 px in) is paper or writing (grey), never the table.
    let table = 0;
    for (let x = 2; x < size.w - 2; x++) for (const y of [2, size.h - 3]) if (out[(y * size.w + x) * 4] - out[(y * size.w + x) * 4 + 1] > 40) table++;
    for (let y = 2; y < size.h - 2; y++) for (const x of [2, size.w - 3]) if (out[(y * size.w + x) * 4] - out[(y * size.w + x) * 4 + 1] > 40) table++;
    expect(table).toBe(0);
  });

  it('scan look: the paper turns white under uneven light, writing and a photo stay dark', () => {
    const w = 400;
    const h = 300;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const light = 0.55 + 0.4 * (x / w); // a shadow on the left
        let v = 230;
        if (y % 20 < 3 && x % 10 < 7) v = 40; // writing
        if (x > 250 && x < 330 && y > 60 && y < 160) v = 70; // a passport photo on the page
        const i = (y * w + x) * 4;
        data[i] = data[i + 1] = data[i + 2] = v * light;
        data[i + 3] = 255;
      }
    cleanScan(data, w, h);
    const at = (x: number, y: number) => data[(y * w + x) * 4];
    expect(at(10, 10)).toBeGreaterThanOrEqual(245); // paper in the shadow
    expect(at(390, 10)).toBeGreaterThanOrEqual(245); // paper in the light
    expect(at(12, 21)).toBeLessThan(90); // writing in the shadow
    expect(at(290, 110)).toBeLessThan(140); // the photo isn't washed out
  });
});

describe('findOnScanner', () => {
  /** A white lid (slight noise) with `draw` on top. */
  function scan(w: number, h: number, draw: (x: number, y: number) => number | null) {
    const data = new Uint8ClampedArray(w * h * 4);
    let seed = 7;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        const v = draw(x, y) ?? 246 + (seed % 7) - 3;
        const i = (y * w + x) * 4;
        data[i] = data[i + 1] = data[i + 2] = v;
        data[i + 3] = 255;
      }
    return data;
  }
  /** Inside the card (near-white, as bright as the lid), its outline and printed lines: the only things that show. */
  const tiltedCard = (w: number, h: number, q: Quad) => {
    const px = q.map((p) => ({ x: p.x * w, y: p.y * h }));
    return scan(w, h, (x, y) => {
      if (!inside(px, x + 0.5, y + 0.5)) return null;
      const near = [-3, 3].some((d) => !inside(px, x + d, y) || !inside(px, x, y + d));
      if (near) return 170;
      return y % 12 < 3 ? 60 : 244;
    });
  };
  const close = (a: Quad, b: Quad, tol: number) => a.forEach((p, i) => (expect(p.x).toBeCloseTo(b[i].x, tol), expect(p.y).toBeCloseTo(b[i].y, tol)));

  it('finds a tilted white card on the white lid, corners in order', () => {
    const q: Quad = [
      { x: 0.1, y: 0.16 },
      { x: 0.7, y: 0.1 },
      { x: 0.73, y: 0.36 },
      { x: 0.13, y: 0.42 },
    ];
    const found = findOnScanner(tiltedCard(600, 700, q), 600, 700)!;
    expect(found).not.toBeNull();
    close(found, q, 1);
    expect(found[0].x).toBeLessThan(found[1].x);
    expect(found[0].y).toBeLessThan(found[3].y);
  });

  it('keeps the card when a speck of dust is elsewhere on the lid', () => {
    const q: Quad = [
      { x: 0.2, y: 0.5 },
      { x: 0.8, y: 0.5 },
      { x: 0.8, y: 0.75 },
      { x: 0.2, y: 0.75 },
    ];
    const data = tiltedCard(600, 700, q);
    for (const c of [0, 1, 2]) data[(40 * 600 + 40) * 4 + c] = 0;
    close(findOnScanner(data, 600, 700)!, q, 1);
  });

  it('leaves a full page alone: text across the sheet is not a card', () => {
    const page = scan(600, 840, (x, y) => (x > 50 && x < 550 && y > 60 && y < 780 && y % 16 < 3 ? 40 : null));
    expect(findOnScanner(page, 600, 840)).toBeNull();
  });

  it('returns null for a blank scan', () => {
    expect(findOnScanner(scan(600, 840, () => null), 600, 840)).toBeNull();
  });

  it('boxes a signature, upright and with a margin, joining its strokes', () => {
    const sign = scan(600, 840, (x, y) => {
      const stroke = (x > 200 && x < 300 && Math.abs(y - 400 - (x - 200) / 5) < 2) || (x > 310 && x < 400 && Math.abs(y - 420 + (x - 310) / 6) < 2);
      return stroke ? 30 : null;
    });
    const q = findOnScanner(sign, 600, 840, { ink: true })!;
    expect(q[0].x).toBeLessThan(200 / 600);
    expect(q[1].x).toBeGreaterThan(400 / 600);
    expect(q[0].y).toBe(q[1].y);
    expect(q[0].x).toBe(q[3].x);
    expect(q[2].y - q[0].y).toBeLessThan(0.1);
  });

  it('returns null for a blank signature page', () => {
    expect(findOnScanner(scan(400, 300, () => null), 400, 300, { ink: true })).toBeNull();
  });
});

/**
 * Scanner-style handling of a document photo (on the phone) or a real scan (in the extension): find the
 * sheet of paper, straighten it (perspective correction from its 4 corners) and make the paper white.
 * Pure functions on pixel arrays, no DOM, so they can be tested; `convert.ts` does the canvas work around them.
 */

export type Pt = { x: number; y: number };
/** Corners of the document: top-left, top-right, bottom-right, bottom-left. */
export type Quad = [Pt, Pt, Pt, Pt];

type Pixels = ArrayLike<number>;
const SIDES = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
] as const;

/** Luminance (0–255) of RGBA pixels. */
export function grayOf(rgba: Pixels, w: number, h: number): Uint8Array {
  const g = new Uint8Array(w * h);
  for (let i = 0, j = 0; i < g.length; i++, j += 4) g[i] = (rgba[j] * 77 + rgba[j + 1] * 150 + rgba[j + 2] * 29) >> 8;
  return g;
}

/** Box blur of radius r (horizontal then vertical running sums). */
function blur(src: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const tmp = new Uint8Array(src.length);
  const out = new Uint8Array(src.length);
  const n = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let sum = 0;
    for (let x = -r; x <= r; x++) sum += src[row + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) {
      tmp[row + x] = sum / n;
      sum += src[row + Math.min(w - 1, x + r + 1)] - src[row + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < w; x++) {
    let sum = 0;
    for (let y = -r; y <= r; y++) sum += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = sum / n;
      sum += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
    }
  }
  return out;
}

/** Otsu's threshold: the grey level that best splits the picture into dark and bright. */
export function otsu(g: Uint8Array): number {
  const hist = new Float64Array(256);
  for (let i = 0; i < g.length; i++) hist[g[i]]++;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0;
  let wB = 0;
  let best = -1;
  let t = 128;
  for (let i = 0; i < 256; i++) {
    wB += hist[i];
    if (!wB) continue;
    const wF = g.length - wB;
    if (!wF) break;
    sumB += i * hist[i];
    const between = wB * wF * (sumB / wB - (sum - sumB) / wF) ** 2;
    if (between > best) {
      best = between;
      t = i;
    }
  }
  return t;
}

const cross = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
export const quadArea = (q: Quad) => Math.abs(q.reduce((s, p, i) => s + p.x * q[(i + 1) % 4].y - q[(i + 1) % 4].x * p.y, 0)) / 2;
/** True when the corners go round in one direction with no inward corner. */
export const isConvex = (q: Quad) => {
  const s = q.map((_, i) => Math.sign(cross(q[i], q[(i + 1) % 4], q[(i + 2) % 4])));
  return s.every((v) => v === s[0] && v !== 0);
};

/**
 * Finds the sheet of paper in a (small, ~500 px) photo: the largest bright area against a darker
 * table, and its four corners. Returns the corners as fractions of the photo, or null when no clear
 * sheet is visible (light table, paper filling the whole photo, odd shape): the user then sets them.
 */
export function findDocument(rgba: Pixels, w: number, h: number): Quad | null {
  const g = blur(grayOf(rgba, w, h), w, h, 2);
  const t = otsu(g);
  const seen = new Uint8Array(w * h);
  const stack = new Int32Array(w * h);
  let best = { count: 0, sum: 0, q: null as Quad | null };
  let total = 0;
  for (let i = 0; i < g.length; i++) total += g[i];

  for (let start = 0; start < g.length; start++) {
    if (seen[start] || g[start] <= t) continue;
    // Flood-fill one bright area, keeping its extreme points (the corners of a sheet tilted < 45°).
    let top = 0;
    const push = (j: number) => {
      if (seen[j] || g[j] <= t) return;
      seen[j] = 1;
      stack[top++] = j;
    };
    push(start);
    let count = 0;
    let sum = 0;
    const ext = { minS: Infinity, maxS: -Infinity, minD: Infinity, maxD: -Infinity, tl: 0, br: 0, tr: 0, bl: 0 };
    while (top) {
      const i = stack[--top];
      const x = i % w;
      const y = (i - x) / w;
      count++;
      sum += g[i];
      const s = x + y;
      const d = x - y;
      if (s < ext.minS) [ext.minS, ext.tl] = [s, i];
      if (s > ext.maxS) [ext.maxS, ext.br] = [s, i];
      if (d > ext.maxD) [ext.maxD, ext.tr] = [d, i];
      if (d < ext.minD) [ext.minD, ext.bl] = [d, i];
      if (x > 0) push(i - 1);
      if (x < w - 1) push(i + 1);
      if (y > 0) push(i - w);
      if (y < h - 1) push(i + w);
    }
    if (count > best.count) {
      const pt = (i: number): Pt => ({ x: ((i % w) + 0.5) / w, y: (Math.floor(i / w) + 0.5) / h });
      best = { count, sum, q: [pt(ext.tl), pt(ext.tr), pt(ext.br), pt(ext.bl)] };
    }
  }

  const { q, count, sum } = best;
  const n = w * h;
  if (!q || count < n * 0.1 || count > n * 0.97) return null;
  // The paper must be clearly brighter than what is around it.
  if (sum / count - (total - sum) / (n - count) < 25) return null;
  if (!isConvex(q)) return null;
  // The bright area must fill its corners' outline (a sheet, not a blob); text holes are allowed.
  const fill = count / (quadArea(q) * n);
  if (fill < 0.6 || fill > 1.1) return null;
  return q;
}

/** Sets every pixel within `r` of a set pixel (a square, rows then columns). */
function dilate(mask: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const sweep = (src: Uint8Array, count: number, length: number, at: (line: number, i: number) => number) => {
    const out = new Uint8Array(src.length);
    for (let line = 0; line < count; line++) {
      for (const [from, to, step] of [
        [0, length, 1],
        [length - 1, -1, -1],
      ]) {
        let gap = Infinity;
        for (let i = from; i !== to; i += step) {
          const j = at(line, i);
          gap = src[j] ? 0 : gap + 1;
          if (gap <= r) out[j] = 1;
        }
      }
    }
    return out;
  };
  return sweep(
    sweep(mask, h, w, (y, x) => y * w + x),
    w,
    h,
    (x, y) => y * w + x,
  );
}

/** Convex hull of points sorted by y then x (Andrew's monotone chain). */
function hullOf(points: Pt[]): Pt[] {
  const half = (list: Pt[]) => {
    const out: Pt[] = [];
    for (const p of list) {
      while (out.length > 1 && cross(out[out.length - 2], out[out.length - 1], p) <= 0) out.pop();
      out.push(p);
    }
    out.pop();
    return out;
  };
  return points.length < 3 ? points : [...half(points), ...half([...points].reverse())];
}

/** The smallest rectangle around a hull: one of its sides always lies along a hull edge. Corners clockwise on screen. */
function smallestRect(hull: Pt[]): { corners: Pt[]; area: number } | null {
  let best: { corners: Pt[]; area: number } | null = null;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i];
    const b = hull[(i + 1) % hull.length];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (!len) continue;
    const u = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
    const v = { x: -u.y, y: u.x };
    let [minU, maxU, minV, maxV] = [Infinity, -Infinity, Infinity, -Infinity];
    for (const p of hull) {
      const du = p.x * u.x + p.y * u.y;
      const dv = p.x * v.x + p.y * v.y;
      minU = Math.min(minU, du);
      maxU = Math.max(maxU, du);
      minV = Math.min(minV, dv);
      maxV = Math.max(maxV, dv);
    }
    const area = (maxU - minU) * (maxV - minV);
    if (best && area >= best.area) continue;
    const at = (du: number, dv: number): Pt => ({ x: u.x * du + v.x * dv, y: u.y * du + v.y * dv });
    best = { area, corners: [at(minU, minV), at(maxU, minV), at(maxU, maxV), at(minU, maxV)] };
  }
  return best;
}

const medianOf = (list: number[]) => [...list].sort((a, b) => a - b)[list.length >> 1] ?? 255;

/** How far from the lid's colour a pixel must be to count as part of the document. */
const LID_DIFF = 24;
/** Larger than this, the scan is a full page and there is nothing to cut out (ID cards are about 8% of A4). */
const MAX_ON_LID = 0.45;

/**
 * Finds a card, photo or small paper lying on a scanner, in a (small, ~600 px) scan. `findDocument` needs
 * paper brighter than a dark table; here the lid is as white as the paper, so the document shows only as
 * what differs from the lid: its edge shadow and what is printed on it. Returns the corners of the
 * smallest (possibly tilted) rectangle around the largest such area, or null for a blank or full-page
 * scan. With `ink`, returns an upright box around a signature, with a margin.
 */
export function findOnScanner(rgba: Pixels, w: number, h: number, { ink = false } = {}): Quad | null {
  // Scanners often leave a dark line along the very edge: it is neither the lid nor the document.
  const edge = Math.max(2, Math.round(Math.min(w, h) * 0.01));
  const lid = [0, 1, 2].map((c) => {
    const ring: number[] = [];
    for (let x = edge; x < w - edge; x += 3) ring.push(rgba[(edge * w + x) * 4 + c], rgba[((h - 1 - edge) * w + x) * 4 + c]);
    for (let y = edge; y < h - edge; y += 3) ring.push(rgba[(y * w + edge) * 4 + c], rgba[(y * w + w - 1 - edge) * 4 + c]);
    return medianOf(ring);
  });
  const mask = new Uint8Array(w * h);
  for (let y = edge; y < h - edge; y++)
    for (let x = edge; x < w - edge; x++) {
      const i = (y * w + x) * 4;
      const diff = Math.max(Math.abs(rgba[i] - lid[0]), Math.abs(rgba[i + 1] - lid[1]), Math.abs(rgba[i + 2] - lid[2]));
      if (diff > LID_DIFF) mask[y * w + x] = 1;
    }

  // Join what belongs together: the lines of a card, the strokes of a signature.
  const joined = dilate(mask, w, h, Math.max(2, Math.round(Math.max(w, h) / (ink ? 30 : 80))));
  const area = new Int32Array(w * h);
  const stack = new Int32Array(w * h);
  let next = 0;
  let largest = 0;
  let most = 0;
  for (let start = 0; start < joined.length; start++) {
    if (!joined[start] || area[start]) continue;
    next++;
    let top = 0;
    let count = 0;
    stack[top++] = start;
    area[start] = next;
    while (top) {
      const i = stack[--top];
      count += mask[i];
      const x = i % w;
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) {
        if (j < 0 || j >= joined.length || !joined[j] || area[j]) continue;
        area[j] = next;
        stack[top++] = j;
      }
    }
    if (count > most) [most, largest] = [count, next];
  }
  if (most < w * h * 0.0005) return null; // blank, or a few specks

  // The outermost pixels of each row are enough for the outline.
  const points: Pt[] = [];
  for (let y = 0; y < h; y++) {
    let first = -1;
    let last = -1;
    for (let x = 0; x < w; x++) {
      if (!mask[y * w + x] || area[y * w + x] !== largest) continue;
      if (first < 0) first = x;
      last = x;
    }
    if (first < 0) continue;
    points.push({ x: first + 0.5, y: y + 0.5 });
    if (last !== first) points.push({ x: last + 0.5, y: y + 0.5 });
  }
  const frac = (p: Pt): Pt => ({ x: Math.min(1, Math.max(0, p.x / w)), y: Math.min(1, Math.max(0, p.y / h)) });

  if (ink) {
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const pad = Math.max(x1 - x0, y1 - y0) * 0.06;
    return [frac({ x: x0 - pad, y: y0 - pad }), frac({ x: x1 + pad, y: y0 - pad }), frac({ x: x1 + pad, y: y1 + pad }), frac({ x: x0 - pad, y: y1 + pad })];
  }

  const rect = smallestRect(hullOf(points));
  if (!rect || rect.area > w * h * MAX_ON_LID || rect.area < w * h * 0.01) return null;
  // Start at the top-left corner; the corners stay clockwise.
  const start = rect.corners.reduce((b, p, i) => (p.x + p.y < rect.corners[b].x + rect.corners[b].y ? i : b), 0);
  return [0, 1, 2, 3].map((i) => frac(rect.corners[(start + i) % 4])) as Quad;
}

/** The 3×3 perspective transform (9 numbers, row by row) taking the points `from` to `to`. */
export function homography(from: Pt[], to: Pt[]): number[] {
  // 8 equations, 8 unknowns (h8 = 1), solved by Gaussian elimination with partial pivoting.
  const a: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const { x: u, y: v } = from[i];
    const { x, y } = to[i];
    a.push([u, v, 1, 0, 0, 0, -u * x, -v * x, x]);
    a.push([0, 0, 0, u, v, 1, -u * y, -v * y, y]);
  }
  for (let c = 0; c < 8; c++) {
    let p = c;
    for (let r = c + 1; r < 8; r++) if (Math.abs(a[r][c]) > Math.abs(a[p][c])) p = r;
    [a[c], a[p]] = [a[p], a[c]];
    for (let r = 0; r < 8; r++) {
      if (r === c || !a[c][c]) continue;
      const f = a[r][c] / a[c][c];
      for (let k = c; k < 9; k++) a[r][k] -= f * a[c][k];
    }
  }
  return [...a.map((row, i) => row[8] / row[i]), 1];
}

export function project(H: number[], p: Pt): Pt {
  const d = H[6] * p.x + H[7] * p.y + H[8];
  return { x: (H[0] * p.x + H[1] * p.y + H[2]) / d, y: (H[3] * p.x + H[4] * p.y + H[5]) / d };
}

/** Paper shapes (long / short side) the straightened page snaps to: A4, ID card, US Letter. */
const PAPER = [Math.SQRT2, 85.6 / 53.98, 11 / 8.5];

/**
 * Size of the straightened page (corners in pixels): its side lengths, snapped to A4 / ID card / Letter
 * proportions when within 3%, at most `maxSide` on the long side.
 */
export function straightSize(q: Quad, maxSide: number): { w: number; h: number } {
  const d = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
  let w = Math.max(d(q[0], q[1]), d(q[3], q[2]));
  let h = Math.max(d(q[0], q[3]), d(q[1], q[2]));
  const long = Math.max(w, h);
  const r = long / Math.min(w, h);
  const snap = PAPER.find((p) => Math.abs(r / p - 1) < 0.03);
  if (snap) {
    if (w >= h) h = long / snap;
    else w = long / snap;
  }
  const k = Math.min(1, maxSide / long);
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}

/**
 * Straightens the document: each pixel of the `outW`×`outH` result is read (bilinear) from the photo
 * inside the corners `q` (in photo pixels). Returns RGBA pixels.
 */
export function warp(src: { data: Pixels; width: number; height: number }, q: Quad, outW: number, outH: number): Uint8ClampedArray<ArrayBuffer> {
  const H = homography(
    [
      { x: 0, y: 0 },
      { x: outW, y: 0 },
      { x: outW, y: outH },
      { x: 0, y: outH },
    ],
    q,
  );
  const { data, width: sw, height: sh } = src;
  const out = new Uint8ClampedArray(outW * outH * 4);
  let o = 0;
  for (let v = 0; v < outH; v++) {
    for (let u = 0; u < outW; u++, o += 4) {
      const p = project(H, { x: u + 0.5, y: v + 0.5 });
      const x = Math.min(sw - 1, Math.max(0, p.x - 0.5));
      const y = Math.min(sh - 1, Math.max(0, p.y - 0.5));
      const x0 = Math.floor(x);
      const y0 = Math.floor(y);
      const x1 = Math.min(sw - 1, x0 + 1);
      const y1 = Math.min(sh - 1, y0 + 1);
      const fx = x - x0;
      const fy = y - y0;
      const i00 = (y0 * sw + x0) * 4;
      const i10 = (y0 * sw + x1) * 4;
      const i01 = (y1 * sw + x0) * 4;
      const i11 = (y1 * sw + x1) * 4;
      for (let c = 0; c < 3; c++) {
        const top = data[i00 + c] + (data[i10 + c] - data[i00 + c]) * fx;
        const bottom = data[i01 + c] + (data[i11 + c] - data[i01 + c]) * fx;
        out[o + c] = top + (bottom - top) * fy;
      }
      out[o + 3] = 255;
    }
  }
  return out;
}

/**
 * "Scan look", in place: evens out the light (shadows, a darker corner) so the paper turns white, and
 * makes the writing darker. Colours are kept (stamps, signatures, photos). The light is estimated per
 * block from its brightest pixels; blocks much darker than the paper around them (a photo, a big stamp)
 * take their neighbours' light instead, so they are not washed out.
 */
export function cleanScan(rgba: Uint8ClampedArray, w: number, h: number): void {
  const g = grayOf(rgba, w, h);
  const B = Math.max(8, Math.round(Math.max(w, h) / 40));
  const gw = Math.ceil(w / B);
  const gh = Math.ceil(h / B);
  let light = new Float32Array(gw * gh);
  for (let by = 0; by < gh; by++) {
    for (let bx = 0; bx < gw; bx++) {
      // Brightest of the block, ignoring the very brightest few pixels (a reflection).
      const hist = new Uint32Array(256);
      let n = 0;
      for (let y = by * B; y < Math.min(h, (by + 1) * B); y++)
        for (let x = bx * B; x < Math.min(w, (bx + 1) * B); x++, n++) hist[g[y * w + x]]++;
      let left = Math.max(1, Math.round(n * 0.02));
      let v = 255;
      while (v > 0 && (left -= hist[v]) > 0) v--;
      light[by * gw + bx] = v;
    }
  }
  // Blocks far darker than the typical paper are content, not shadow: fill them from their neighbours.
  const sorted = [...light].sort((a, b) => a - b);
  const paper = sorted[Math.floor(sorted.length * 0.75)];
  const ok = light.map((v) => (v >= paper * 0.65 ? 1 : 0));
  for (let pass = 0; pass < Math.max(gw, gh) && ok.some((v) => !v); pass++) {
    const next = light.slice();
    const nextOk = ok.slice();
    for (let i = 0; i < light.length; i++) {
      if (ok[i]) continue;
      const x = i % gw;
      const y = (i - x) / gw;
      let s = 0;
      let c = 0;
      for (const [dx, dy] of SIDES) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= gw || ny >= gh || !ok[ny * gw + nx]) continue;
        s += light[ny * gw + nx];
        c++;
      }
      if (!c) continue;
      next[i] = s / c;
      nextOk[i] = 1;
    }
    light = next;
    ok.set(nextOk);
  }
  // Smooth the light map (3×3 average, twice) so block edges don't show.
  for (let pass = 0; pass < 2; pass++) {
    const next = new Float32Array(light.length);
    for (let y = 0; y < gh; y++)
      for (let x = 0; x < gw; x++) {
        let s = 0;
        let c = 0;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
            s += light[ny * gw + nx];
            c++;
          }
        next[y * gw + x] = s / c;
      }
    light = next;
  }

  // Divide by the light (bilinear between block centres), then stretch: near-white → white.
  const BLACK = 30;
  const WHITE = 225;
  const lut = new Uint8ClampedArray(256 * 4);
  for (let i = 0; i < lut.length; i++) lut[i] = ((i / 2 - BLACK) * 255) / (WHITE - BLACK);
  for (let y = 0; y < h; y++) {
    const gy = Math.min(gh - 1, Math.max(0, (y + 0.5) / B - 0.5));
    const y0 = Math.floor(gy);
    const y1 = Math.min(gh - 1, y0 + 1);
    const fy = gy - y0;
    for (let x = 0; x < w; x++) {
      const gx = Math.min(gw - 1, Math.max(0, (x + 0.5) / B - 0.5));
      const x0 = Math.floor(gx);
      const x1 = Math.min(gw - 1, x0 + 1);
      const fx = gx - x0;
      const top = light[y0 * gw + x0] + (light[y0 * gw + x1] - light[y0 * gw + x0]) * fx;
      const bottom = light[y1 * gw + x0] + (light[y1 * gw + x1] - light[y1 * gw + x0]) * fx;
      // Never brighten more than 3×, so a very dark photo isn't blown out.
      const gain = Math.min(3, 255 / Math.max(1, top + (bottom - top) * fy));
      const i = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) rgba[i + c] = lut[Math.min(lut.length - 1, Math.round(rgba[i + c] * gain * 2))];
    }
  }
}

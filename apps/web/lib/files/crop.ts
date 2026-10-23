/**
 * The crop frame on the phone, as fractions of the (rotated) photo. When the page states a photo size,
 * the frame keeps that shape: `ratio` = width / height of the result, `imgRatio` = width / height of
 * the photo, so in fractions the frame's height is its width × imgRatio / ratio.
 */

import { isConvex, quadArea, type Quad } from './docscan';

export type { Quad };

export type Box = { x: number; y: number; w: number; h: number };

const MIN = 0.08;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** The starting frame: centred, as large as fits within `fill` of the photo, in the stated shape. */
export function fitBox(ratio: number | null, imgRatio: number, fill = 0.85): Box {
  if (!ratio) return { x: 0.05, y: 0.05, w: 0.9, h: 0.9 };
  let w = fill;
  let h = (w * imgRatio) / ratio;
  if (h > fill) {
    h = fill;
    w = (h * ratio) / imgRatio;
  }
  return { x: (1 - w) / 2, y: (1 - h) / 2, w, h };
}

/** True when a saved frame already has the stated shape (else it is re-fitted). */
export function hasShape(box: Box, ratio: number, imgRatio: number): boolean {
  return Math.abs((box.w / box.h) * imgRatio - ratio) / ratio < 0.02;
}

/** Drags one corner to (fx, fy); the opposite corner stays put. With a ratio, the shape is kept. */
export function resizeBox(b: Box, corner: 'tl' | 'br', fx: number, fy: number, ratio: number | null, imgRatio: number): Box {
  if (!ratio) {
    if (corner === 'tl') {
      const x = Math.min(fx, b.x + b.w - MIN);
      const y = Math.min(fy, b.y + b.h - MIN);
      return { x, y, w: b.x + b.w - x, h: b.y + b.h - y };
    }
    return { ...b, w: Math.max(MIN, fx - b.x), h: Math.max(MIN, fy - b.y) };
  }
  const k = imgRatio / ratio; // height fraction per width fraction
  if (corner === 'br') {
    const w = clamp(Math.max(fx - b.x, (fy - b.y) / k), MIN, Math.min(1 - b.x, (1 - b.y) / k));
    return { ...b, w, h: w * k };
  }
  const x2 = b.x + b.w;
  const y2 = b.y + b.h;
  const w = clamp(Math.max(x2 - fx, (y2 - fy) / k), MIN, Math.min(x2, y2 / k));
  return { x: x2 - w, y: y2 - w * k, w, h: w * k };
}

/** Moves the whole frame (to put the face in it), staying inside the photo. */
export function moveBox(b: Box, dx: number, dy: number): Box {
  return { ...b, x: clamp(b.x + dx, 0, 1 - b.w), y: clamp(b.y + dy, 0, 1 - b.h) };
}

// Document corners (top-left, top-right, bottom-right, bottom-left), as fractions of the photo.

/** Starting corners when the sheet wasn't found: just inside the photo's edges. */
export const insetQuad = (m = 0.04): Quad => [
  { x: m, y: m },
  { x: 1 - m, y: m },
  { x: 1 - m, y: 1 - m },
  { x: m, y: 1 - m },
];

/** Drags one corner, inside the photo; it can't cross the other corners (the outline stays a 4-sided shape). */
export function moveCorner(q: Quad, i: number, fx: number, fy: number): Quad {
  const p = { x: clamp(fx, 0, 1), y: clamp(fy, 0, 1) };
  const next = q.map((c, j) => (j === i ? p : c)) as Quad;
  return isConvex(next) && quadArea(next) > MIN * MIN ? next : q;
}

/** The corners after the photo is turned 90° clockwise (a point x, y moves to 1 − y, x). */
export function rotateQuad(q: Quad): Quad {
  const turn = (p: { x: number; y: number }) => ({ x: 1 - p.y, y: p.x });
  // The old bottom-left corner is now at the top-left.
  return [turn(q[3]), turn(q[0]), turn(q[1]), turn(q[2])];
}

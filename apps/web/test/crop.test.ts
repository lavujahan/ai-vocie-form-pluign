import { describe, expect, it } from 'vitest';
import { fitBox, hasShape, insetQuad, moveBox, moveCorner, resizeBox, rotateQuad } from '@/lib/files/crop';

const PASSPORT = 3.5 / 4.5; // the page asked for 3.5 × 4.5 cm
const PHOTO = 4 / 3; // a landscape phone photo
/** Width / height of the frame in real pixels of the photo. */
const shapeOf = (b: { w: number; h: number }) => (b.w / b.h) * PHOTO;

describe('crop frame with the size the page asks for', () => {
  it('starts centred, inside the photo, in the stated shape', () => {
    const b = fitBox(PASSPORT, PHOTO);
    expect(shapeOf(b)).toBeCloseTo(PASSPORT);
    expect(b.x + b.w / 2).toBeCloseTo(0.5);
    expect(b.y + b.h / 2).toBeCloseTo(0.5);
    expect(b.h).toBeLessThanOrEqual(0.85 + 1e-9);
    expect(hasShape(b, PASSPORT, PHOTO)).toBe(true);
    expect(hasShape({ x: 0, y: 0, w: 0.9, h: 0.9 }, PASSPORT, PHOTO)).toBe(false);
  });

  it('keeps the shape while resizing from either corner, and stays inside the photo', () => {
    const b = fitBox(PASSPORT, PHOTO);
    const bigger = resizeBox(b, 'br', 0.99, 0.99, PASSPORT, PHOTO);
    expect(shapeOf(bigger)).toBeCloseTo(PASSPORT);
    expect(bigger.y + bigger.h).toBeLessThanOrEqual(1 + 1e-9);
    expect(bigger.x + bigger.w).toBeLessThanOrEqual(1 + 1e-9);
    const fromTop = resizeBox(b, 'tl', 0.4, 0.3, PASSPORT, PHOTO);
    expect(shapeOf(fromTop)).toBeCloseTo(PASSPORT);
    // The opposite corner stays where it was.
    expect(fromTop.x + fromTop.w).toBeCloseTo(b.x + b.w);
    expect(fromTop.y + fromTop.h).toBeCloseTo(b.y + b.h);
  });

  it('moves the whole frame without leaving the photo; no stated size means a free frame', () => {
    const b = fitBox(PASSPORT, PHOTO);
    const moved = moveBox(b, 1, -1);
    expect(moved.x).toBeCloseTo(1 - b.w);
    expect(moved.y).toBe(0);
    expect(moved.w).toBe(b.w);
    const free = resizeBox({ x: 0.1, y: 0.1, w: 0.5, h: 0.5 }, 'br', 0.9, 0.3, null, PHOTO);
    expect(free).toMatchObject({ w: 0.8, h: expect.closeTo(0.2) });
  });
});

describe('document corners', () => {
  it('moves one corner inside the photo, but never so the outline folds over', () => {
    const q = insetQuad();
    const moved = moveCorner(q, 0, -0.5, 0.2);
    expect(moved[0]).toEqual({ x: 0, y: 0.2 });
    expect(moved.slice(1)).toEqual(q.slice(1));
    // Dragging the top-left corner past the bottom-right one is ignored.
    expect(moveCorner(q, 0, 0.99, 0.99)).toBe(q);
  });

  it('turns the corners with the photo, keeping top-left first', () => {
    const q = moveCorner(insetQuad(), 0, 0.2, 0.1); // top-left at (0.2, 0.1)
    const turned = rotateQuad(q);
    // Turned clockwise, the old bottom-left (0.04, 0.96) is the new top-left (0.04, 0.04).
    expect(turned[0].x).toBeCloseTo(0.04);
    expect(turned[0].y).toBeCloseTo(0.04);
    // The old top-left moves to the top-right side: (1 − 0.1, 0.2).
    expect(turned[1].x).toBeCloseTo(0.9);
    expect(turned[1].y).toBeCloseTo(0.2);
    // Four turns bring it back.
    const back = rotateQuad(rotateQuad(rotateQuad(turned)));
    back.forEach((p, i) => (expect(p.x).toBeCloseTo(q[i].x), expect(p.y).toBeCloseTo(q[i].y)));
  });
});

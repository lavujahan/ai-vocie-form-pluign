import { describe, expect, it } from 'vitest';
import type { TamilPadPiece } from '@vff/shared';
import { appendText, applyPieces, clearedMarks } from '../src/background/tamil-pad';

const piece = (seq: number, text: string, deleted = false): TamilPadPiece => ({ seq, text, deleted, updated_at: '2026-11-06T10:00:00Z' });

const S1 = 'என் பெயர் லட்சுமி.';
const S2 = 'ஊர் சேலம்.';
const S3 = 'பட்டா மாற்றம் வேண்டும்.';

describe('applyPieces', () => {
  it('adds new sentences at the end, in spoken order', () => {
    const out = applyPieces('', {}, [piece(2, S2), piece(1, S1)]);
    expect(out.text).toBe(`${S1} ${S2}`);
    expect(out.marks).toEqual({ 1: S1, 2: S2 });
    expect(out.note).toBeNull();
  });

  it('keeps what the operator typed before the phone spoke', () => {
    expect(applyPieces('Note:', {}, [piece(1, S1)]).text).toBe(`Note: ${S1}`);
  });

  it('applies the same sentence once', () => {
    const first = applyPieces('', {}, [piece(1, S1)]);
    expect(applyPieces(first.text, first.marks, [piece(1, S1)]).text).toBe(S1);
  });

  it('replaces an edited sentence where it is, with a note', () => {
    const a = applyPieces('', {}, [piece(1, S1), piece(2, S2), piece(3, S3)]);
    const out = applyPieces(a.text, a.marks, [piece(2, 'ஊர் ஓமலூர்.')]);
    expect(out.text).toBe(`${S1} ஊர் ஓமலூர். ${S3}`);
    expect(out.marks[2]).toBe('ஊர் ஓமலூர்.');
    expect(out.note).toMatch(/^Changed on the phone/);
  });

  it('removes a deleted sentence and closes the gap', () => {
    const a = applyPieces('', {}, [piece(1, S1), piece(2, S2), piece(3, S3)]);
    const out = applyPieces(a.text, a.marks, [piece(2, S2, true)]);
    expect(out.text).toBe(`${S1} ${S3}`);
    expect(out.marks[2]).toBeNull();
    expect(out.note).toMatch(/^Deleted on the phone/);
  });

  it('keeps a line break when the deleted sentence was at its end', () => {
    const a = applyPieces('', {}, [piece(1, S1)]);
    const typed = `${a.text}\n${S2}`;
    const b = applyPieces(typed, a.marks, [piece(2, S3)]);
    expect(applyPieces(b.text, b.marks, [piece(2, S3, true)]).text).toBe(`${S1}\n${S2}`);
  });

  it('adds the phone’s edit at the end when the operator already changed that sentence', () => {
    const a = applyPieces('', {}, [piece(1, S1), piece(2, S2)]);
    const edited = a.text.replace('சேலம்', 'Salem');
    const out = applyPieces(edited, a.marks, [piece(2, 'ஊர் ஓமலூர்.')]);
    expect(out.text).toBe(`${S1} ஊர் Salem. ஊர் ஓமலூர்.`);
    expect(out.note).toMatch(/at the end/);
  });

  it('leaves the operator’s version when the phone deletes a sentence changed here', () => {
    const a = applyPieces('', {}, [piece(1, S1)]);
    const out = applyPieces('my own words', a.marks, [piece(1, S1, true)]);
    expect(out.text).toBe('my own words');
    expect(out.note).toMatch(/stays/);
  });

  it('grows a long recording in place, without a note', () => {
    const a = applyPieces(`x ${'y'}`, {}, [piece(1, S1)]);
    const out = applyPieces(`${a.text} after`, a.marks, [piece(1, `${S1} ${S2}`)]);
    expect(out.text).toBe(`x y ${S1} ${S2} after`);
    expect(out.note).toBeNull();
  });

  it('adds only the new words of a long recording whose start the operator edited', () => {
    const a = applyPieces('', {}, [piece(1, 'one two')]);
    const out = applyPieces('ONE two', a.marks, [piece(1, 'one two three')]);
    expect(out.text).toBe('ONE two three');
  });

  it('never shows a sentence that was deleted before it arrived', () => {
    const out = applyPieces('', {}, [piece(1, S1, true)]);
    expect(out.text).toBe('');
    expect(applyPieces(out.text, out.marks, [piece(1, S1, true)]).text).toBe('');
  });

  it('ignores later changes to sentences cleared in the popup', () => {
    const a = applyPieces('', {}, [piece(1, S1)]);
    const out = applyPieces('', clearedMarks(a.marks), [piece(1, 'புதியது.')]);
    expect(out.text).toBe('');
    expect(applyPieces('', clearedMarks(a.marks), [piece(2, S2)]).text).toBe(S2);
  });
});

describe('appendText', () => {
  it('puts one space between, none after a space or line break', () => {
    expect(appendText('a', 'b')).toBe('a b');
    expect(appendText('a\n', 'b')).toBe('a\nb');
    expect(appendText('', 'b')).toBe('b');
    expect(appendText('a', '')).toBe('a');
  });
});

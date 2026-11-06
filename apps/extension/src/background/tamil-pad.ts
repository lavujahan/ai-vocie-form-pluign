import type { TamilPadPiece } from '@vff/shared';

/**
 * Tamil typing on the phone: how the sentences the phone writes go into the popup's Tamil text, which
 * the operator can edit too. `marks` keeps, per sentence (by seq), the text last put into the box, so an
 * edit or delete on the phone changes exactly that text. null: Clear was pressed (or it was deleted),
 * so later changes to it are ignored.
 */
export type PadMarks = Record<string, string | null>;

export type PadApplied = { text: string; marks: PadMarks; note: string | null };

const quote = (t: string) => `“${t.length > 32 ? `${t.slice(0, 32).trimEnd()}…` : t}”`;

/** Adds text at the end, with one space between. */
export function appendText(before: string, added: string): string {
  if (!added) return before;
  if (!before) return added;
  return /\s$/.test(before) ? before + added : `${before} ${added}`;
}

/** Takes `old` out of `text` at `at`, closing the gap it leaves. */
function cut(text: string, at: number, old: string): string {
  const b = text.slice(0, at).replace(/[ \t]+$/, '');
  const a = text.slice(at + old.length).replace(/^[ \t]+/, '');
  if (!b || !a || /\n$/.test(b) || /^\n/.test(a)) return b + a;
  return `${b} ${a}`;
}

/**
 * Applies the phone's sentences (new, edited or deleted) to the text. A sentence the operator already
 * changed in the box is not found there: an edit is then added at the end and a delete leaves the
 * text alone, each with a note, so nobody's typing is lost.
 */
export function applyPieces(text: string, marks: PadMarks, pieces: TamilPadPiece[]): PadApplied {
  let note: string | null = null;
  const next: PadMarks = { ...marks };
  for (const p of [...pieces].sort((a, b) => a.seq - b.seq)) {
    const key = String(p.seq);
    if (!(key in next)) {
      // New: at the end. One that is already deleted (caught up late) never shows.
      if (p.deleted || !p.text) next[key] = p.deleted ? null : '';
      else {
        text = appendText(text, p.text);
        next[key] = p.text;
      }
      continue;
    }
    const old = next[key];
    if (old === null) continue;
    if (!old) {
      // Seen while still empty (nothing heard yet): now it has text.
      if (!p.deleted && p.text) {
        text = appendText(text, p.text);
        next[key] = p.text;
      }
      continue;
    }
    const at = text.lastIndexOf(old);
    if (p.deleted) {
      next[key] = null;
      if (at >= 0) {
        text = cut(text, at, old);
        note = `Deleted on the phone: ${quote(old)}`;
      } else note = `Deleted on the phone: ${quote(old)}. You had changed it here, so it stays.`;
      continue;
    }
    if (p.text === old) continue;
    next[key] = p.text;
    // A long recording grows as its 28 s pieces are written: no note for that.
    const grew = p.text.startsWith(old);
    if (at >= 0) {
      text = text.slice(0, at) + p.text + text.slice(at + old.length);
      if (!grew) note = `Changed on the phone: ${quote(p.text)}`;
    } else if (grew) {
      // The operator edited the start already: only the newly written words go at the end.
      text = appendText(text, p.text.slice(old.length).trim());
    } else {
      text = appendText(text, p.text);
      note = 'Changed on the phone. You had edited it here, so the new version is at the end.';
    }
  }
  return { text, marks: next, note };
}

/** Clear in the popup: the sentences sent so far are done with, whatever the phone does to them later. */
export function clearedMarks(marks: PadMarks): PadMarks {
  return Object.fromEntries(Object.keys(marks).map((k) => [k, null]));
}

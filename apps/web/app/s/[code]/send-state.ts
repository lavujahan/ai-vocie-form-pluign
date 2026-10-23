import type { FieldFile, SessionValue } from '@vff/shared';

/**
 * "Send to desktop" can be pressed again whenever the phone has something new. The send watermark is
 * the newest answer / upload time (server clock) at the last successful send; anything newer is
 * "not sent yet". Answers emptied by a Start over don't count (the page isn't changed for them).
 */

const time = (iso: string | null | undefined) => (iso ? Date.parse(iso) || 0 : 0);
const resetEmptied = (v: SessionValue, resetSeq: number) => v.value === null && v.source_seq <= resetSeq;

export function sendWatermark(values: Iterable<SessionValue>, files: Iterable<FieldFile>, resetSeq: number): number {
  let max = 0;
  for (const v of values) if (!resetEmptied(v, resetSeq)) max = Math.max(max, time(v.updated_at));
  for (const f of files) max = Math.max(max, time(f.created_at));
  return max;
}

/**
 * Answers / uploads changed after the last send. Without a stored watermark (the page was reloaded),
 * the computer's last fill time is used; with neither, everything counts.
 */
export function unsentChanges(
  values: Iterable<SessionValue>,
  files: Iterable<FieldFile>,
  resetSeq: number,
  sentUpTo: number | null,
  lastFillAt: string | null | undefined,
): number {
  const since = sentUpTo ?? time(lastFillAt);
  let n = 0;
  for (const v of values) if (time(v.updated_at) > since && !resetEmptied(v, resetSeq) && (since > 0 || v.value !== null)) n++;
  for (const f of files) if (time(f.created_at) > since && f.status === 'uploaded') n++;
  return n;
}

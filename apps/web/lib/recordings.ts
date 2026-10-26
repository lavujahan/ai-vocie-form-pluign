import 'server-only';
import { db } from './supabase-admin';

export type PieceRow = { part: number; status: 'processing' | 'done' | 'error'; transcript: string | null };

/**
 * True when every earlier piece (0 … part-1) has arrived and either has its transcript or failed.
 * Pieces are cut ≥ 20 s apart and transcription takes 1–2 s, so this is normally already true.
 */
export function earlierPiecesReady(rows: PieceRow[], part: number): boolean {
  const earlier = rows.filter((r) => r.part < part);
  if (new Set(earlier.map((r) => r.part)).size < part) return false; // a piece is still uploading
  // Ready when each earlier piece number has a row that is finished transcribing.
  const done = new Set(earlier.filter((r) => r.transcript !== null || r.status === 'error').map((r) => r.part));
  return done.size >= part;
}

/**
 * Every piece's transcript with this one in its place, in spoken order. Failed pieces are skipped.
 * Later pieces count too: a retried middle piece is mapped after the last one, and covers the whole recording.
 */
export function joinPieces(rows: PieceRow[], part: number, transcript: string): string {
  // One transcript per piece number (a retried piece has two rows; the failed one has none).
  const byPart = new Map<number, string>();
  for (const r of rows) if (r.part !== part && r.transcript?.trim()) byPart.set(r.part, r.transcript.trim());
  byPart.set(part, transcript.trim());
  return [...byPart.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, t]) => t)
    .filter(Boolean)
    .join(' ');
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Full transcript of a recording: waits briefly for earlier pieces' transcripts, then joins every
 * piece's with this one's. A recording is mapped once, on its last piece (or a retried piece), so a
 * sentence or number cut across pieces ("mobile number 95432 | 49890") is read whole.
 */
export async function recordingTranscript(
  sessionId: string,
  recordingId: string,
  part: number,
  transcript: string,
  opts: { timeoutMs?: number; pollMs?: number } = {},
): Promise<string> {
  const deadline = Date.now() + (opts.timeoutMs ?? 10_000);
  let rows: PieceRow[] = [];
  for (;;) {
    const { data } = await db()
      .from('utterances')
      .select('part, status, transcript')
      .eq('session_id', sessionId)
      .eq('recording_id', recordingId)
      .neq('part', part);
    rows = (data ?? []) as PieceRow[];
    if (earlierPiecesReady(rows, part) || Date.now() >= deadline) break;
    await sleep(opts.pollMs ?? 400);
  }
  return joinPieces(rows, part, transcript);
}

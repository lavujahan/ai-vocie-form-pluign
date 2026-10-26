import { describe, expect, it } from 'vitest';
import { earlierPiecesReady, joinPieces, type PieceRow } from '@/lib/recordings';

const row = (part: number, transcript: string | null, status: PieceRow['status'] = transcript ? 'done' : 'processing'): PieceRow => ({
  part,
  status,
  transcript,
});

describe('joining pieces of a long recording', () => {
  it('joins earlier pieces in spoken order, then this one', () => {
    const rows = [row(1, 'mobile number 95432'), row(0, 'Applicant name Jagan, gender male,')];
    expect(joinPieces(rows, 2, '49890, PIN code 636503')).toBe(
      'Applicant name Jagan, gender male, mobile number 95432 49890, PIN code 636503',
    );
  });

  it('skips failed pieces and uses one transcript per piece when a piece was retried', () => {
    const rows = [row(0, null, 'error'), row(0, 'father name'), row(1, null, 'error')];
    expect(joinPieces(rows, 2, 'Jagadeesan')).toBe('father name Jagadeesan');
  });

  it('includes pieces after this one: a retried middle piece maps the whole recording', () => {
    expect(joinPieces([row(0, 'one'), row(2, 'three')], 1, 'two')).toBe('one two three');
  });

  it('a last piece that caught only silence still joins the pieces before it', () => {
    expect(joinPieces([row(0, 'Name Jagan'), row(1, 'mobile 95432')], 2, '')).toBe('Name Jagan mobile 95432');
  });

  it('uses this piece, not its own failed earlier try', () => {
    expect(joinPieces([row(0, 'one'), row(1, null, 'error')], 1, 'two')).toBe('one two');
  });

  it('waits until every earlier piece has arrived and finished transcribing', () => {
    expect(earlierPiecesReady([row(0, 'a')], 2)).toBe(false); // piece 1 still uploading
    expect(earlierPiecesReady([row(0, 'a'), row(1, null)], 2)).toBe(false); // piece 1 transcribing
    expect(earlierPiecesReady([row(0, 'a'), row(1, null, 'error')], 2)).toBe(true); // piece 1 failed
    expect(earlierPiecesReady([row(0, 'a'), row(1, 'b')], 2)).toBe(true);
    expect(earlierPiecesReady([], 0)).toBe(true);
  });
});

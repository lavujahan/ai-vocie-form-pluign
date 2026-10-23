import { describe, expect, it } from 'vitest';
import type { FieldFile, SessionValue } from '@vff/shared';
import { sendWatermark, unsentChanges } from '@/app/s/[code]/send-state';

const at = (s: number) => new Date(Date.UTC(2026, 9, 23, 8, 0, s)).toISOString();
const value = (id: string, v: string | null, s: number, seq = 5): SessionValue => ({
  field_id: id,
  value: v,
  confidence: 1,
  source_phrase: null,
  source_seq: seq,
  updated_at: at(s),
});
const file = (id: string, s: number, status: FieldFile['status'] = 'uploaded'): FieldFile => ({
  id,
  field_id: id,
  file_name: 'Photo.jpg',
  mime: 'image/jpeg',
  bytes: 1000,
  pages: null,
  status,
  reason: null,
  created_at: at(s),
});

describe('Send to desktop again when the phone has something new', () => {
  it('counts answers and uploads changed after the last Send', () => {
    const first = [value('a', 'Murugan', 1), value('b', '18', 2)];
    const mark = sendWatermark(first, [], 0);
    expect(unsentChanges(first, [], 0, mark, null)).toBe(0); // nothing new: "Sent ✓"
    const later = [value('a', 'Murugan', 1), value('b', '19', 5), value('c', 'Black', 6)];
    expect(unsentChanges(later, [file('f', 7)], 0, mark, null)).toBe(3); // "Send 3 changes"
  });

  it('after a reload without the stored mark, uses the computer’s last fill time', () => {
    const vals = [value('a', 'Murugan', 1), value('b', '19', 5)];
    expect(unsentChanges(vals, [], 0, null, at(3))).toBe(1);
    // Neither known: every answer counts (but not empty ones).
    expect(unsentChanges([...vals, value('c', null, 6)], [], 0, null, null)).toBe(2);
  });

  it('ignores answers emptied by Start over', () => {
    const vals = [value('a', null, 9, 4), value('b', 'Erode', 9, 6)];
    expect(unsentChanges(vals, [], 5, Date.parse(at(1)), null)).toBe(1);
    expect(sendWatermark([value('a', null, 9, 4)], [], 5)).toBe(0);
  });
});

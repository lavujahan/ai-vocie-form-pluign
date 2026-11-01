import { describe, expect, it } from 'vitest';
import { maxPagesOf, sanitizeFileRules, type FileRules } from '@vff/shared';
import { kindOf, listScans, type FolderFile } from '../src/popup/scan/folder';

const NOW = 1_800_000_000_000;
const file = (name: string, over: Partial<FolderFile> = {}): FolderFile => ({ path: name, name, size: 1000, modified: NOW - 60_000, ...over });
/** The look before: every file at the size it has now, so all have settled. */
const settled = (files: FolderFile[]) => new Map(files.map((f) => [f.path, f.size]));

describe('scan folder', () => {
  it('takes images and PDFs, and ignores temp files and other types', () => {
    expect(['a.jpg', 'A.JPEG', 'b.png', 'c.bmp', 'd.webp'].map(kindOf)).toEqual(['image', 'image', 'image', 'image', 'image']);
    expect(kindOf('scan.pdf')).toBe('pdf');
    expect(['x.tif', 'x.TIFF'].map(kindOf)).toEqual(['tiff', 'tiff']);
    for (const name of ['x.tmp', '~$scan.jpg', '.hidden.jpg', 'x.crdownload', 'x.part', 'notes.txt', 'desktop.ini', 'noextension']) expect(kindOf(name)).toBeNull();
  });

  it('waits until a file stops growing', () => {
    const files = [file('old.jpg'), file('new.jpg', { size: 2000 })];
    const first = listScans(files, new Map([['old.jpg', 1000], ['new.jpg', 500]]), { now: NOW });
    expect(first.scans.map((s) => s.name)).toEqual(['old.jpg']);
    expect(first.settling).toBe(1);
    // Not seen before: it can't have settled yet.
    expect(listScans(files, new Map(), { now: NOW }).scans).toEqual([]);
    expect(listScans(files, settled(files), { now: NOW }).settling).toBe(0);
  });

  it('never lists an empty file', () => {
    const files = [file('empty.jpg', { size: 0 })];
    expect(listScans(files, settled(files), { now: NOW })).toMatchObject({ scans: [], settling: 1 });
  });

  it('shows only the last hour, newest first, unless older scans are asked for', () => {
    const files = [file('a.jpg', { modified: NOW - 50 * 60_000 }), file('b.jpg', { modified: NOW - 61 * 60_000 }), file('c.jpg', { modified: NOW - 1000 })];
    expect(listScans(files, settled(files), { now: NOW }).scans.map((s) => s.name)).toEqual(['c.jpg', 'a.jpg']);
    expect(listScans(files, settled(files), { now: NOW, older: true }).scans.map((s) => s.name)).toEqual(['c.jpg', 'a.jpg', 'b.jpg']);
  });

  it('keeps to the newest 30', () => {
    const files = Array.from({ length: 40 }, (_, i) => file(`s${i}.jpg`, { modified: NOW - i * 1000 }));
    const { scans } = listScans(files, settled(files), { now: NOW });
    expect(scans).toHaveLength(30);
    expect(scans[0]?.name).toBe('s0.jpg');
  });

  it('counts recent TIFF files, which Chrome cannot open, without listing them', () => {
    const files = [file('a.tif'), file('b.tiff', { modified: NOW - 2 * 3_600_000 }), file('c.jpg')];
    expect(listScans(files, settled(files), { now: NOW })).toMatchObject({ tiff: 1, scans: [{ name: 'c.jpg', pdf: false }] });
  });

  it('tells a new scan from an old file of the same name', () => {
    const one = file('Scan.jpg');
    const two = file('Scan.jpg', { size: 1500, modified: NOW - 1000 });
    const [a] = listScans([one], settled([one]), { now: NOW }).scans;
    const [b] = listScans([two], settled([two]), { now: NOW }).scans;
    expect(a?.key).not.toBe(b?.key);
  });
});

describe('how many pages a field can take', () => {
  const rules = (r: Partial<FileRules>) =>
    sanitizeFileRules({ kind: 'document', formats: ['pdf'], max_kb: null, min_kb: null, max_pages: null, width_px: null, height_px: null, shape: null, note: null, ...r }, null);

  it('is one for an image field, whatever else is set', () => {
    expect(maxPagesOf(rules({ formats: ['jpg'], max_pages: 5 }))).toBe(1);
  });
  it('is the stated limit for a PDF field, else unlimited', () => {
    expect(maxPagesOf(rules({ max_pages: 2 }))).toBe(2);
    expect(maxPagesOf(rules({}))).toBe(Infinity);
    expect(maxPagesOf(rules({ formats: ['jpg', 'pdf'] }))).toBe(Infinity);
  });
});

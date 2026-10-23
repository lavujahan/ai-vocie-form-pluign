import { describe, expect, it } from 'vitest';
import { checkFile, describeFileRules, effectiveFileRules, formatsFromAccept, sanitizeFileRules, sniffMime, targetFormat } from '../src';

const rules = (over: Partial<Parameters<typeof sanitizeFileRules>[0] & object> = {}) =>
  sanitizeFileRules({ kind: 'photo', formats: ['jpg'], max_kb: 50, min_kb: null, max_pages: null, width_px: null, height_px: null, note: null, ...over }, null);

describe('file upload rules', () => {
  it('reads the accept attribute', () => {
    expect(formatsFromAccept('.pdf')).toEqual(['pdf']);
    expect(formatsFromAccept('image/*')).toEqual(['jpg', 'png']);
    expect(formatsFromAccept('.jpg, .jpeg, application/pdf')).toEqual(['jpg', 'pdf']);
    expect(formatsFromAccept(null)).toEqual([]);
  });

  it('lets accept win over the AI, and falls back to anything when nothing is known', () => {
    expect(sanitizeFileRules({ ...rules(), formats: ['jpg'] }, '.pdf').formats).toEqual(['pdf']);
    expect(sanitizeFileRules({ ...rules(), formats: ['jpg', 'pdf'] }, '.pdf').formats).toEqual(['pdf']);
    expect(effectiveFileRules({ accept: null, file_rules: null }).formats).toEqual(['jpg', 'png', 'pdf']);
    expect(sanitizeFileRules({ ...rules(), max_kb: 999_999, max_pages: 0 }, null)).toMatchObject({ max_kb: 20_480, max_pages: 1 });
  });

  it('checks a file against the rules', () => {
    expect(checkFile(rules(), { mime: 'image/jpeg', bytes: 40 * 1024 })).toBeNull();
    expect(checkFile(rules(), { mime: 'image/jpeg', bytes: 60 * 1024 })).toMatch(/limit is 50 KB/);
    expect(checkFile(rules(), { mime: 'application/pdf', bytes: 10 })).toMatch(/takes JPG/);
    expect(checkFile(rules({ formats: ['pdf'], max_kb: 1024, max_pages: 2 }), { mime: 'application/pdf', bytes: 1000, pages: 3 })).toMatch(/3 pages/);
  });

  it('picks the format to produce', () => {
    expect(targetFormat(rules(), 1)).toBe('jpg');
    expect(targetFormat(rules({ formats: ['jpg', 'pdf'] }), 2)).toBe('pdf');
    expect(targetFormat(rules({ kind: 'document', formats: ['jpg', 'pdf'] }), 1)).toBe('pdf');
    expect(targetFormat(rules({ formats: ['pdf'] }), 1)).toBe('pdf');
  });

  it('knows a file by its first bytes, and describes the rules', () => {
    expect(sniffMime(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(sniffMime(new TextEncoder().encode('%PDF-1.7'))).toBe('application/pdf');
    expect(sniffMime(new TextEncoder().encode('<html>'))).toBeNull();
    expect(describeFileRules(rules({ formats: ['pdf'], max_kb: 1024, max_pages: 3 }))).toBe('PDF · max 1.0 MB · up to 3 pages');
  });
});

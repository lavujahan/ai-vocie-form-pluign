import { describe, expect, it } from 'vitest';
import { AdminFormPatch, FormSchema, type FieldAnalysis } from '@vff/shared';
import { applyFieldEdits, formFingerprint, isFresh, readingExpiresAt } from '@/lib/agents/formCache';

const schema = (over: Partial<FormSchema> = {}, field: Record<string, unknown> = {}) =>
  FormSchema.parse({
    page_url: 'https://nicforms.nic.in/nicforms/form?id=1',
    page_title: 'Community asset maintenance',
    html_snippet: '<p>Today: 26 Oct</p>',
    fields: [
      { field_key: 'ddl_village', label: 'Select Village', field_type: 'select', required: true, options: [{ value: '1', label: 'Elumathur' }], ...field },
      { field_key: 'text-name', label: 'Volunteer Name', field_type: 'text', required: true },
    ],
    ...over,
  });

describe('form fingerprint (which scans share a reading)', () => {
  const base = formFingerprint(schema());

  it('is the same for the same form, whatever the query string or page HTML', () => {
    expect(formFingerprint(schema())).toBe(base);
    expect(formFingerprint(schema({ page_url: 'https://nicforms.nic.in/nicforms/form?id=1&t=999#top' }))).toBe(base);
    expect(formFingerprint(schema({ html_snippet: '<p>Today: 27 Oct</p>' }))).toBe(base);
  });

  it('changes when the page, a label, an option or the help text changes', () => {
    expect(formFingerprint(schema({ page_url: 'https://nicforms.nic.in/other/form' }))).not.toBe(base);
    expect(formFingerprint(schema({}, { label: 'Select Village or Ward' }))).not.toBe(base);
    expect(formFingerprint(schema({}, { options: [{ value: '1', label: 'Elumathur' }, { value: '2', label: 'Kottur' }] }))).not.toBe(base);
    expect(formFingerprint(schema({}, { context: 'Choose your village' }))).not.toBe(base);
    expect(formFingerprint(schema({}, { required: false }))).not.toBe(base);
  });
});

describe('when a saved reading is reused', () => {
  const current = { model: 'gpt-5.4-mini@low', promptVersion: 'abc' };
  const now = new Date('2026-10-27T00:00:00Z');
  const reading = { created_at: '2026-10-20T00:00:00Z', edited_at: null, model: 'gpt-5.4-mini@low', prompt_version: 'abc' };

  it('for 30 days with the same model and instructions', () => {
    expect(isFresh(reading, current, now)).toBe(true);
    expect(readingExpiresAt(reading)?.toISOString()).toBe('2026-11-19T00:00:00.000Z');
    expect(isFresh({ ...reading, created_at: '2026-09-20T00:00:00Z' }, current, now)).toBe(false);
  });

  it('not after the model or the instructions changed', () => {
    expect(isFresh({ ...reading, model: 'gpt-4o' }, current, now)).toBe(false);
    expect(isFresh({ ...reading, prompt_version: 'old' }, current, now)).toBe(false);
  });

  it('always when the admin edited it', () => {
    const edited = { ...reading, created_at: '2025-01-01T00:00:00Z', model: 'gpt-4o', edited_at: '2025-01-02T00:00:00Z' };
    expect(isFresh(edited, current, now)).toBe(true);
    expect(readingExpiresAt(edited)).toBeNull();
  });
});

describe('admin edits of a reading', () => {
  const field = (key: string): FieldAnalysis => ({
    field_key: key,
    clean_label: 'Volunteer name',
    semantic_type: 'full_name',
    required: false,
    validation: { regex: null, min_length: null, max_length: null, format: null },
    depends_on: null,
    step_index: 0,
    output_script: 'en',
    label_ta: 'தன்னார்வலர் பெயர்',
    file_rules: null,
  });

  it('changes only the edited fields, and only their labels and required flag', () => {
    const out = applyFieldEdits([field('a'), field('b')], [{ field_key: 'b', clean_label: 'Name', label_ta: 'பெயர்', required: true }]);
    expect(out[0]).toEqual(field('a'));
    expect(out[1]).toEqual({ ...field('b'), clean_label: 'Name', label_ta: 'பெயர்', required: true });
  });

  it('rejects an empty English label', () => {
    expect(() => AdminFormPatch.parse({ fields: [{ field_key: 'a', clean_label: '  ', label_ta: '', required: false }] })).toThrow();
  });
});

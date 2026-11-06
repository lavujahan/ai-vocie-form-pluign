import { describe, expect, it } from 'vitest';
import { AdminFormPatch, FormSchema, type FieldAnalysis } from '@vff/shared';
import { applyFieldEdits, fieldSig, formFingerprint, formTemplate, isFresh, knownFieldReadings, readingExpiresAt } from '@/lib/agents/formCache';

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

  it('is the same whatever the page state: loaded options, help text, required mark', () => {
    expect(formFingerprint(schema({}, { options: [{ value: '1', label: 'Elumathur' }, { value: '2', label: 'Kottur' }] }))).toBe(base);
    expect(formFingerprint(schema({}, { options: [] }))).toBe(base);
    expect(formFingerprint(schema({}, { context: 'Choose your village' }))).toBe(base);
    expect(formFingerprint(schema({}, { required: false }))).toBe(base);
  });

  it('changes when the page, a label, a type or a field changes', () => {
    expect(formFingerprint(schema({ page_url: 'https://nicforms.nic.in/other/form' }))).not.toBe(base);
    expect(formFingerprint(schema({}, { label: 'Select Village or Ward' }))).not.toBe(base);
    expect(formFingerprint(schema({}, { field_type: 'radio' }))).not.toBe(base);
    expect(formFingerprint(schema({}, { field_key: 'ddl_ward' }))).not.toBe(base);
  });
});

describe("the form's saved field list", () => {
  const fields = schema().fields;
  const analysis = (dependsOn: string | null) => [{ field_key: 'ddl_village', depends_on: dependsOn }, { field_key: 'text-name', depends_on: null }];

  it('keeps fixed dropdown options and every field as scanned', () => {
    expect(formTemplate(fields, analysis(null))).toEqual(fields);
  });

  it('keeps the options of a dropdown that was disabled when scanned (CAN "Document Type 1")', () => {
    const disabled = schema({}, { dynamic_options: true }).fields;
    expect(formTemplate(disabled, analysis(null))[0]).toMatchObject({ options: [{ value: '1', label: 'Elumathur' }] });
  });

  it('saves a dropdown that depends on another field without the options it happened to show', () => {
    const [village, name] = formTemplate(fields, analysis('ddl_taluk'));
    expect(village).toMatchObject({ field_key: 'ddl_village', options: [], dynamic_options: true });
    expect(name).toEqual(fields[1]);
  });
});

describe('when a saved reading is reused', () => {
  const current = { promptVersion: 'abc' };
  const now = new Date('2026-10-27T00:00:00Z');
  const reading = { created_at: '2026-10-20T00:00:00Z', edited_at: null, prompt_version: 'abc' };

  it('for 30 days with the same instructions, whatever model made it', () => {
    // A reading made by gpt-5-nano is still used after the switch to gpt-5.4-mini: there is no model check.
    expect(isFresh(reading, current, now)).toBe(true);
    expect(readingExpiresAt(reading)?.toISOString()).toBe('2026-11-19T00:00:00.000Z');
    expect(isFresh({ ...reading, created_at: '2026-09-20T00:00:00Z' }, current, now)).toBe(false);
  });

  it('not after the instructions changed', () => {
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

describe('knownFieldReadings (fields that appear later reuse earlier readings)', () => {
  const PV = { promptVersion: 'v1' };
  const NOW = new Date('2026-11-06T10:00:00Z');
  const reading = (key: string, clean: string): FieldAnalysis =>
    ({ field_key: key, clean_label: clean, label_ta: '', semantic_type: 'other', validation: null, required: false, depends_on: null, step_index: 0, output_script: 'en', file_rules: null }) as FieldAnalysis;
  const row = (created_at: string, fields: [string, string, string][], clean: string, over: Record<string, unknown> = {}) => ({
    analysis: { form_purpose: '', fields: fields.map(([k]) => reading(k, `${clean} ${k}`)) },
    fields: fields.map(([field_key, label, field_type]) => ({ field_key, label, field_type })),
    prompt_version: 'v1',
    created_at,
    edited_at: null,
    ...over,
  });

  it('finds a field by its key, label and type, from any saved reading of the page', () => {
    const known = knownFieldReadings(
      [row('2026-11-05T09:00:00Z', [['taluk', 'Taluk', 'select']], 'old'), row('2026-11-05T10:00:00Z', [['village', 'Village', 'select']], 'step')],
      PV,
      NOW,
    );
    expect(known.get(fieldSig({ field_key: 'taluk', label: 'Taluk', field_type: 'select' }))?.clean_label).toBe('old taluk');
    expect(known.get(fieldSig({ field_key: 'village', label: 'Village', field_type: 'select' }))?.clean_label).toBe('step village');
  });

  it('does not match a field whose label or type changed', () => {
    const known = knownFieldReadings([row('2026-11-05T09:00:00Z', [['taluk', 'Taluk', 'select']], 'old')], PV, NOW);
    expect(known.has(fieldSig({ field_key: 'taluk', label: 'Taluk name', field_type: 'select' }))).toBe(false);
    expect(known.has(fieldSig({ field_key: 'taluk', label: 'Taluk', field_type: 'text' }))).toBe(false);
  });

  it('takes the newest reading of a field', () => {
    const known = knownFieldReadings(
      [row('2026-11-01T09:00:00Z', [['taluk', 'Taluk', 'select']], 'older'), row('2026-11-05T09:00:00Z', [['taluk', 'Taluk', 'select']], 'newer')],
      PV,
      NOW,
    );
    expect(known.get(fieldSig({ field_key: 'taluk', label: 'Taluk', field_type: 'select' }))?.clean_label).toBe('newer taluk');
  });

  it('skips readings made with other instructions or older than 30 days', () => {
    const known = knownFieldReadings(
      [row('2026-11-05T09:00:00Z', [['a', 'A', 'text']], 'x', { prompt_version: 'v0' }), row('2026-09-01T09:00:00Z', [['b', 'B', 'text']], 'x')],
      PV,
      NOW,
    );
    expect(known.size).toBe(0);
  });
});

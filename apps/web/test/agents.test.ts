import { describe, expect, it } from 'vitest';
import { assistantMessage, functionCall, ScriptedModel } from '@openai/agents/testing';
import type { FormSchema } from '@vff/shared';
import { mapTranscript, buildMapperPrompt } from '@/lib/agents/fieldMapper';
import { sanitizeAnalysis } from '@/lib/agents/formAnalyzer';
import { isEmptyTranscript, sanitizeMapping } from '@/lib/agents/guardrails';
import { matchOptionForField, validateForField, type AgentField } from '@/lib/agents/tools';
import { EVAL_FORM } from '../scripts/eval-fixtures';

const fields = new Map(EVAL_FORM.map((f) => [f.field_key, f]));

describe('agent tools', () => {
  it('match_option resolves across languages', () => {
    expect(matchOptionForField(fields, 'gender', 'ஆண்')).toMatchObject({ best: 'Male' });
    expect(matchOptionForField(fields, 'state', 'tamilnadu')).toMatchObject({ best: 'Tamil Nadu' });
    expect(matchOptionForField(fields, 'nope', 'x')).toHaveProperty('error');
  });
  it('validate_value normalizes and rejects', () => {
    expect(validateForField(fields, 'dob', '15/03/1990')).toEqual({ ok: true, value: '1990-03-15' });
    expect(validateForField(fields, 'email', 'ramesh@gmail')).toMatchObject({ ok: false });
    expect(validateForField(fields, 'marital', 'Married')).toEqual({ ok: true, value: 'Married' });
  });
});

describe('sanitizeMapping (output guardrail)', () => {
  it('drops unknown keys and nulls, keeps clears, flags invalid values', () => {
    const r = sanitizeMapping(
      {
        values: [
          { field_key: 'full_name', value: 'Ramesh Kumar', confidence: 0.9, source_phrase: 'Ramesh Kumar' },
          { field_key: 'invented', value: 'x', confidence: 0.9, source_phrase: null },
          { field_key: 'email', value: null, confidence: 0.1, source_phrase: null },
          { field_key: 'city', value: '', confidence: 0.9, source_phrase: 'clear the city' },
          { field_key: 'marital', value: 'Widowed', confidence: 0.9, source_phrase: null },
          { field_key: 'phone', value: '9876543210', confidence: 2, source_phrase: null },
        ],
        unmapped_speech: '  ',
        missing_required: ['email', 'ghost'],
      },
      EVAL_FORM,
      null,
    );
    const byKey = Object.fromEntries(r.values.map((v) => [v.field_key, v]));
    expect(Object.keys(byKey).sort()).toEqual(['city', 'full_name', 'marital', 'phone']);
    expect(byKey.city).toMatchObject({ value: null, confidence: 1 });
    expect(byKey.marital.confidence).toBeLessThanOrEqual(0.3);
    expect(byKey.marital.error).toBeTruthy();
    expect(byKey.phone.confidence).toBe(1);
    expect(r.unmapped_speech).toBeNull();
    expect(r.missing_required).toEqual(['email']);
  });

  it('only keeps the target field in field-by-field mode', () => {
    const r = sanitizeMapping(
      {
        values: [
          { field_key: 'full_name', value: 'Ramesh', confidence: 0.9, source_phrase: null },
          { field_key: 'city', value: 'Chennai', confidence: 0.9, source_phrase: null },
        ],
        unmapped_speech: null,
        missing_required: [],
      },
      EVAL_FORM,
      'city',
    );
    expect(r.values.map((v) => v.field_key)).toEqual(['city']);
  });

  it('lowers confidence when Tamil script leaks into an English field', () => {
    const r = sanitizeMapping(
      { values: [{ field_key: 'city', value: 'சென்னை', confidence: 0.9, source_phrase: null }], unmapped_speech: null, missing_required: [] },
      EVAL_FORM,
      null,
    );
    expect(r.values[0].confidence).toBeLessThanOrEqual(0.5);
    const ta = sanitizeMapping(
      { values: [{ field_key: 'name_ta', value: 'ரமேஷ்', confidence: 0.9, source_phrase: null }], unmapped_speech: null, missing_required: [] },
      EVAL_FORM,
      null,
    );
    expect(ta.values[0].confidence).toBe(0.9);
  });
});

describe('sanitizeAnalysis', () => {
  it('keeps known fields, drops bad regexes and dangling depends_on', () => {
    const schema = {
      page_url: 'https://x.test/',
      page_title: 'X',
      form_title: null,
      html_snippet: '',
      fields: [
        { field_key: 'a', label: 'A', field_type: 'text', required: false, options: [], multiple: false, group_key: null, depends_on: null, step_index: 0, min: null, max: null, pattern: null, placeholder: null, context: null },
      ],
    } satisfies FormSchema;
    const base = { clean_label: 'A', semantic_type: 'other', required: false, step_index: 0, output_script: 'en' } as const;
    const out = sanitizeAnalysis(
      {
        form_purpose: 'Test',
        fields: [
          { ...base, field_key: 'a', depends_on: 'zzz', validation: { regex: '([', min_length: null, max_length: null, format: null } },
          { ...base, field_key: 'b', depends_on: null, validation: { regex: null, min_length: null, max_length: null, format: null } },
        ],
      },
      schema,
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ field_key: 'a', depends_on: null, validation: { regex: null } });
  });
});

describe('Field Mapping Agent (scripted model)', () => {
  it('runs tools and returns sanitized values', async () => {
    const final = {
      values: [
        { field_key: 'full_name', value: 'Ramesh Kumar', confidence: 0.95, source_phrase: 'en peru Ramesh Kumar' },
        { field_key: 'gender', value: 'Male', confidence: 0.9, source_phrase: 'aan' },
      ],
      unmapped_speech: null,
      missing_required: ['email', 'phone'],
    };
    const model = new ScriptedModel([
      [functionCall('validate_value', { field_key: 'gender', value: 'aan' }, { callId: 'c1' })],
      [assistantMessage(JSON.stringify(final))],
    ]);
    const out = await mapTranscript(
      { fields: EVAL_FORM, current: {}, transcript: 'en peru Ramesh Kumar, naan aan', targetFieldKey: null },
      { model },
    );
    expect(out.empty).toBe(false);
    if (out.empty) return;
    expect(out.values.map((v) => [v.field_key, v.value])).toEqual([
      ['full_name', 'Ramesh Kumar'],
      ['gender', 'Male'],
    ]);
    // The tool result was fed back to the model on the second call.
    expect(JSON.stringify(model.lastCall?.request.input)).toContain('Male');
    model.assertComplete();
  });

  it('skips the model entirely for an empty transcript', async () => {
    const model = new ScriptedModel([]);
    const out = await mapTranscript({ fields: EVAL_FORM, current: {}, transcript: ' . ', targetFieldKey: null }, { model });
    expect(out).toEqual({ empty: true });
    expect(model.calls).toHaveLength(0);
  });

  it('puts only the target field and current values in the prompt', () => {
    const p = buildMapperPrompt({
      fields: EVAL_FORM as AgentField[],
      current: { phone: '9876543210', city: null },
      transcript: 'Chennai',
      targetFieldKey: 'city',
    });
    expect(p).toContain('Mode: single field');
    expect(p).toContain('- city');
    expect(p).not.toContain('- full_name');
    expect(p).toContain('phone = "9876543210"');
  });

  it('tells the model when a dropdown has no options yet', () => {
    const p = buildMapperPrompt({
      fields: [{ field_key: 'gender', label: 'Gender', field_type: 'select', required: true, options: [] }],
      current: {},
      transcript: 'Gender male',
      targetFieldKey: null,
    });
    expect(p).toContain('options: not loaded yet');
  });

  it('detects empty transcripts', () => {
    expect(isEmptyTranscript('')).toBe(true);
    expect(isEmptyTranscript('...')).toBe(true);
    expect(isEmptyTranscript('ok')).toBe(false);
    expect(isEmptyTranscript('ஆம்')).toBe(false);
  });
});

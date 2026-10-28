import { describe, expect, it, vi } from 'vitest';
import { assistantMessage, functionCall, ScriptedModel } from '@openai/agents/testing';
import { Usage } from '@openai/agents';
import { FieldDescriptor, validateValue, type AnalyzerAnswer, type FieldAnalysis, FormSchema } from '@vff/shared';
import { mapTranscript, buildMapperPrompt, fieldsBlock, mapperInstructions, withShortIds } from '@/lib/agents/fieldMapper';
import { agentModel, modelName } from '@/lib/agents/usage';
import { baseModel } from '@/lib/usage/pricing';
import { analyzeForm, keyHasWords, pageRules, readingFromAnswer, sanitizeAnalysis } from '@/lib/agents/formAnalyzer';
import { isEmptyTranscript, sanitizeMapping } from '@/lib/agents/guardrails';
import { mapperTools, validateForField, type AgentField } from '@/lib/agents/tools';
import { EVAL_FORM } from '../scripts/eval-fixtures';

const fields = new Map(EVAL_FORM.map((f) => [f.field_key, f]));

describe('agent tools', () => {
  it('the mapper only gets a checker tool, no speech-interpreting helpers', () => {
    expect(mapperTools(EVAL_FORM).map((t) => t.name)).toEqual(['validate_value']);
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
          { field_key: 'full_name', value: 'Ramesh Kumar', confidence: 0.9, source_phrase: 'Ramesh Kumar', number_parts: null },
          { field_key: 'invented', value: 'x', confidence: 0.9, source_phrase: null, number_parts: null },
          { field_key: 'email', value: null, confidence: 0.1, source_phrase: null, number_parts: null },
          { field_key: 'city', value: '', confidence: 0.9, source_phrase: 'clear the city', number_parts: null },
          { field_key: 'marital', value: 'Widowed', confidence: 0.9, source_phrase: null, number_parts: null },
          { field_key: 'phone', value: '9876543210', confidence: 2, source_phrase: null, number_parts: null },
        ],
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
  });

  it('builds spoken numbers from the parts the agent heard, not its one-shot answer', () => {
    const r = sanitizeMapping(
      {
        values: [
          {
            field_key: 'phone',
            value: '954324908', // one-shot answer dropped a digit
            confidence: 0.9,
            source_phrase: 'onbadhu anju naalu moonu rendu naalu onbadhu ettu poojyam double zero',
            number_parts: [
              { heard: 'onbadhu', digits: '9' },
              { heard: 'anju', digits: '5' },
              { heard: 'naalu', digits: '4' },
              { heard: 'moonu', digits: '3' },
              { heard: 'rendu', digits: '2' },
              { heard: 'naalu', digits: '4' },
              { heard: 'onbadhu', digits: '9' },
              { heard: 'ettu', digits: '8' },
              { heard: 'double zero', digits: '00' },
            ],
          },
        ],
      },
      EVAL_FORM,
      null,
    );
    expect(r.values[0].value).toBe('95432498' + '00');
  });

  it('only keeps the target field in field-by-field mode', () => {
    const r = sanitizeMapping(
      {
        values: [
          { field_key: 'full_name', value: 'Ramesh', confidence: 0.9, source_phrase: null, number_parts: null },
          { field_key: 'city', value: 'Chennai', confidence: 0.9, source_phrase: null, number_parts: null },
        ],
      },
      EVAL_FORM,
      'city',
    );
    expect(r.values.map((v) => v.field_key)).toEqual(['city']);
  });

  it('lowers confidence when Tamil script leaks into an English field', () => {
    const r = sanitizeMapping(
      { values: [{ field_key: 'city', value: 'சென்னை', confidence: 0.9, source_phrase: null, number_parts: null }] },
      EVAL_FORM,
      null,
    );
    expect(r.values[0].confidence).toBeLessThanOrEqual(0.5);
    const ta = sanitizeMapping(
      { values: [{ field_key: 'name_ta', value: 'ரமேஷ்', confidence: 0.9, source_phrase: null, number_parts: null }] },
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
        { field_key: 'a', label: 'A', field_type: 'text', required: false, options: [], multiple: false, dynamic_options: false, group_key: null, depends_on: null, step_index: 0, min: null, max: null, pattern: null, placeholder: null, min_length: null, max_length: null, title: null, inputmode: null, context: null, accept: null },
      ],
    } satisfies FormSchema;
    const base = { clean_label: 'A', semantic_type: 'other', required: false, step_index: 0, output_script: 'en', label_ta: '', file_rules: null } as const;
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

describe('Form Analyzer short answer', () => {
  const field = (field_key: string, label: string, field_type: FormSchema['fields'][number]['field_type'] = 'text') => ({
    field_key, label, field_type, required: false, options: [], multiple: false, dynamic_options: false, group_key: null,
    depends_on: null, step_index: 0, min: null, max: null, pattern: null, placeholder: null, min_length: null, max_length: null, title: null, inputmode: null, context: null, accept: null,
  });
  const schema = {
    page_url: 'https://x.test/form',
    page_title: 'X',
    form_title: null,
    html_snippet: '',
    fields: [
      field('txtName', 'Name'),
      field('txtNameTa', 'Name in regional language'),
      field('ddlDistrict', 'District', 'select'),
      field('ddlTaluk', 'Taluk', 'select'),
      field('filePhoto', 'Photo', 'file'),
    ],
  } satisfies FormSchema;
  const answerField = (id: string, more: Partial<AnalyzerAnswer['fields'][number]> = {}): AnalyzerAnswer['fields'][number] => ({
    field_key: id, clean_label: id, semantic_type: 'other', required: false, validation: null, depends_on: null, label_ta: 'பெயர்', ...more,
  });
  const answer = {
    form_purpose: 'Test form',
    fields: [answerField('f1'), answerField('f2'), answerField('f3'), answerField('f4', { depends_on: 'f3' }), answerField('f5')],
    tamil_fields: ['f2'],
    step_starts: ['f3'],
    uploads: [{ field_key: 'f5', kind: 'photo', formats: ['jpg'], max_kb: 50, min_kb: null, max_pages: null, width_px: null, height_px: null, shape: null, note: null }],
  } as AnalyzerAnswer;

  it('puts the site keys back and fills Tamil output, steps and upload rules from the short lists', () => {
    const r = readingFromAnswer(answer, schema);
    expect(r.fields.map((f) => [f.field_key, f.output_script, f.step_index])).toEqual([
      ['txtName', 'en', 0],
      ['txtNameTa', 'ta', 0],
      ['ddlDistrict', 'en', 1],
      ['ddlTaluk', 'en', 1],
      ['filePhoto', 'en', 1],
    ]);
    expect(r.fields[3].depends_on).toBe('ddlDistrict');
    expect(r.fields[4].file_rules).toMatchObject({ kind: 'photo', max_kb: 50 });
    expect(r.fields[0].file_rules).toBeNull();
    // The saved shape is unchanged, so readings, the phone and the mapper read it as before.
    expect(sanitizeAnalysis(r, schema).map((f) => f.field_key)).toEqual(schema.fields.map((f) => f.field_key));
    expect(sanitizeAnalysis(r, schema)[0].validation).toBeNull();
  });

  it('drops an id the form does not have', () => {
    const r = readingFromAnswer({ ...answer, fields: [...answer.fields, answerField('f99')] }, schema);
    expect(sanitizeAnalysis(r, schema)).toHaveLength(5);
  });

  it('reads the fields the answer left out again, once, on their own', async () => {
    const first = { ...answer, fields: answer.fields.filter((f) => f.field_key !== 'f2' && f.field_key !== 'f4') };
    // The second call lists only the two missing fields, as f1 and f2.
    const second = { ...answer, fields: [answerField('f1', { clean_label: 'Name in Tamil' }), answerField('f2', { depends_on: 'f1' })], tamil_fields: ['f1'], step_starts: [], uploads: [] };
    const model = new ScriptedModel([[assistantMessage(JSON.stringify(first))], [assistantMessage(JSON.stringify(second))]]);
    const r = await analyzeForm(schema, { model });
    expect(model.calls).toHaveLength(2);
    const byKey = new Map(sanitizeAnalysis(r, schema).map((f) => [f.field_key, f]));
    expect([...byKey.keys()].sort()).toEqual(schema.fields.map((f) => f.field_key).sort());
    expect(byKey.get('txtNameTa')).toMatchObject({ clean_label: 'Name in Tamil', output_script: 'ta', step_index: 0 });
    // Taluk follows District, which started step 1 in the first answer.
    expect(byKey.get('ddlTaluk')?.step_index).toBe(1);
  });

  it('sends short ids with the site key as a hint, and reads the short answer', async () => {
    const model = new ScriptedModel([[assistantMessage(JSON.stringify(answer))]]);
    const r = await analyzeForm(schema, { model });
    const prompt = JSON.stringify(model.calls[0]);
    expect(prompt).toContain('f1 · key: txtName');
    expect(r.fields[1]).toMatchObject({ field_key: 'txtNameTa', output_script: 'ta' });
  });
});

describe('Field Mapping Agent (scripted model)', () => {
  it('runs tools and returns sanitized values', async () => {
    // The model sees the fields as f1, f2, … and answers with those ids.
    const id = (key: string) => `f${EVAL_FORM.findIndex((f) => f.field_key === key) + 1}`;
    const final = {
      values: [
        { field_key: id('full_name'), value: 'Ramesh Kumar', confidence: 0.95, source_phrase: null, number_parts: null },
        { field_key: id('gender'), value: 'Male', confidence: 0.9, source_phrase: 'aan', number_parts: null },
      ],
    };
    const model = new ScriptedModel([
      [functionCall('validate_value', { field_key: id('gender'), value: 'aan' }, { callId: 'c1' })],
      [assistantMessage(JSON.stringify(final))],
    ]);
    const out = await mapTranscript(
      { fields: EVAL_FORM, current: {}, transcript: 'en peru Ramesh Kumar, naan aan', targetFieldKey: null },
      { model, validateTool: true },
    );
    expect(out.empty).toBe(false);
    if (out.empty) return;
    expect(out.values.map((v) => [v.field_key, v.value])).toEqual([
      ['full_name', 'Ramesh Kumar'],
      ['gender', 'Male'],
    ]);
    // The tool result was fed back to the model on the second call.
    expect(JSON.stringify(model.lastCall?.request.input)).toContain('Male');
    // The site's keys never reach the model.
    expect(JSON.stringify(model.lastCall?.request.input)).not.toContain('- full_name ·');
    model.assertComplete();
  });

  it('short ids: the same id for a field in every mode, and back to the site key', () => {
    const current = { full_name: 'Jahan', email: 'a@b.co' };
    const recent = [{ speech: 'Name vandhu Jahan', set: { full_name: 'Jahan' } }];
    const whole = withShortIds({ fields: EVAL_FORM, current, transcript: 'x', targetFieldKey: null, recent });
    const one = withShortIds({ fields: EVAL_FORM, current, transcript: 'x', targetFieldKey: 'full_name', recent });
    const nameId = whole.input.fields.find((f) => f.label === EVAL_FORM.find((g) => g.field_key === 'full_name')!.label)!.field_key;
    expect(nameId).toMatch(/^f\d+$/);
    expect(one.input.targetFieldKey).toBe(nameId);
    expect(whole.input.current[nameId]).toBe('Jahan');
    expect(whole.input.recent?.[0].set[nameId]).toBe('Jahan');
    expect(whole.realKey(nameId)).toBe('full_name');
    expect(whole.realKey('f999')).toBeUndefined(); // an id the form doesn't have is dropped by sanitizeMapping first
    const prompt = buildMapperPrompt(whole.input);
    for (const f of EVAL_FORM) expect(prompt).not.toContain(`- ${f.field_key} `);
  });

  it('drops an answer for an id the form does not have', async () => {
    const final = {
      values: [
        { field_key: 'f1', value: 'Ramesh Kumar', confidence: 0.95, source_phrase: null, number_parts: null },
        { field_key: 'f999', value: 'x', confidence: 0.9, source_phrase: null, number_parts: null },
      ],
    };
    const model = new ScriptedModel([[assistantMessage(JSON.stringify(final))]]);
    const out = await mapTranscript({ fields: EVAL_FORM, current: {}, transcript: 'Ramesh Kumar', targetFieldKey: null }, { model });
    if (out.empty) throw new Error('empty');
    expect(out.values.map((v) => v.field_key)).toEqual([EVAL_FORM[0].field_key]);
  });

  it('skips the model entirely for an empty transcript', async () => {
    const model = new ScriptedModel([]);
    const onUsage = vi.fn();
    const out = await mapTranscript({ fields: EVAL_FORM, current: {}, transcript: ' . ', targetFieldKey: null }, { model, onUsage });
    expect(out).toEqual({ empty: true });
    expect(model.calls).toHaveLength(0);
    expect(onUsage).not.toHaveBeenCalled();
  });

  it('reports the tokens of every request in the run, for billing', async () => {
    const final = { values: [] };
    const model = new ScriptedModel([
      {
        output: [functionCall('validate_value', { field_key: 'gender', value: 'Male' }, { callId: 'c1' })],
        usage: new Usage({ requests: 1, inputTokens: 4000, outputTokens: 40, inputTokensDetails: { cached_tokens: 3000 } }),
      },
      { output: [assistantMessage(JSON.stringify(final))], usage: new Usage({ requests: 1, inputTokens: 4100, outputTokens: 60 }) },
    ]);
    const onUsage = vi.fn();
    await mapTranscript({ fields: EVAL_FORM, current: {}, transcript: 'hello', targetFieldKey: null }, { model, onUsage, validateTool: true });
    expect(onUsage).toHaveBeenCalledTimes(1);
    const { usage, model: name, ok } = onUsage.mock.calls[0][0];
    expect({ name, ok, requests: usage.requests, input: usage.inputTokens, output: usage.outputTokens }).toEqual({
      name: 'custom',
      ok: true,
      requests: 2,
      input: 8100,
      output: 100,
    });
  });

  it('starts with all the fields in every mode (the same, cached text), then the mode and current values', () => {
    const input = { fields: EVAL_FORM as AgentField[], current: { phone: '9876543210', city: null }, transcript: 'Chennai' };
    const one = buildMapperPrompt({ ...input, targetFieldKey: 'city' });
    const whole = buildMapperPrompt({ ...input, targetFieldKey: null });
    const start = (p: string) => p.slice(0, p.indexOf('\n\nMode:'));
    expect(start(one)).toBe(start(whole));
    expect(start(one)).toBe(fieldsBlock(EVAL_FORM as AgentField[]));
    expect(one).toContain('Mode: single field. The speech is the value for "city" only.');
    expect(one).toContain('- full_name');
    expect(one).toContain('phone = "9876543210"');
  });

  it('names fields a choice hides after the fields, so the start of the prompt stays the same', () => {
    const input = { fields: EVAL_FORM as AgentField[], current: {}, transcript: 'Chennai', targetFieldKey: null };
    const shown = buildMapperPrompt(withShortIds(input).input);
    const hidden = buildMapperPrompt(withShortIds({ ...input, hidden: ['city', 'not_a_field'] }).input);
    const start = (p: string) => p.slice(0, p.indexOf('\n\nMode:'));
    expect(start(hidden)).toBe(start(shown));
    const cityId = `f${EVAL_FORM.findIndex((f) => f.field_key === 'city') + 1}`;
    expect(hidden).toContain(`Not on the form now (another choice on the page hides them): ${cityId}.`);
    expect(shown).not.toContain('Not on the form now');
  });

  it('answers only for the target field in single-field mode, though the prompt lists them all', async () => {
    const ids = withShortIds({ fields: EVAL_FORM, current: {}, transcript: '', targetFieldKey: null }).input.fields;
    const cityId = ids[EVAL_FORM.findIndex((f) => f.field_key === 'city')].field_key;
    const final = {
      values: [
        { field_key: 'f1', value: 'Ramesh Kumar', confidence: 0.9, source_phrase: null, number_parts: null },
        { field_key: 'f2', value: 'x', confidence: 0.9, source_phrase: null, number_parts: null },
        { field_key: cityId, value: 'Chennai', confidence: 0.9, source_phrase: null, number_parts: null },
      ],
    };
    const model = new ScriptedModel([[assistantMessage(JSON.stringify(final))]]);
    const out = await mapTranscript({ fields: EVAL_FORM, current: {}, transcript: 'Chennai', targetFieldKey: 'city' }, { model });
    if (out.empty) throw new Error('empty');
    expect(out.values.map((v) => [v.field_key, v.value])).toEqual([['city', 'Chennai']]);
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

describe('spoken corrections', () => {
  it('shows the mapper what was just said, so "no, Jagan" can find its field', () => {
    const prompt = buildMapperPrompt({
      fields: EVAL_FORM,
      current: { full_name: 'Jahan' },
      transcript: 'illa, Jagan',
      targetFieldKey: null,
      recent: [{ speech: 'Name vandhu Jahan', set: { full_name: 'Jahan' } }],
    });
    expect(prompt).toContain('Recent speech (oldest first):\n- "Name vandhu Jahan" → full_name="Jahan"');
    expect(buildMapperPrompt({ fields: EVAL_FORM, current: {}, transcript: 'x', targetFieldKey: null })).not.toContain('Recent speech');
  });

  it('command-like speech fills nothing (spoken commands were removed)', async () => {
    const model = new ScriptedModel([[assistantMessage(JSON.stringify({ values: [] }))]]);
    const out = await mapTranscript({ fields: EVAL_FORM, current: {}, transcript: 'start over, ellam azhichidunga', targetFieldKey: null }, { model });
    expect(out).toEqual({ empty: false, values: [] });
    expect(mapperInstructions(false)).not.toContain('start_over');
  });
});

describe('model per AI step', () => {
  it('uses the step setting, then AGENT_MODEL, then gpt-5.4-mini at low effort', () => {
    vi.stubEnv('MAPPER_MODEL', '');
    vi.stubEnv('ANALYZER_MODEL', '');
    vi.stubEnv('RESOLVER_MODEL', '');
    vi.stubEnv('AGENT_MODEL', '');
    vi.stubEnv('AGENT_REASONING', '');
    for (const step of ['mapper', 'analyzer', 'resolver'] as const) {
      expect(agentModel(step)).toMatchObject({ model: 'gpt-5.4-mini', modelSettings: { reasoning: { effort: 'low' } } });
    }
    vi.stubEnv('AGENT_MODEL', 'gpt-4.1-mini');
    expect(agentModel('analyzer')).toMatchObject({ model: 'gpt-4.1-mini', modelSettings: { maxTokens: 16_000 } });
    vi.stubEnv('MAPPER_MODEL', 'gpt-5-mini');
    expect(agentModel('mapper')).toMatchObject({ model: 'gpt-5-mini', modelSettings: { reasoning: { effort: 'minimal' } } });
    vi.unstubAllEnvs();
  });
  it('every step has an output-token limit and a timeout, so a runaway reply fails fast', () => {
    expect(agentModel('mapper', 'gpt-4o')).toMatchObject({ model: 'gpt-4o', modelSettings: { maxTokens: 4_000 }, timeoutMs: 30_000 });
    expect(agentModel('analyzer', 'gpt-4o')).toMatchObject({ modelSettings: { maxTokens: 16_000 }, timeoutMs: 90_000 });
    expect(agentModel('resolver', 'gpt-4o')).toMatchObject({ modelSettings: { maxTokens: 2_000 }, timeoutMs: 20_000 });
  });
  it('prompt caching: a cache key per step and form; GPT-5.x keeps the cache up to 24 h', () => {
    expect(agentModel('mapper', 'gpt-5.4-mini@low', 'form1').modelSettings).toMatchObject({
      promptCacheRetention: '24h',
      providerData: { prompt_cache_key: 'mapper:form1' },
    });
    expect(agentModel('analyzer', 'gpt-5.4-mini').modelSettings.providerData).toEqual({ prompt_cache_key: 'analyzer:all' });
    const old = agentModel('mapper', 'gpt-4o', 'form1').modelSettings;
    expect(old.promptCacheRetention).toBeUndefined(); // only GPT-5.x is asked for 24 h
    expect(old.providerData).toEqual({ prompt_cache_key: 'mapper:form1' });
  });
  it('the mapper has no validate_value tool unless asked for', async () => {
    const final = { values: [] };
    const model = new ScriptedModel([[assistantMessage(JSON.stringify(final))]]);
    await mapTranscript({ fields: EVAL_FORM, current: {}, transcript: 'hello', targetFieldKey: null }, { model });
    expect(model.lastCall?.request.tools ?? []).toHaveLength(0);
    expect(JSON.stringify(model.lastCall?.request.systemInstructions)).not.toContain('validate_value');
  });
  it('reasoning models get a low effort; "@" sets it; billing uses the bare model name', () => {
    expect(agentModel('mapper', 'gpt-5.4-mini').modelSettings).toMatchObject({ maxTokens: 4_000, reasoning: { effort: 'low' } });
    expect(agentModel('mapper', 'gpt-5.4-mini@none').modelSettings).toMatchObject({ reasoning: { effort: 'none' } });
    expect(agentModel('mapper', 'gpt-4.1-mini@low').modelSettings.reasoning).toBeUndefined(); // not a reasoning model
    expect(modelName('gpt-5-mini@minimal')).toBe('gpt-5-mini');
    expect(baseModel('gpt-5-mini@minimal')).toBe('gpt-5-mini');
  });
  it('the validate_value rule is in the instructions only when the agent has the tool', () => {
    expect(mapperInstructions(true)).toContain('Call validate_value');
    expect(mapperInstructions(false)).not.toContain('validate_value');
    expect(mapperInstructions(false)).not.toContain('{{');
  });
});

describe("the input's own rules (read from the page, not the AI)", () => {
  const desc = (over: Record<string, unknown>) => FieldDescriptor.parse({ field_key: 'mobile', label: 'Mobile number', field_type: 'text', required: true, ...over });

  it('a number of fixed length gets "N digits" from minlength / maxlength', () => {
    expect(pageRules(desc({ min_length: 10, max_length: 10, inputmode: 'numeric' }))).toEqual({ regex: null, min_length: 10, max_length: 10, format: '10 digits' });
    expect(pageRules(desc({ field_type: 'tel', min_length: 6, max_length: 6 }))?.format).toBe('6 digits');
    expect(pageRules(desc({ max_length: 50 }))).toEqual({ regex: null, min_length: null, max_length: 50, format: null });
    expect(pageRules(desc({}))).toBeNull();
  });

  it("a pattern's title is its format hint", () => {
    expect(pageRules(desc({ pattern: '[6-9][0-9]{9}', title: 'Enter 10 digit mobile number' }))?.format).toBe('Enter 10 digit mobile number');
  });

  it("wins over the AI's rules, which fill in the rest; and is checked after mapping", () => {
    const schema = FormSchema.parse({ page_url: 'https://x.test/', page_title: 'X', fields: [desc({ min_length: 10, max_length: 10, inputmode: 'numeric' })] });
    const ai: FieldAnalysis = {
      field_key: 'mobile', clean_label: 'Mobile number', semantic_type: 'phone', required: true, depends_on: null, step_index: 0,
      output_script: 'en', label_ta: 'கைபேசி எண்', file_rules: null, validation: { regex: '[6-9][0-9]{9}', min_length: null, max_length: 12, format: 'mobile' },
    };
    const [f] = sanitizeAnalysis({ form_purpose: 'X', fields: [ai] }, schema);
    expect(f.validation).toEqual({ regex: '[6-9][0-9]{9}', min_length: 10, max_length: 10, format: '10 digits' });
    const field = { ...schema.fields[0], validation: f.validation, semantic_type: null };
    expect(validateValue(field, '987654321').ok).toBe(false);
    expect(validateValue(field, '9876543210').ok).toBe(true);
  });

  it('tells the mapper the length when there is no format hint', () => {
    const p = buildMapperPrompt({
      fields: [{ field_key: 'acc', label: 'Account number', field_type: 'text', required: false, options: [], validation: { regex: null, min_length: null, max_length: 18, format: null } }],
      current: {}, transcript: 'x', targetFieldKey: null,
    });
    expect(p).toContain('max 18 characters');
  });
});

describe('Tamil-only twins and the site-key hint', () => {
  const twinSchema = FormSchema.parse({
    page_url: 'https://x.test/', page_title: 'CAN',
    fields: [
      { field_key: 'canreg:enappname', label: 'Applicant Name', field_type: 'text', required: true },
      { field_key: 'canreg:tnappname', label: 'விண்ணப்பதாரர் பெயர்', field_type: 'text', required: true },
      { field_key: 'nameA', label: 'பெயர்', field_type: 'text', required: false },
      { field_key: 'nameB', label: 'தந்தை பெயர்', field_type: 'text', required: false },
    ],
  });
  const read = (key: string, clean: string): FieldAnalysis => ({
    field_key: key, clean_label: clean, semantic_type: 'full_name', required: true, validation: null, depends_on: null, step_index: 0,
    output_script: 'en', label_ta: 'பெயர்', file_rules: null,
  });

  it('a Tamil-only label with the same clean label as an English field takes Tamil and says so', () => {
    const out = sanitizeAnalysis(
      { form_purpose: 'CAN', fields: [read('canreg:enappname', 'Applicant name'), read('canreg:tnappname', 'Applicant name'), read('nameA', 'Name'), read('nameB', 'Name')] },
      twinSchema,
    );
    expect(out[0]).toMatchObject({ clean_label: 'Applicant name', output_script: 'en' });
    expect(out[1]).toMatchObject({ clean_label: 'Applicant name in Tamil', output_script: 'ta' });
    // Two Tamil-only fields with the same label are not twins of an English field.
    expect(out[2].output_script).toBe('en');
    expect(out[3].output_script).toBe('en');
  });

  it('keeps a reading the AI already got right', () => {
    const out = sanitizeAnalysis({ form_purpose: 'CAN', fields: [read('canreg:enappname', 'Applicant name'), { ...read('canreg:tnappname', 'Applicant name in Tamil'), output_script: 'ta' }] }, twinSchema);
    expect(out[1]).toMatchObject({ clean_label: 'Applicant name in Tamil', output_script: 'ta' });
  });

  it('shows the site key only when it has words', () => {
    expect(keyHasWords('txtFatherName')).toBe(true);
    expect(keyHasWords('ddl_village')).toBe(true);
    expect(keyHasWords('canreg:enappname')).toBe(true);
    expect(keyHasWords('12330')).toBe(false);
    expect(keyHasWords('radio-group-1790337220827-0')).toBe(false);
    expect(keyHasWords('number-1790528788365-0')).toBe(false);
  });
});

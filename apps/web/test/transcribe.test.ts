import { describe, expect, it } from 'vitest';
import { sanitizeMapping } from '@/lib/agents/guardrails';
import { isPromptEcho, transcriptionPrompt } from '@/lib/agents/transcribe';
import { EVAL_FORM } from '../scripts/eval-fixtures';

const prompt = transcriptionPrompt([]);

describe('isPromptEcho', () => {
  it('flags a transcript that repeats the prompt', () => {
    expect(isPromptEcho(prompt, prompt)).toBe(true);
    expect(isPromptEcho(prompt.slice(0, 100), prompt)).toBe(true);
  });
  it('flags the old long label-list echo seen in production', () => {
    const oldPrompt =
      'Speech may mix Tamil and English (Tanglish). A person is filling a form with: Document type 2, Appellation, Applicant name, Gender, Marital status. Possible answers: Ration card, EPIC Number, PAN Number.';
    expect(isPromptEcho('Document type 2, Appellation, Applicant name, Gender, Marital status. Possible answers: Ration card', oldPrompt)).toBe(true);
  });
  it('keeps real speech, even when it shares a few words with the prompt', () => {
    expect(isPromptEcho('Name vandhu Jahan, father name Jagadheesan, gender male', prompt)).toBe(false);
    expect(isPromptEcho('en peru Kavitha, ooru Madurai', prompt)).toBe(false);
    expect(isPromptEcho('என் பெயர் ஜகன்', prompt)).toBe(false);
    expect(isPromptEcho('', prompt)).toBe(false);
  });
  it('keeps the prompt short and free of form labels', () => {
    expect(prompt.length).toBeLessThan(250);
    expect(transcriptionPrompt(EVAL_FORM)).toBe(prompt);
  });
});

describe('label words are never values', () => {
  it('drops "Name" as the value of a name field but keeps real names', () => {
    const r = sanitizeMapping(
      {
        values: [
          { field_key: 'full_name', value: 'Name', confidence: 0.9, source_phrase: 'Name vandhu Jahan', number_parts: null },
          { field_key: 'city', value: 'City', confidence: 0.9, source_phrase: null, number_parts: null },
          { field_key: 'address', value: 'Jahan', confidence: 0.9, source_phrase: null, number_parts: null },
        ],
        unmapped_speech: null,
        missing_required: [],
      },
      EVAL_FORM,
      null,
    );
    expect(r.values.map((v) => [v.field_key, v.value])).toEqual([['address', 'Jahan']]);
  });
});

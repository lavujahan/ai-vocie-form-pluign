import { describe, expect, it } from 'vitest';
import type { FormSchemaInput } from '@vff/shared';
import { addToRead } from '../src/background/reads';

const field = (field_key: string, label = field_key) => ({ field_key, label, field_type: 'text' as const, required: false, options: [] });
const change = (keys: string[], page = 'https://forms.example.in/step'): FormSchemaInput => ({
  page_url: page,
  page_title: 'Applicant registration',
  html_snippet: '',
  fields: keys.map((k) => field(k)),
});

describe('addToRead (one AI reading for every field that appeared meanwhile)', () => {
  it('keeps only the fields the server added', () => {
    expect(addToRead(null, change(['a', 'b', 'c']), ['a', 'c'])?.fields.map((f) => f.field_key)).toEqual(['a', 'c']);
  });

  it('joins a later change to what already waits', () => {
    const first = addToRead(null, change(['taluk']), ['taluk']);
    const both = addToRead(first, change(['village'], 'https://forms.example.in/step2'), ['village']);
    expect(both?.fields.map((f) => f.field_key)).toEqual(['taluk', 'village']);
    expect(both?.page_url).toBe('https://forms.example.in/step2');
  });

  it('takes the latest details of a field seen again, once', () => {
    const first = addToRead(null, { ...change([]), fields: [field('taluk', 'Taluk')] }, ['taluk']);
    const again = addToRead(first, { ...change([]), fields: [field('taluk', 'Taluk *')] }, ['taluk']);
    expect(again?.fields).toHaveLength(1);
    expect(again?.fields[0].label).toBe('Taluk *');
  });

  it('leaves what waits as it is when nothing new was added', () => {
    const first = addToRead(null, change(['a']), ['a']);
    expect(addToRead(first, change(['b']), [])).toBe(first);
    expect(addToRead(null, change(['b']), [])).toBeNull();
  });
});

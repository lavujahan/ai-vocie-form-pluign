import { afterEach, describe, expect, it } from 'vitest';
import { detect } from '../src/content/detector';
import { diffFields, isNewStep, startWatch, stopWatch } from '../src/content/watch';

const f = (field_key: string, label = field_key, field_type: 'text' | 'select' = 'text') => ({ field_key, label, field_type, required: false });

afterEach(() => stopWatch());

describe('fields that appear later', () => {
  it('finds new keys and lists every field on the page', () => {
    const r = diffFields(new Set(['full_name', 'mobile']), new Set(), [f('mobile'), f('occupation'), f('income')]);
    expect(r.added.map((x) => x.field_key)).toEqual(['occupation', 'income']);
    expect(r.present).toEqual(['mobile', 'occupation', 'income']);
  });

  it('does not treat a position-based key that moved as a new field', () => {
    const r = diffFields(new Set(['path:form>div>input']), new Set(['remarks|text']), [f('path:form>div[1]>input', 'Remarks'), f('path:form>p>input', 'Bank name')]);
    expect(r.added.map((x) => x.label)).toEqual(['Bank name']);
  });

  it('a new step hides most of the fields that were there; a revealed field does not', () => {
    expect(isNewStep(['name', 'mobile', 'other'], ['occupation', 'income'])).toBe(true);
    expect(isNewStep(['name', 'mobile', 'other'], ['name', 'mobile', 'other', 'comm'])).toBe(false);
    expect(isNewStep(['occupation', 'income'], ['occupation', 'income', 'occupation_other'])).toBe(false);
    expect(isNewStep([], ['bank_name'])).toBe(true);
  });

  it('does not add a field revealed by a checkbox (the form keeps its field list), but reports it as present', async () => {
    document.body.innerHTML = `
      <label for="name">Name</label><input id="name" name="name" />
      <label><input id="other" name="other" type="checkbox" /> Different address</label>
      <div id="wrap" hidden><label for="comm">Communication address</label><textarea id="comm" name="comm"></textarea></div>`;
    const changes: { added: string[]; present: string[] }[] = [];
    startWatch(['name', 'other'], () => detect(document).schema, ({ schema, present }) =>
      changes.push({ added: schema.fields.map((x) => x.field_key), present }),
    );
    // The first check runs right away: nothing new, every field reported as present.
    expect(changes).toEqual([{ added: [], present: ['name', 'other'] }]);

    document.getElementById('wrap')!.hidden = false;
    await new Promise((r) => setTimeout(r, 900));
    expect(changes.at(-1)).toEqual({ added: [], present: ['name', 'other', 'comm'] });
  });

  it('adds the fields of the next step', async () => {
    document.body.innerHTML = `
      <div id="s1"><label for="name">Name</label><input id="name" name="name" />
      <label for="mobile">Mobile</label><input id="mobile" name="mobile" /></div>
      <div id="s2" hidden><label for="job">Occupation</label><input id="job" name="job" />
      <label for="income">Income</label><input id="income" name="income" /></div>`;
    const changes: { added: string[]; present: string[] }[] = [];
    startWatch(['name', 'mobile'], () => detect(document).schema, ({ schema, present }) =>
      changes.push({ added: schema.fields.map((x) => x.field_key), present }),
    );
    document.getElementById('s1')!.hidden = true;
    document.getElementById('s2')!.hidden = false;
    await new Promise((r) => setTimeout(r, 900));
    expect(changes.at(-1)).toEqual({ added: ['job', 'income'], present: ['job', 'income'] });
  });
});

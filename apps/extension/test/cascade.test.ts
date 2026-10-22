import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { memory, timing } from '../src/content/cascade';
import { detect } from '../src/content/detector';
import { fillAll } from '../src/content/filler';

/**
 * A State → District → Village form like tnedistrict: each child is disabled and empty until its
 * parent is chosen, then its options arrive after a "server" delay; changing a parent resets children.
 */
const DATA: Record<string, Record<string, string[]>> = {
  TN: { Thiruvallur: ['Ponneri', 'Thulasampatti', 'Thulasampatti Pudur'], Salem: ['Omalur', 'Attur'] },
  KL: { Ernakulam: ['Aluva', 'Kochi'] },
};
const DELAY = 150;

function buildForm() {
  document.body.innerHTML = `
    <form>
      <label for="state">State</label>
      <select id="state"><option value="">Select state</option><option value="TN">Tamil Nadu</option><option value="KL">Kerala</option></select>
      <label for="district">District</label>
      <select id="district" disabled><option value="">Select district</option></select>
      <label for="village">Revenue village</label>
      <select id="village" disabled><option value="">Select village</option></select>
    </form>`;
  const $ = (id: string) => document.getElementById(id) as HTMLSelectElement;
  const load = (sel: HTMLSelectElement, items: string[]) => {
    sel.innerHTML = `<option value="">Select</option>${items.map((i) => `<option value="${i.toLowerCase().replace(/\s/g, '_')}">${i}</option>`).join('')}`;
    sel.disabled = false;
  };
  const reset = (sel: HTMLSelectElement) => {
    sel.innerHTML = '<option value="">Select</option>';
    sel.disabled = true;
  };
  $('state').addEventListener('change', () => {
    reset($('district'));
    reset($('village'));
    const st = $('state').value;
    if (st) setTimeout(() => load($('district'), Object.keys(DATA[st])), DELAY);
  });
  $('district').addEventListener('change', () => {
    reset($('village'));
    const st = $('state').value;
    const label = $('district').selectedOptions[0]?.textContent ?? '';
    if (label && DATA[st]?.[label]) setTimeout(() => load($('village'), DATA[st][label]), DELAY);
  });
  return $;
}

const sel = (id: string) => document.getElementById(id) as HTMLSelectElement;
const shown = (id: string) => sel(id).selectedOptions[0]?.textContent ?? '';

beforeEach(() => {
  memory.learned.clear();
  memory.remembered.clear();
  timing.optionsWaitMs = 1500;
  timing.noticeMs = 600;
});
afterEach(() => vi.restoreAllMocks());

describe('cascading dropdowns', () => {
  it('detects children as dynamic and fills the chain in order, waiting for each list', async () => {
    buildForm();
    const { schema, registry } = detect(document);
    const byKey = Object.fromEntries(schema.fields.map((f) => [f.field_key, f]));
    expect(byKey.district.dynamic_options).toBe(true);
    expect(byKey.village.dynamic_options).toBe(true);
    expect(byKey.state.dynamic_options).toBe(false);

    const report = await fillAll({ state: 'Tamil Nadu', district: 'Tiruvallur', village: 'Ponneri' }, registry, { settleMs: 0 });
    expect([shown('state'), shown('district'), shown('village')]).toEqual(['Tamil Nadu', 'Thiruvallur', 'Ponneri']);
    expect(report.filled).toEqual(['state', 'district', 'village']);
    expect(report.unresolved).toBeUndefined();
    // Learned which dropdown feeds which, and reported the lists that loaded.
    expect(memory.learned.get('district')).toBe('state');
    expect(memory.learned.get('village')).toBe('district');
    expect(report.options?.village?.map((o) => o.label)).toEqual(['Ponneri', 'Thulasampatti', 'Thulasampatti Pudur']);
  });

  it('asks the AI resolver when unsure, and reports an ambiguous answer for the phone picker', async () => {
    buildForm();
    const { registry } = detect(document);
    const resolve = vi.fn(async (key: string) =>
      key === 'district'
        ? { choice: 'Thiruvallur', ambiguous: false, top: ['Thiruvallur'] }
        : { choice: null, ambiguous: true, top: ['Thulasampatti', 'Thulasampatti Pudur'] },
    );
    const report = await fillAll(
      { state: 'Tamil Nadu', district: 'tiru valloor district', village: 'Tulasam' },
      registry,
      { settleMs: 0, resolve },
    );
    expect(shown('district')).toBe('Thiruvallur');
    expect(resolve).toHaveBeenCalledWith('district', 'tiru valloor district', expect.any(Array));
    expect(sel('village').value).toBe('');
    expect(report.unresolved).toEqual([
      { field_key: 'village', spoken: 'Tulasam', top: ['Thulasampatti', 'Thulasampatti Pudur'], reason: 'ambiguous' },
    ]);
    expect(report.skipped.map((s) => s.field_key)).toEqual(['village']);
  });

  it('re-checks children when the parent changes later, and asks again for ones that no longer fit', async () => {
    buildForm();
    const { registry } = detect(document);
    await fillAll({ state: 'Tamil Nadu', district: 'Thiruvallur', village: 'Ponneri' }, registry, { settleMs: 0 });

    // A later utterance changes only the State.
    const report = await fillAll({ state: 'Kerala' }, registry, { settleMs: 0 });
    expect(shown('state')).toBe('Kerala');
    expect(sel('district').value).toBe('');
    const reasons = Object.fromEntries((report.unresolved ?? []).map((u) => [u.field_key, u.reason]));
    expect(reasons).toEqual({ district: 'parent_changed', village: 'parent_changed' });
  });

  it('keeps a child value that is still valid after the parent is set again', async () => {
    buildForm();
    const { registry } = detect(document);
    await fillAll({ state: 'Tamil Nadu', district: 'Salem', village: 'Omalur' }, registry, { settleMs: 0 });
    await fillAll({ state: 'Kerala' }, registry, { settleMs: 0 });
    const back = await fillAll({ state: 'Tamil Nadu' }, registry, { settleMs: 0 });
    // Salem and Omalur were remembered and are valid again under Tamil Nadu.
    expect([shown('district'), shown('village')]).toEqual(['Salem', 'Omalur']);
    expect(back.unresolved).toBeUndefined();
  });

  it('follows a dropdown that the page replaces when reloading its options (JSF / AJAX re-render)', async () => {
    document.body.innerHTML = `
      <label for="canreg:cdistrictid">District</label>
      <select id="canreg:cdistrictid"><option value="">Select</option><option value="7">Salem</option></select>
      <span id="talukWrap"><label for="canreg:ctalukaid">Taluk</label><select id="canreg:ctalukaid" disabled><option value="">Select</option></select></span>`;
    document.getElementById('canreg:cdistrictid')!.addEventListener('change', () => {
      // Like a JSF partial update: the whole Taluk <select> element is swapped for a new one.
      setTimeout(() => {
        document.getElementById('talukWrap')!.innerHTML =
          '<label for="canreg:ctalukaid">Taluk</label><select id="canreg:ctalukaid"><option value="">Select</option><option value="71">Omalur</option><option value="72">Attur</option></select>';
      }, DELAY);
    });
    const { registry } = detect(document);
    const report = await fillAll({ 'canreg:cdistrictid': 'Salem', 'canreg:ctalukaid': 'Omaloor' }, registry, { settleMs: 0 });
    expect(report.filled).toEqual(['canreg:cdistrictid', 'canreg:ctalukaid']);
    expect((document.getElementById('canreg:ctalukaid') as HTMLSelectElement).selectedOptions[0].textContent).toBe('Omalur');
  });

  it('reports a dropdown whose options never load, instead of hanging', async () => {
    buildForm();
    const { registry } = detect(document);
    const report = await fillAll({ village: 'Ponneri' }, registry, { settleMs: 0 });
    expect(report.unresolved).toEqual([{ field_key: 'village', spoken: 'Ponneri', top: [], reason: 'not_loaded' }]);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { memory, timing } from '../src/content/cascade';
import { detect } from '../src/content/detector';
import { fillAll, undoAll } from '../src/content/filler';

/**
 * Hand-built WAI-ARIA comboboxes (the APG patterns), standing in for libraries we don't load in jsdom:
 * a select-only one (div role=combobox + listbox) and an editable one whose options load while typing.
 */
function buildForm() {
  document.body.innerHTML = `
    <form>
      <span id="bg-label">Blood group</span>
      <div class="wrap">
        <div id="bg" role="combobox" tabindex="0" aria-labelledby="bg-label" aria-expanded="false" aria-controls="bg-list">Select</div>
        <input type="hidden" name="blood_group" value="" />
        <ul id="bg-list" role="listbox" hidden>
          <li role="option" data-value="">None</li>
          <li role="option" data-value="A+">A+</li>
          <li role="option" data-value="B+">B+</li>
          <li role="option" data-value="O+">O+</li>
          <li role="option" data-value="AB+">AB+</li>
        </ul>
      </div>
      <label for="city">City</label>
      <input id="city" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="city-list" />
      <ul id="city-list" role="listbox" hidden></ul>
    </form>`;
  const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

  // Select-only: click toggles the list; clicking an option picks it.
  const bg = $('bg');
  const list = $('bg-list');
  const hidden = document.querySelector<HTMLInputElement>('input[name="blood_group"]')!;
  const setOpen = (on: boolean) => {
    list.hidden = !on;
    bg.setAttribute('aria-expanded', String(on));
  };
  bg.addEventListener('click', () => setOpen(list.hidden));
  list.addEventListener('click', (e) => {
    const li = (e.target as HTMLElement).closest('li')!;
    hidden.value = li.dataset.value ?? '';
    bg.textContent = hidden.value ? li.textContent : 'Select';
    setOpen(false);
  });

  // Editable: options come "from the server" 100 ms after typing.
  const CITIES = ['Chennai', 'Coimbatore', 'Salem', 'Tiruchirappalli'];
  const city = $<HTMLInputElement>('city');
  const cityList = $('city-list');
  const show = (items: string[]) => {
    cityList.innerHTML = items.map((c) => `<li role="option">${c}</li>`).join('');
    cityList.hidden = !items.length;
    city.setAttribute('aria-expanded', String(!!items.length));
  };
  city.addEventListener('input', () => {
    const q = city.value.toLowerCase();
    setTimeout(() => show(CITIES.filter((c) => c.toLowerCase().includes(q))), 100);
  });
  cityList.addEventListener('click', (e) => {
    city.value = (e.target as HTMLElement).textContent ?? '';
    show([]);
  });
  return { hidden, city };
}

beforeEach(async () => {
  await undoAll(); // forget Undo history from the previous test's page
  memory.learned.clear();
  memory.remembered.clear();
  timing.optionsWaitMs = 1500;
});

describe('custom dropdowns (WAI-ARIA combobox)', () => {
  it('detects them as dropdown fields with their labels, not as text boxes', () => {
    buildForm();
    const { schema } = detect(document);
    expect(schema.fields.map((f) => [f.field_key, f.label, f.field_type, f.dynamic_options])).toEqual([
      ['blood_group', 'Blood group', 'select', true],
      ['city', 'City', 'select', true],
    ]);
  });

  it('opens, picks and checks: a select-only list and a list that loads while typing', async () => {
    const { hidden, city } = buildForm();
    const { registry } = detect(document);
    const report = await fillAll({ blood_group: 'AB+', city: 'Coimbatore' }, registry, { settleMs: 0 });
    expect(report.skipped).toEqual([]);
    expect(hidden.value).toBe('AB+');
    expect(city.value).toBe('Coimbatore');
    // Options seen while filling are reported for the phone picker.
    expect(report.options?.blood_group?.map((o) => o.label)).toEqual(['None', 'A+', 'B+', 'O+', 'AB+']);
  });

  it('keeps typed text in a plain autocomplete when nothing in the list matches', async () => {
    const { city } = buildForm();
    const { registry } = detect(document);
    const report = await fillAll({ city: 'Hosur' }, registry, { settleMs: 0 });
    expect(report.filled).toEqual(['city']);
    expect(city.value).toBe('Hosur');
  });

  it('asks the AI resolver when unsure, and sends an unresolved choice to the phone', async () => {
    const { hidden } = buildForm();
    const { registry } = detect(document);
    // Nothing close in the list: the AI is asked, and says it isn't there.
    const resolve = vi.fn(async () => ({ choice: null, ambiguous: false, top: [] }));
    const report = await fillAll({ blood_group: 'Bombay group' }, registry, { settleMs: 0, resolve });
    expect(resolve).toHaveBeenCalledWith('blood_group', 'Bombay group', expect.any(Array));
    expect(hidden.value).toBe('');
    expect(report.unresolved).toEqual([{ field_key: 'blood_group', spoken: 'Bombay group', top: [], reason: 'no_match' }]);
  });

  it('clears through the empty option, and Undo restores the earlier state', async () => {
    const { hidden } = buildForm();
    const { registry } = detect(document);
    await fillAll({ blood_group: 'O+' }, registry, { settleMs: 0 });
    expect(hidden.value).toBe('O+');
    await fillAll({ blood_group: null }, registry, { settleMs: 0 });
    expect(hidden.value).toBe('');
    await fillAll({ blood_group: 'B+' }, registry, { settleMs: 0 });
    await undoAll();
    expect(hidden.value).toBe('');
  });
});

import { createElement, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { describe, expect, it } from 'vitest';
import { detect } from '../src/content/detector';
import { fillAll, undoAll } from '../src/content/filler';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const FORM = `
  <form>
    <label for="name">Full name</label><input id="name">
    <label for="dob">Date of birth</label><input id="dob" type="date">
    <label for="dob2">Joining date</label><input id="dob2" placeholder="DD/MM/YYYY">
    <label for="age">Age</label><input id="age" type="number">
    <label for="state">State</label>
    <select id="state"><option value="">Select</option><option value="TN">Tamil Nadu</option><option value="KL">Kerala</option></select>
    <fieldset><legend>Gender</legend>
      <label><input type="radio" name="gender" value="m"> Male</label>
      <label><input type="radio" name="gender" value="f"> Female</label>
    </fieldset>
    <label><input type="checkbox" name="c" value="sms"> SMS</label>
    <label><input type="checkbox" name="c" value="email"> Email</label>
    <label><input type="checkbox" id="terms"> I agree</label>
    <label for="addr">Address</label><textarea id="addr"></textarea>
    <div id="bio" contenteditable="true" aria-label="Bio"></div>
  </form>`;

const $ = <T extends Element>(sel: string) => document.querySelector(sel) as T;

describe('fillAll', () => {
  it('fills every supported field type and reports skips', async () => {
    document.body.innerHTML = FORM;
    const { registry } = detect(document);
    const events: string[] = [];
    $('#name').addEventListener('input', () => events.push('input'));
    $('#name').addEventListener('change', () => events.push('change'));

    const report = await fillAll(
      {
        name: 'Ramesh Kumar',
        dob: '15/03/1990',
        dob2: '2024-01-05',
        age: '34 years',
        state: 'tamilnadu',
        gender: 'Female',
        c: 'Email, SMS',
        terms: 'true',
        addr: '12 Gandhi Street',
        bio: 'Hello',
        missing: 'x',
      },
      registry,
      { settleMs: 0 },
    );

    expect($<HTMLInputElement>('#name').value).toBe('Ramesh Kumar');
    expect(events).toEqual(['input', 'change']);
    expect($<HTMLInputElement>('#dob').value).toBe('1990-03-15');
    expect($<HTMLInputElement>('#dob2').value).toBe('05/01/2024');
    expect($<HTMLInputElement>('#age').value).toBe('34');
    expect($<HTMLSelectElement>('#state').value).toBe('TN');
    expect($<HTMLInputElement>('input[value="f"]').checked).toBe(true);
    expect($<HTMLInputElement>('input[value="sms"]').checked).toBe(true);
    expect($<HTMLInputElement>('input[value="email"]').checked).toBe(true);
    expect($<HTMLInputElement>('#terms').checked).toBe(true);
    expect($<HTMLTextAreaElement>('#addr').value).toBe('12 Gandhi Street');
    expect($('#bio').textContent).toBe('Hello');
    expect(report.skipped).toEqual([{ field_key: 'missing', reason: 'Field not found on the page' }]);

    // Latest-wins re-fill, then a non-matching option.
    const again = await fillAll({ gender: 'Male', state: 'Goa' }, registry, { settleMs: 0 });
    expect($<HTMLInputElement>('input[value="m"]').checked).toBe(true);
    expect($<HTMLInputElement>('input[value="f"]').checked).toBe(false);
    expect(again.skipped[0]).toMatchObject({ field_key: 'state' });

    // Undo goes back to the original, empty form.
    await undoAll();
    expect($<HTMLInputElement>('#name').value).toBe('');
    expect($<HTMLSelectElement>('#state').value).toBe('');
    expect($<HTMLInputElement>('input[value="m"]').checked).toBe(false);
    expect($<HTMLInputElement>('input[value="sms"]').checked).toBe(false);
    expect($<HTMLInputElement>('#terms').checked).toBe(false);
  });

  it('updates React controlled-input state', async () => {
    document.body.innerHTML = '<div id="root"></div>';
    function App() {
      const [name, setName] = useState('');
      const [state, setState] = useState('');
      return createElement(
        'form',
        null,
        createElement('label', { htmlFor: 'n' }, 'Name'),
        createElement('input', { id: 'n', value: name, onChange: (e: { target: { value: string } }) => setName(e.target.value) }),
        createElement(
          'select',
          { id: 's', value: state, onChange: (e: { target: { value: string } }) => setState(e.target.value) },
          createElement('option', { value: '' }, 'Select'),
          createElement('option', { value: 'KL' }, 'Kerala'),
        ),
        createElement('output', { id: 'echo' }, `${name}|${state}`),
      );
    }
    const root = createRoot($('#root'));
    await act(async () => root.render(createElement(App)));

    const { registry } = detect(document);
    await act(async () => {
      await fillAll({ n: 'Priya', s: 'Kerala' }, registry, { settleMs: 0 });
    });
    expect($('#echo').textContent).toBe('Priya|KL');
    root.unmount();
  });

  it('fills fields that appear after a parent is filled (re-detect)', async () => {
    document.body.innerHTML = `<label for="has">Has GST?</label><input type="checkbox" id="has"><div id="slot"></div>`;
    $('#has').addEventListener('change', () => {
      $('#slot').innerHTML = '<label for="gst">GST number</label><input id="gst">';
    });
    const { registry } = detect(document);
    const report = await fillAll({ has: 'true', gst: '33ABCDE1234F1Z5' }, registry, {
      settleMs: 0,
      redetect: () => detect(document).registry,
    });
    expect(report.filled).toEqual(['has', 'gst']);
    expect($<HTMLInputElement>('#gst').value).toBe('33ABCDE1234F1Z5');
  });
});

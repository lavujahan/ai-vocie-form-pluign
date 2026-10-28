import { beforeEach, describe, expect, it } from 'vitest';
import { detect, resolveLabel } from '../src/content/detector';

function page(html: string) {
  document.body.innerHTML = html;
  document.title = 'Customer onboarding';
}

describe('label resolution', () => {
  beforeEach(() => (document.body.innerHTML = ''));

  it('uses label[for], wrapping label, aria-label, aria-labelledby, placeholder, nearby text in that order', () => {
    page(`
      <label for="a">Full name *</label><input id="a">
      <label>Email <input id="b" type="email"></label>
      <input id="c" aria-label="Mobile number">
      <span id="lbl">City</span><input id="d" aria-labelledby="lbl">
      <input id="e" placeholder="PIN code">
      <div><span>GST number</span><input id="f"></div>
      <label>Country <select id="g"><option>India</option><option>Nepal</option></select></label>
    `);
    const lbl = (id: string) => resolveLabel(document.getElementById(id)!);
    expect(lbl('a')).toBe('Full name');
    expect(lbl('b')).toBe('Email');
    expect(lbl('c')).toBe('Mobile number');
    expect(lbl('d')).toBe('City');
    expect(lbl('e')).toBe('PIN code');
    expect(lbl('f')).toBe('GST number');
    expect(lbl('g')).toBe('Country'); // option text excluded
  });
});

describe('detect', () => {
  it('builds a schema with types, required flags, options and groups', () => {
    page(`
      <form>
        <h2>Customer onboarding</h2>
        <label for="name">Full name *</label><input id="name" name="full_name">
        <label for="email">Email</label><input id="email" type="email" required>
        <label for="dob">Date of birth</label><input id="dob" type="date" min="1900-01-01">
        <label for="state">State</label>
        <select id="state"><option value="">Select state</option><option value="TN">Tamil Nadu</option><option value="KL">Kerala</option></select>
        <fieldset><legend>Gender</legend>
          <label><input type="radio" name="gender" value="m"> Male</label>
          <label><input type="radio" name="gender" value="f"> Female</label>
        </fieldset>
        <div>Contact me by</div>
        <label><input type="checkbox" name="contact" value="sms"> SMS</label>
        <label><input type="checkbox" name="contact" value="email"> Email</label>
        <label><input type="checkbox" name="terms" id="terms"> I agree to the terms</label>
        <textarea name="address" placeholder="Address"></textarea>
        <input type="hidden" name="csrf_token" value="x">
        <input type="password" name="pw">
        <input name="ghost" style="display:none">
        <input name="locked" disabled>
        <button type="submit">Save</button>
      </form>
    `);
    const { schema, registry } = detect(document);
    const byKey = Object.fromEntries(schema.fields.map((f) => [f.field_key, f]));

    expect(Object.keys(byKey)).toEqual(['name', 'email', 'dob', 'state', 'gender', 'contact', 'terms', 'address']);
    expect(byKey.name).toMatchObject({ label: 'Full name', field_type: 'text', required: true });
    expect(byKey.email).toMatchObject({ field_type: 'email', required: true });
    expect(byKey.dob).toMatchObject({ field_type: 'date', min: '1900-01-01' });
    expect(byKey.state.options).toEqual([
      { value: 'TN', label: 'Tamil Nadu' },
      { value: 'KL', label: 'Kerala' },
    ]);
    expect(byKey.gender).toMatchObject({ label: 'Gender', field_type: 'radio', group_key: 'Gender' });
    expect(byKey.gender.options).toEqual([
      { value: 'm', label: 'Male' },
      { value: 'f', label: 'Female' },
    ]);
    expect(byKey.contact).toMatchObject({ label: 'Contact me by', field_type: 'checkbox', multiple: true });
    expect(byKey.terms).toMatchObject({ label: 'I agree to the terms', field_type: 'checkbox' });
    expect(byKey.address).toMatchObject({ label: 'Address', field_type: 'textarea' });
    expect(schema.form_title).toBe('Customer onboarding');
    expect(registry.get('gender')?.group).toHaveLength(2);
  });

  it('produces stable, unique keys', () => {
    page(`<div><input placeholder="One"></div><div><input placeholder="Two"></div><input name="dup"><input name="dup">`);
    const keys = detect(document).schema.fields.map((f) => f.field_key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toContain('dup');
    expect(keys).toContain('dup#2');
    expect(detect(document).schema.fields.map((f) => f.field_key)).toEqual(keys);
  });

  it('finds fields inside open shadow roots and same-origin iframes', () => {
    page(`<div id="host"></div><iframe id="fr"></iframe>`);
    const shadow = document.getElementById('host')!.attachShadow({ mode: 'open' });
    shadow.innerHTML = `<label for="s1">Company</label><input id="s1">`;
    const frameDoc = (document.getElementById('fr') as HTMLIFrameElement).contentDocument!;
    frameDoc.body.innerHTML = `<label for="f1">Occupation</label><input id="f1">`;
    const labels = detect(document).schema.fields.map((f) => f.label);
    expect(labels).toEqual(expect.arrayContaining(['Company', 'Occupation']));
  });
});

describe("the input's own rules and help text", () => {
  it('reads maxlength, minlength, title and inputmode', () => {
    page(`
      <label for="m">Mobile</label><input id="m" maxlength="10" minlength="10" inputmode="numeric" pattern="[6-9][0-9]{9}" title="Enter 10 digit mobile number">
      <label for="n">Name</label><input id="n">
    `);
    const [m, n] = detect().schema.fields;
    expect(m).toMatchObject({ max_length: 10, min_length: 10, inputmode: 'numeric', title: 'Enter 10 digit mobile number' });
    expect(n).toMatchObject({ max_length: null, min_length: null, inputmode: null, title: null });
  });

  it('takes the short text right after a field as its help, never the next field\'s label', () => {
    page(`
      <div><label for="a">Aadhaar</label><input id="a"><small>12 digits, no spaces</small></div>
      <div><label for="p">PIN</label><input id="p"> (6 digits)</div>
      <div><label for="b">Name</label><input id="b"></div>
      <div><label for="c">City</label><input id="c"></div>
      <label><input id="t" type="checkbox"> I agree</label>
    `);
    const byKey = Object.fromEntries(detect().schema.fields.map((f) => [f.field_key, f]));
    expect(byKey.a.context).toBe('12 digits, no spaces');
    expect(byKey.p.context).toBe('(6 digits)');
    expect(byKey.b.context).toBeNull();
    expect(byKey.t.context).toBeNull();
  });

  it('prefers the help the site links with aria-describedby', () => {
    page(`<label for="e">Email</label><input id="e" aria-describedby="eh"><small>other text</small><p id="eh">We send the receipt here</p>`);
    expect(detect().schema.fields[0].context).toBe('We send the receipt here');
  });
});

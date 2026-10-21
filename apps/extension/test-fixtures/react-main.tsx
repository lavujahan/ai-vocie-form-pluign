import { useState } from 'react';
import { createRoot } from 'react-dom/client';

const initial = {
  full_name: '',
  email: '',
  phone: '',
  age: '',
  dob: '',
  state: '',
  gender: '',
  contact: [] as string[],
  terms: false,
  address: '',
};

function App() {
  const [form, setForm] = useState(initial);
  const set = <K extends keyof typeof initial>(k: K, v: (typeof initial)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const text = (k: 'full_name' | 'email' | 'phone' | 'age' | 'dob' | 'address') => ({
    id: k,
    name: k,
    value: form[k],
    onChange: (e: { target: { value: string } }) => set(k, e.target.value),
  });

  return (
    <form onSubmit={(e) => e.preventDefault()}>
      <h2>Customer onboarding</h2>
      <label htmlFor="full_name">Full name *</label>
      <input {...text('full_name')} required />
      <label htmlFor="email">Email</label>
      <input {...text('email')} type="email" />
      <label htmlFor="phone">Mobile number</label>
      <input {...text('phone')} type="tel" />
      <label htmlFor="age">Age</label>
      <input {...text('age')} type="number" />
      <label htmlFor="dob">Date of birth</label>
      <input {...text('dob')} type="date" />
      <label htmlFor="state">State</label>
      <select id="state" name="state" value={form.state} onChange={(e) => set('state', e.target.value)}>
        <option value="">Select state</option>
        <option value="TN">Tamil Nadu</option>
        <option value="KL">Kerala</option>
      </select>
      <fieldset>
        <legend>Gender</legend>
        {[
          ['m', 'Male'],
          ['f', 'Female'],
        ].map(([v, l]) => (
          <label key={v}>
            <input type="radio" name="gender" value={v} checked={form.gender === v} onChange={() => set('gender', v)} /> {l}
          </label>
        ))}
      </fieldset>
      <fieldset>
        <legend>Contact me by</legend>
        {[
          ['sms', 'SMS'],
          ['email', 'Email'],
        ].map(([v, l]) => (
          <label key={v}>
            <input
              type="checkbox"
              name="contact"
              value={v}
              checked={form.contact.includes(v)}
              onChange={(e) => set('contact', e.target.checked ? [...form.contact, v] : form.contact.filter((x) => x !== v))}
            />{' '}
            {l}
          </label>
        ))}
      </fieldset>
      <label>
        <input type="checkbox" id="terms" name="terms" checked={form.terms} onChange={(e) => set('terms', e.target.checked)} /> I agree to the
        terms
      </label>
      <label htmlFor="address">Address</label>
      <textarea {...text('address')} />
      <pre id="state-echo" data-vff-ignore="">{JSON.stringify(form)}</pre>
    </form>
  );
}

createRoot(document.getElementById('root')!).render(<App />);

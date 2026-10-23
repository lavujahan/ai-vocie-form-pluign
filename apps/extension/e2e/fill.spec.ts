import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, expect, test, type BrowserContext, type Worker } from '@playwright/test';
import type { FormSchemaInput } from '@vff/shared';
import { MOVED_REASON, type FillResult } from '../src/messages';

// Loads the built, unpacked extension (run `pnpm build` first; `pnpm e2e` does both)
// and drives the real content script through the service worker, like the popup does.

const EXT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');
const BASE = 'http://localhost:5174';

let context: BrowserContext;
let sw: Worker;

test.beforeAll(async () => {
  context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless: true,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  });
  sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
});

test.afterAll(async () => context?.close());

/** Sends a message to the content script in the newest tab (the extension has no `tabs` permission to query by URL). */
async function toContent<T>(_url: string, msg: unknown): Promise<T> {
  return sw.evaluate(async (msg) => {
    const tabs = await chrome.tabs.query({});
    const newest = tabs.reduce((a, b) => ((b.id ?? 0) > (a.id ?? 0) ? b : a));
    return chrome.tabs.sendMessage(newest.id!, msg);
  }, msg) as Promise<T>;
}

const VALUES = {
  full_name: 'Ramesh Kumar',
  email: 'ramesh@gmail.com',
  phone: '9876543210',
  dob: '15 March 1990',
  state: 'Tamil Nadu',
  gender: 'Male',
  contact: 'SMS, Email',
  terms: 'true',
  address: '12 Gandhi Street',
};

for (const name of ['vanilla', 'react', 'vue'] as const) {
  test(`${name}: detect, fill, undo`, async () => {
    const url = `${BASE}/${name}.html`;
    const page = await context.newPage();
    await page.goto(url);
    await page.waitForSelector('#full_name');

    const { schema } = await toContent<{ schema: FormSchemaInput }>(url, { type: 'SCAN' });
    const keys = schema.fields.map((f) => f.field_key);
    expect(keys).toEqual(expect.arrayContaining(['full_name', 'email', 'phone', 'dob', 'state', 'gender', 'contact', 'terms', 'address']));
    expect(keys).not.toContain('csrf_token');

    const report = await toContent<FillResult>(url, { type: 'FILL', values: VALUES, highlight: true });
    expect(report.skipped).toEqual([]);

    await expect(page.locator('#full_name')).toHaveValue('Ramesh Kumar');
    await expect(page.locator('#dob')).toHaveValue('1990-03-15');
    await expect(page.locator('#state')).toHaveValue('TN');
    await expect(page.locator('input[name=gender][value=m]')).toBeChecked();
    await expect(page.locator('input[name=contact][value=email]')).toBeChecked();
    await expect(page.locator('#terms')).toBeChecked();

    if (name !== 'vanilla') {
      // Framework state really changed, not just the DOM.
      const echo = JSON.parse((await page.locator('#state-echo').textContent()) ?? '{}');
      expect(echo).toMatchObject({
        full_name: 'Ramesh Kumar',
        email: 'ramesh@gmail.com',
        dob: '1990-03-15',
        state: 'TN',
        gender: 'm',
        terms: true,
        address: '12 Gandhi Street',
      });
      expect([...echo.contact].sort()).toEqual(['email', 'sms']);
    }

    // A newer value for an already-filled field overwrites it (latest wins).
    await toContent(url, { type: 'FILL', values: { full_name: 'Priya S' } });
    await expect(page.locator('#full_name')).toHaveValue('Priya S');

    await toContent(url, { type: 'UNDO' });
    await expect(page.locator('#full_name')).toHaveValue('');
    await expect(page.locator('#state')).toHaveValue('');
    await expect(page.locator('#terms')).not.toBeChecked();
    if (name !== 'vanilla') {
      const echo = JSON.parse((await page.locator('#state-echo').textContent()) ?? '{}');
      expect(echo).toMatchObject({ full_name: '', state: '', terms: false });
    }
    await page.close();
  });
}

test('two tabs fill independently, and a tab on another site refuses to fill', async () => {
  const first = await context.newPage();
  await first.goto(`${BASE}/vanilla.html`);
  await first.waitForSelector('#full_name');
  const second = await context.newPage();
  await second.goto(`${BASE}/react.html`);
  await second.waitForSelector('#full_name');

  // Like the service worker: each session fills its own tab, by tab id (0 = older tab, 1 = newer).
  const fillTab = (which: 0 | 1, msg: unknown) =>
    sw.evaluate(
      async ({ which, msg }) => {
        const ids = (await chrome.tabs.query({})).map((t) => t.id!).sort((a, b) => a - b);
        return chrome.tabs.sendMessage(ids[ids.length - 2 + which], msg);
      },
      { which, msg },
    ) as Promise<FillResult>;

  const site = BASE;
  await fillTab(0, { type: 'FILL', values: { full_name: 'Applicant One' }, site });
  await fillTab(1, { type: 'FILL', values: { full_name: 'Applicant Two' }, site });
  await expect(first.locator('#full_name')).toHaveValue('Applicant One');
  await expect(second.locator('#full_name')).toHaveValue('Applicant Two');

  // The session was scanned on another site: the page must not be filled.
  const refused = await fillTab(0, { type: 'FILL', values: { full_name: 'Wrong' }, site: 'https://elsewhere.example' });
  expect(refused.filled).toEqual([]);
  expect(refused.skipped[0].reason).toBe(MOVED_REASON);
  await expect(first.locator('#full_name')).toHaveValue('Applicant One');
  await first.close();
  await second.close();
});

test('Start over (phone and computer): empty values clear the form, cascading dropdowns included', async () => {
  const url = `${BASE}/cascade.html`;
  const page = await context.newPage();
  await page.goto(url);
  await page.waitForSelector('#state');
  await toContent(url, { type: 'SCAN' });
  await toContent(url, { type: 'FILL', values: { state: 'Tamil Nadu', district: 'Thiruvallur', village: 'Ponneri' } });
  await expect(page.locator('#village option:checked')).toHaveText('Ponneri');

  // When there is nothing to undo (the page reloaded since the fill), the worker sends the filled
  // fields as empty values.
  const cleared = await toContent<FillResult>(url, { type: 'FILL', values: { state: null, district: null, village: null }, site: BASE });
  expect(cleared.skipped).toEqual([]);
  await expect(page.locator('#state')).toHaveValue('');
  await expect(page.locator('#district')).toHaveValue('');
  await expect(page.locator('#village')).toHaveValue('');

  // A fresh fill afterwards (the next applicant) works as before.
  await toContent(url, { type: 'FILL', values: { state: 'Tamil Nadu', district: 'Salem', village: 'Omalur' } });
  await expect(page.locator('#village option:checked')).toHaveText('Omalur');
  await page.close();
});

test('custom dropdowns: react-select, MUI, choices.js and select2 fill like a user picking', async () => {
  test.setTimeout(90_000);
  const url = `${BASE}/dropdowns.html`;
  const page = await context.newPage();
  await page.goto(url);
  await page.waitForSelector('#district-input');
  await page.waitForSelector('.choices');
  const echo = async () => JSON.parse((await page.locator('#state-echo').textContent()) ?? '{}');

  const { schema } = await toContent<{ schema: FormSchemaInput }>(url, { type: 'SCAN' });
  const byKey = Object.fromEntries(schema.fields.map((f) => [f.field_key, f]));
  // Every widget is one dropdown field with its real label (no stray text fields for their inner inputs).
  expect(Object.keys(byKey).sort()).toEqual(['community', 'district', 'gender', 'languages', 'relationship', 'religion', 'taluk', 'village']);
  for (const f of schema.fields) expect(f.field_type).toBe('select');
  expect(byKey.district.label).toBe('District');
  expect(byKey.gender.label).toBe('Gender');
  expect(byKey.village.label).toBe('Revenue village');
  expect(byKey.relationship.options?.map((o) => o.label)).toEqual(['Father', 'Mother', 'Husband', 'Guardian']);
  expect(byKey.taluk.dynamic_options).toBe(true);
  // Multi-select is known when scanning, so the AI gets "(multiple)" for it.
  expect(byKey.languages.multiple).toBe(true);
  expect(byKey.district.multiple).toBe(false);

  const report = await toContent<FillResult>(url, {
    type: 'FILL',
    values: {
      district: 'Salem',
      languages: 'Tamil, English',
      taluk: 'Omaloor', // the widget's own search finds nothing for this spelling: the full list is used
      community: 'MBC',
      gender: 'Female',
      relationship: 'Guardian',
      religion: 'Christian',
      village: 'Thulasampatti Pudur',
    },
  });
  expect(report.skipped).toEqual([]);
  expect(await echo()).toMatchObject({
    district: 'salem',
    languages: ['tamil', 'english'],
    taluk: 'omalur',
    community: 'MBC',
    gender: 'F',
    relationship: 'G',
    religion: 'CH',
    village: 'V3',
  });
  // Lists that loaded while filling are reported, for the phone's "Pick one" picker.
  expect(report.options?.taluk?.map((o) => o.label)).toContain('Omalur');

  // Undo puts every widget back to empty.
  await toContent(url, { type: 'UNDO' });
  expect(await echo()).toMatchObject({ district: '', languages: [], taluk: '', community: '', gender: '', relationship: '', religion: '', village: '' });
  await page.close();
});

test('multi-step form: fields that appear later are reported (next step, revealed field, next page)', async () => {
  // Capture what the page watcher sends to the worker (the worker itself ignores tabs without a session).
  await sw.evaluate(() => {
    const g = globalThis as unknown as { __changes: unknown[]; __listening?: boolean };
    g.__changes = [];
    if (!g.__listening) {
      chrome.runtime.onMessage.addListener((m: { type?: string }) => {
        if (m?.type === 'FIELDS_CHANGED') g.__changes.push(m);
      });
      g.__listening = true;
    }
  });
  type Change = { schema: FormSchemaInput; present: string[] };
  const lastChange = () =>
    sw.evaluate(() => (globalThis as unknown as { __changes: unknown[] }).__changes.at(-1)) as Promise<Change | undefined>;
  const waitForChange = async (pred: (c: Change) => boolean) => {
    await expect.poll(async () => {
      const c = await lastChange();
      return !!c && pred(c);
    }, { timeout: 5000 }).toBe(true);
    return (await lastChange())!;
  };
  const added = (c: Change) => c.schema.fields.map((f) => f.field_key);

  const url = `${BASE}/wizard.html`;
  const page = await context.newPage();
  await page.goto(url);
  await page.waitForSelector('#full_name');
  const { schema } = await toContent<{ schema: FormSchemaInput }>(url, { type: 'SCAN' });
  const known = schema.fields.map((f) => f.field_key);
  expect(known).toEqual(['full_name', 'mobile', 'other_address']);
  await toContent(url, { type: 'WATCH', known });

  // A checkbox reveals a dependent field.
  await page.check('#other_address');
  let c = await waitForChange((x) => added(x).includes('comm_address'));
  expect(added(c)).toEqual(['comm_address']);

  // Next: step 1 hides, step 2 shows.
  await page.click('#next');
  c = await waitForChange((x) => added(x).includes('occupation'));
  expect(added(c)).toEqual(['occupation', 'income']);
  expect(c.present).toEqual(['occupation', 'income']);

  // Choosing "Other" shows "Specify occupation".
  await page.selectOption('#occupation', 'other');
  c = await waitForChange((x) => added(x).includes('occupation_other'));
  expect(added(c)).toEqual(['occupation_other']);

  // The form's next page (a full navigation on the same site): the worker sends WATCH again on load.
  await page.click('#to_page2');
  await page.waitForSelector('#bank_name');
  await toContent(url, { type: 'WATCH', known: [...known, 'comm_address', 'occupation', 'income', 'occupation_other'] });
  c = await waitForChange((x) => added(x).includes('bank_name'));
  expect(added(c)).toEqual(['bank_name', 'ifsc', 'account_no']);
  await toContent(url, { type: 'WATCH', off: true });
  await page.close();
});

test('uploads: the phone’s file goes into plain, button-hidden and drop-zone inputs; the site’s own check is reported', async () => {
  const url = `${BASE}/upload.html`;
  const page = await context.newPage();
  await page.goto(url);
  await page.waitForSelector('#photo');
  const echo = async () => JSON.parse((await page.locator('#state-echo').textContent()) ?? '{}');
  const bytes = (n: number) => Buffer.alloc(n, 7).toString('base64');

  const { schema } = await toContent<{ schema: FormSchemaInput }>(url, { type: 'SCAN' });
  const files = Object.fromEntries(schema.fields.filter((f) => f.field_type === 'file').map((f) => [f.field_key, f]));
  expect(Object.keys(files)).toEqual(['photo', 'cert', 'sign']);
  expect(files.photo).toMatchObject({ label: 'Applicant photo', accept: '.jpg,.jpeg' });
  expect(files.cert).toMatchObject({ label: 'Community certificate', accept: 'application/pdf' });
  expect(files.photo.context).toContain('below 50 KB');

  type R = { ok: boolean; error?: string; needsUploadClick?: boolean };
  const fill = (field_key: string, name: string, mime: string, size: number) =>
    toContent<R>(url, { type: 'FILL_FILE', field_key, name, mime, base64: bytes(size), site: BASE });

  expect(await fill('photo', 'Applicant_photo.jpg', 'image/jpeg', 20 * 1024)).toEqual({ ok: true, needsUploadClick: false });
  expect((await echo()).photo).toEqual({ name: 'Applicant_photo.jpg', size: 20 * 1024, type: 'image/jpeg' });

  // Too big for the site: its own check shows an error and drops the file; that is reported back.
  expect(await fill('photo', 'Applicant_photo.jpg', 'image/jpeg', 60 * 1024)).toEqual({ ok: false, error: 'File size must be below 50 KB' });

  // Hidden input behind "Choose file", with the page's own Upload button to click afterwards.
  expect(await fill('cert', 'Community_certificate.pdf', 'application/pdf', 300 * 1024)).toEqual({ ok: true, needsUploadClick: true });
  expect((await echo()).cert).toMatchObject({ name: 'Community_certificate.pdf', type: 'application/pdf' });
  await page.click('#cert-upload');
  expect((await echo()).cert_uploaded).toBe(true);

  // Drop zone with its input inside.
  expect((await fill('sign', 'Signature.png', 'image/png', 4096)).ok).toBe(true);
  expect((await echo()).sign).toMatchObject({ name: 'Signature.png', size: 4096 });

  // A tab now on another site never gets the file.
  expect(await toContent(url, { type: 'FILL_FILE', field_key: 'sign', name: 'x.png', mime: 'image/png', base64: bytes(10), site: 'https://elsewhere.example' })).toEqual({
    ok: false,
    error: MOVED_REASON,
  });

  // Start over (phone and computer): the upload fields filled from the phone are emptied.
  await toContent(url, { type: 'CLEAR_FILES' });
  expect(await echo()).toMatchObject({ photo: null, cert: null, sign: null });
  await page.close();
});

test('phone converter: photo under the size limit, photos into one PDF, rotate, crop, exact size', async () => {
  test.setTimeout(60_000);
  const page = await context.newPage();
  await page.goto(`${BASE}/convert.html`);
  await page.waitForFunction(() => typeof (window as unknown as { convertTests?: unknown }).convertTests === 'function');
  const r = (await page.evaluate(() => (window as unknown as { convertTests: () => Promise<unknown> }).convertTests())) as Record<
    string,
    Record<string, unknown>
  > & { bigBytes: number };

  expect(r.bigBytes).toBeGreaterThan(1024 * 1024); // a 3000×2000 "photo" of more than 1 MB…
  expect(r.small).toMatchObject({ type: 'image/jpeg', problem: null }); // …becomes a JPG within 50 KB
  expect(r.small.bytes as number).toBeLessThanOrEqual(50 * 1024);
  expect(r.three).toMatchObject({ type: 'application/pdf', pages: 3, problem: null }); // 3 photos → one PDF within 500 KB
  expect(r.three.bytes as number).toBeLessThanOrEqual(500 * 1024);
  expect(r.rotated).toEqual({ w: 200, h: 400 }); // 400×200 turned 90°
  expect(r.cropped).toEqual({ w: 200, h: 200 }); // left half kept
  expect(r.exact).toMatchObject({ w: 200, h: 230, problem: null }); // the field's exact pixel size
  expect(r.tooBigPdf.pages).toBe(3);
  expect(r.tooBigPdf.problem as string).toMatch(/limit is 100 KB\. Take photos of the pages instead\./);
  await page.close();
});

test('cascade: State → District → Village with lists loading after a delay', async () => {
  const url = `${BASE}/cascade.html`;
  const page = await context.newPage();
  await page.goto(url);
  await page.waitForSelector('#state');

  const { schema } = await toContent<{ schema: FormSchemaInput }>(url, { type: 'SCAN' });
  const dyn = Object.fromEntries(schema.fields.map((f) => [f.field_key, f.dynamic_options]));
  expect(dyn).toEqual({ state: false, district: true, village: true });

  // "Tiruvallur" as spoken must resolve to the page's "Thiruvallur".
  const report = await toContent<FillResult>(url, {
    type: 'FILL',
    values: { state: 'Tamil Nadu', district: 'Tiruvallur', village: 'Ponneri' },
  });
  expect(report.filled).toEqual(['state', 'district', 'village']);
  await expect(page.locator('#district option:checked')).toHaveText('Thiruvallur');
  await expect(page.locator('#village option:checked')).toHaveText('Ponneri');

  // Changing the State later: the old District/Village no longer fit and are sent to the phone picker.
  const changed = await toContent<FillResult>(url, { type: 'FILL', values: { state: 'Kerala' } });
  await expect(page.locator('#state')).toHaveValue('KL');
  await expect(page.locator('#district')).toHaveValue('');
  expect(Object.fromEntries((changed.unresolved ?? []).map((u) => [u.field_key, u.reason]))).toEqual({
    district: 'parent_changed',
    village: 'parent_changed',
  });
  await page.close();
});

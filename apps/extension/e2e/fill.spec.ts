import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, expect, test, type BrowserContext, type Worker } from '@playwright/test';
import type { FormSchemaInput } from '@vff/shared';
import type { FillResult } from '../src/messages';

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

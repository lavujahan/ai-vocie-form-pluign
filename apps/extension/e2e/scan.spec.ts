import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, expect, test, type BrowserContext, type Page, type Worker } from '@playwright/test';

// Fetch from scan in the built extension. Chrome's folder dialog can't be driven, so the picker hands
// out a real folder from the browser's private file system (same handle type, real permissions).
// There is no server here: a session is put in the worker's stored state, as a real one would be.

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const EXT = path.resolve(ROOT, '../dist');
const BASE = 'http://localhost:5174';

let context: BrowserContext;
let sw: Worker;

const rules = (r: object) => ({ min_kb: null, max_kb: null, max_pages: null, width_px: null, height_px: null, shape: null, note: null, ...r });
const field = (field_key: string, label: string, position: number, over: object) => ({
  id: `id-${field_key}`,
  field_key,
  label,
  field_type: 'file',
  required: true,
  options: [],
  multiple: false,
  semantic_type: null,
  step_index: 0,
  position,
  depends_on: null,
  dynamic_options: false,
  choice_hint: null,
  ...over,
});
const FIELDS = [
  field('photo', 'Applicant photo', 0, { accept: '.jpg,.jpeg', file_rules: rules({ kind: 'photo', formats: ['jpg'], max_kb: 50 }) }),
  field('cert', 'Community certificate', 1, { accept: 'application/pdf', file_rules: rules({ kind: 'document', formats: ['pdf'], max_pages: 2 }) }),
];

/** A session as the worker keeps it, for the tab showing the form. */
const seeded = (tabId: number) => ({
  auth: { token: 'test', expires_at: new Date(Date.now() + 3_600_000).toISOString(), user: { id: 'u1', name: 'Operator', phone: '9000000000' } },
  tabs: {
    [tabId]: {
      filledUpTo: null,
      lastFill: null,
      canUndo: false,
      session: {
        session_id: 's1',
        session_code: 'CODE1',
        form_name: 'Upload form',
        qr_url: `${BASE}/s/CODE1`,
        expires_at: new Date(Date.now() + 3_600_000).toISOString(),
        tab_id: tabId,
        field_count: FIELDS.length,
        page_site: BASE,
        snapshot: {
          session: { id: 's1', form_name: 'Upload form', page_url: `${BASE}/upload.html`, status: 'paired', hidden_fields: [] },
          fields: FIELDS,
          values: [],
          utterances: [],
          files: [],
        },
      },
    },
  },
});

/** A white-lid scan with a tilted card on it, as a JPEG file in the scan folder. */
const writeCardScan = (page: Page, name: string) =>
  page.evaluate(async (name) => {
    const c = document.createElement('canvas');
    c.width = 1240;
    c.height = 1754;
    const x = c.getContext('2d')!;
    x.fillStyle = '#f6f6f3';
    x.fillRect(0, 0, c.width, c.height);
    x.translate(600, 500);
    x.rotate(-0.08);
    x.fillStyle = '#3f5f8f';
    x.fillRect(-400, -250, 800, 500);
    const blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), 'image/jpeg', 0.92));
    const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('scans', { create: true });
    const w = await (await dir.getFileHandle(name, { create: true })).createWritable();
    await w.write(blob);
    await w.close();
  }, name);

const writePdf = async (page: Page, name: string) => {
  // pdf-lib belongs to the shared package.
  const { PDFDocument } = createRequire(path.resolve(ROOT, '../../../packages/shared/package.json'))('pdf-lib');
  const doc = await PDFDocument.create();
  doc.addPage([300, 400]);
  doc.addPage([300, 400]);
  const base64 = Buffer.from(await doc.save()).toString('base64');
  await page.evaluate(
    async ({ name, base64 }) => {
      const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('scans', { create: true });
      const w = await (await dir.getFileHandle(name, { create: true })).createWritable();
      await w.write(Uint8Array.from(atob(base64), (ch) => ch.charCodeAt(0)));
      await w.close();
    },
    { name, base64 },
  );
};

test.beforeAll(async () => {
  context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless: true,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  });
  sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  await context.addInitScript(() => {
    (window as unknown as { showDirectoryPicker: () => Promise<unknown> }).showDirectoryPicker = async () =>
      (await navigator.storage.getDirectory()).getDirectoryHandle('scans', { create: true });
  });
});

test.afterAll(async () => context?.close());

test('fetch from scan: connect, thumbnails, rules, review, save, Fill form, and cleared with the form', async () => {
  test.setTimeout(60_000);
  const errors: string[] = [];
  const form = await context.newPage();
  await form.goto(`${BASE}/upload.html`);
  await form.waitForSelector('#photo');

  const tabId = (await sw.evaluate(async () => {
    const tabs = await chrome.tabs.query({});
    return tabs.reduce((a, b) => ((b.id ?? 0) > (a.id ?? 0) ? b : a)).id!;
  })) as number;
  await sw.evaluate((state) => chrome.storage.session.set({ state }), seeded(tabId));
  // The worker reads the stored state when it starts.
  const cdp = await context.newCDPSession(form);
  await cdp.send('ServiceWorker.enable');
  await cdp.send('ServiceWorker.stopAllWorkers');

  const id = new URL(sw.url()).host;
  const win = await context.newPage();
  win.on('pageerror', (e) => errors.push(e.message));
  win.on('console', (m) => {
    if (m.type() === 'error' && /Content Security Policy|EvalError|unsafe-eval/i.test(m.text())) errors.push(m.text());
  });
  await win.goto(`chrome-extension://${id}/src/popup/index.html?scan=1&tab=${tabId}`);

  await win.getByRole('button', { name: 'Connect scan folder' }).click();
  await expect(win.getByText('Connected')).toBeVisible();
  await expect(win.getByText('Scan the document')).toBeVisible();

  await writeCardScan(win, 'Scan0041.jpg');
  await writeCardScan(win, 'Scan0042.jpg');
  await writePdf(win, 'pages.pdf');
  await win.getByRole('button', { name: 'Refresh' }).click();
  const card = (name: string) => win.getByRole('button', { name: new RegExp(name) }).first();
  await expect(card('Scan0041.jpg')).toBeVisible({ timeout: 10_000 });
  // pdf.js runs under the extension's security policy: the PDF gets a thumbnail and its page count.
  await expect(card('pages.pdf').getByText('2 pages')).toBeVisible({ timeout: 10_000 });

  const photo = win.getByRole('button', { name: /^Applicant photo/ });
  await expect(photo).toBeDisabled();

  // Two scans can't go into a JPG field: the second would be lost.
  await card('Scan0041.jpg').click();
  await card('Scan0042.jpg').click();
  await expect(win.getByText('2 scans selected')).toBeVisible();
  await expect(photo).toBeDisabled();
  await expect(photo.getByText('Takes 1 scan')).toBeVisible();

  await card('Scan0042.jpg').click();
  await photo.click();
  await expect(win.getByText('Cropped and straightened')).toBeVisible({ timeout: 15_000 });
  await expect(win.getByText(/limit 50 KB/)).toBeVisible();
  await win.getByRole('button', { name: 'Save to form' }).click();
  await expect(win.getByText('Saved for Applicant photo')).toBeVisible();
  await expect(card('Scan0041.jpg').getByText('Used')).toBeVisible();
  await expect(photo.getByText('Saved')).toBeVisible();

  // A scanned PDF the field can take goes as it is.
  await card('pages.pdf').click();
  await win.getByRole('button', { name: /^Community certificate/ }).click();
  await expect(win.getByText('PDF, 2 pages')).toBeVisible({ timeout: 15_000 });
  await win.getByRole('button', { name: 'Save to form' }).click();
  await expect(win.getByText('Saved for Community certificate')).toBeVisible();

  type Response = { ok: boolean; error?: string; state: { scans: { field_key: string; status: string; pages: number }[]; uploadClicks: string[] } };
  const ask = (req: object) => win.evaluate((req) => chrome.runtime.sendMessage(req), { ...req, tab_id: tabId }) as Promise<Response>;

  // Nothing reaches the page until Fill form.
  expect(await form.locator('#photo').evaluate((el) => (el as HTMLInputElement).files?.length)).toBe(0);
  const filled = await ask({ type: 'FILL' });
  expect(filled.ok).toBe(true);
  expect(filled.state.scans.map((s) => [s.field_key, s.status, s.pages]).sort()).toEqual([
    ['cert', 'filled', 2],
    ['photo', 'filled', 1],
  ]);
  expect(filled.state.uploadClicks).toEqual(['cert']); // this page has its own Upload button
  const echo = JSON.parse((await form.locator('#state-echo').textContent()) ?? '{}');
  expect(echo.photo).toMatchObject({ name: 'Applicant_photo.jpg', type: 'image/jpeg' });
  expect(echo.photo.size).toBeLessThanOrEqual(50 * 1024);
  expect(echo.cert).toMatchObject({ name: 'Community_certificate.pdf', type: 'application/pdf' });

  // New form: nothing stays behind in this browser.
  expect((await ask({ type: 'END_SESSION' })).ok).toBe(true);
  const left = await win.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const open = indexedDB.open('vf-scans');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const count = open.result.transaction('scans').objectStore('scans').count();
          count.onsuccess = () => resolve(count.result);
        };
      }),
  );
  expect(left).toBe(0);
  await expect(win.getByText('This form has ended')).toBeVisible();
  expect(errors).toEqual([]);
});

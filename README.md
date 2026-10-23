# Voice form filler

A Chrome extension finds the form on a desktop page and shows a QR code. You scan it with your phone and speak (Tamil, English or Tanglish). Sarvam AI turns the speech into text and OpenAI maps it to English field values, and the extension fills the original form with framework-safe events.

```
apps/extension     Chrome MV3 extension: React + Vite + @crxjs (detector, filler, popup, service worker)
apps/web           Next.js: API routes, mobile voice page (/s/[code]), admin panel (/admin)
packages/shared    zod schemas, types, normalization (dates, phones, emails, fuzzy option match), validation
supabase           SQL migrations (schema, RLS, latest-wins upsert, purge cron)
```

## How it works

1. **Extension popup → Scan form.** The content script detects fields, including same-origin iframes and open shadow roots. `POST /api/sessions` stores them and returns a single-use QR code that expires after 10 minutes. The **Form Analyzer Agent** then runs in the background and adds clean labels, semantic types and validation rules.
2. **Phone scans the QR code.** It opens `/s/<code>`, which pairs the phone and gives it a 30-minute session JWT.
3. **Tap the mic to start and tap again to stop.** Each recording is one *utterance*, sent with a `seq` number, and several can be processed at once. The server transcribes it with Sarvam **Saaras** (`saaras:v3`, `codemix` mode: English words in English letters, Tamil in Tamil script, numbers as digits), runs the **Field Mapping Agent** (OpenAI Agents SDK, `gpt-4o`), and calls `upsert_field_value`. A value is only overwritten by a newer `seq`, so newer speech wins even if it finishes processing first.
4. **Values stream to the phone and the extension over Supabase Realtime.** Press **Fill form** once; after that, new values fill the page automatically and the changed field is highlighted. **Undo** restores the page's original values.

## Setup

Prerequisites: Node 20+, pnpm 9 (`npm i -g pnpm@9`), a Supabase project, a Sarvam AI API key (speech-to-text), an OpenAI API key (form reading and mapping), and an HTTPS tunnel such as `cloudflared` or `ngrok`. The phone's mic only works over HTTPS.

```bash
pnpm install
```

### 1. Supabase

1. Create a project at supabase.com.
2. Enable the **pg_cron** extension (Database → Extensions).
3. In the SQL editor, run `supabase/migrations/0001_init.sql`, then `0002_cron.sql`, `0003_recording_parts.sql`, `0004_cascading_fields.sql`, `0005_session_reset.sql`, `0006_corrections_tamil.sql`, `0007_file_uploads.sql`, `0008_usage_billing.sql` and `0009_retention.sql`. If you link the Supabase CLI, `supabase db push` does the same.
4. Collect these values from Settings → API / JWT Keys:
   - Project URL
   - `anon` (publishable) key
   - `service_role` (secret) key
   - **legacy JWT secret** (HS256)

> The API signs its own JWTs: one for the extension user, and one per phone session, scoped to that session. They are signed with the project's HS256 JWT secret so that RLS and Realtime accept them. If your project only uses the newer asymmetric signing keys, keep the legacy HS256 secret active (or add a shared secret as a signing key). Otherwise the RLS checks in `check:db` fail and Realtime won't connect.

### 2. Environment

```bash
cp apps/web/.env.example apps/web/.env.local              # Supabase + Sarvam + OpenAI + PUBLIC_BASE_URL
cp apps/extension/.env.example apps/extension/.env.local  # API base + Supabase URL / anon key + privacy page URL
```

### 3. First admin and checks

```bash
pnpm --filter web seed:admin --phone 9876543210 --pin 12345 --name "Admin"
pnpm --filter web check:db     # latest-wins ordering, single-use pairing, RLS isolation
```

### 4. Run

```bash
cloudflared tunnel --url http://localhost:3000   # or: ngrok http 3000
# put the https URL in apps/web/.env.local as PUBLIC_BASE_URL, then:
pnpm --filter web dev                            # http://localhost:3000
pnpm --filter extension build                    # or `pnpm --filter extension dev` for HMR
pnpm --filter extension fixtures                 # test forms at http://localhost:5174
```

Load the extension in Chrome: `chrome://extensions` → Developer mode → **Load unpacked** → `apps/extension/dist`.

### 5. Try it

1. Sign in at `/admin/login` and add a user (phone number and 5-digit PIN).
2. Open `http://localhost:5174/vanilla.html` (or the React or Vue fixture), click the extension and sign in as that user.
3. Click **Scan form on this page** and scan the QR code with your phone.
4. Say *"My name is Ramesh Kumar, email ramesh at gmail dot com, phone nine eight seven six five four three two one zero"*, or in Tanglish, *"en peru Ramesh, ooru Chennai, naan aan"*.
5. Watch the values appear in the popup, then press **Fill form**.

## Tests

| Command | What it checks |
| --- | --- |
| `pnpm test` | Unit tests (vitest), no network:<br>• shared normalization and validation<br>• login lockout and IP rate limit<br>• JWTs<br>• agent tools and guardrails<br>• Field Mapping Agent on a scripted model<br>• detector and filler on jsdom, including React controlled inputs |
| `pnpm --filter extension e2e` | Builds the extension, loads it unpacked in Chromium with Playwright, and fills the vanilla, React and Vue fixtures through the real content script. Checks the framework state, latest-wins re-fill and Undo. Run `npx playwright install chromium` once first. |
| `pnpm --filter web check:db` | Runs against your Supabase project: latest-wins upsert (seq 3, 1, 2 finishing out of order), single-use pairing and RLS isolation. |
| `pnpm eval:mapping` | Sends 54 fixtures to the real Field Mapping Agent and prints per-field accuracy per tag. The fixtures cover English, Tanglish and Tamil, a CAN registration form, corrections and spoken commands. `--only can,corrections` runs a subset; `--model gpt-4o-mini` compares models. Reports are saved to `apps/web/eval-results/`. Uses OpenAI tokens. |

## Deploying

- **Web:** a Vercel project with root `apps/web`. Set the same environment variables, with `PUBLIC_BASE_URL` set to the Vercel URL.
- **Extension:** build with `VITE_API_BASE=https://<your-app>.vercel.app` and pack `apps/extension/dist`.

## AI providers: two APIs, one job each

| Job | Provider | Where |
| --- | --- | --- |
| Speech → text | **Sarvam AI** `saaras:v3`, `codemix` mode: English words in English letters, Tamil in Tamil script, numbers as digits | `apps/web/lib/sarvam/stt.ts` |
| Reading the form (clean labels, field types, rules) | **OpenAI** Form Analyzer Agent (`@openai/agents`, `gpt-4o`) | `apps/web/lib/agents/formAnalyzer.ts` |
| Parsing speech → field values | **OpenAI** Field Mapping Agent (`@openai/agents`, `gpt-4o`) | `apps/web/lib/agents/fieldMapper.ts` |

- **Sarvam settings:** `SARVAM_STT_MODEL` / `SARVAM_STT_MODE` / `SARVAM_STT_LANGUAGE`. `saaras:v4` also gets *keyterms*: the form's option and field labels, to help recognize place names.
- **30-second limit:** Sarvam's REST speech-to-text accepts clips under 30 s. Long recordings are handled in two steps:
  1. **Cut every 28 s** (`app/s/[code]/use-recorder.ts`): the phone always cuts at 28 s, even mid-word. The next piece starts before the previous one stops, so nothing is lost at the cut.
  2. **Join before mapping** (`lib/recordings.ts`): pieces share a `recording_id` and a `part` number (migration `0003`). For piece N, the server maps the joined transcript of pieces 0…N. A sentence or number cut across pieces ("mobile number 95432 | 49890") is read whole, and the later piece's higher seq replaces the earlier partial values.
- **Interpretation is done by the AI.** The mapping agent interprets everything: Tanglish fillers, Tamil script, numbers listed piece by piece as `number_parts`, and option choice. Its only tool is `validate_value`, a format and option checker. The server re-checks every value and marks doubtful ones "Check this".
- **Timings:** the Vercel logs show one line per recording: `utterance seq=… stt=…ms map=…ms values=…`.

## Usage and billing (migration `0008`)

Every paid AI call adds a row to `usage_events`, charged to the user who owns the session:
- **Sarvam:** one row per speech-to-text call, with `audio_ms`. Sarvam's reply doesn't include the audio length, so the phone sends how long it recorded (`duration_ms`, at most 30 s).
- **OpenAI:** one row per agent run (`map`, `analyze` or `resolve`), with its requests, input/cached/output tokens and `cost_usd` at list price (`lib/usage/pricing.ts`). Runs that fail after reaching the model are counted too.
- Retries are billed again, so they get their own rows. Rows stay when sessions and utterances are purged.

**Admin → Usage** (`/admin/usage`) shows one row per user for a month (India time): minutes, tokens, Sarvam ₹, OpenAI ₹ and the total. The admin sets the USD→INR rate and Sarvam's ₹/minute there (stored in `billing_settings`; defaults are 88 and ₹0.49, the pay-as-you-go price). The ₹ amounts are worked out when the page loads, so a new rate re-prices the month shown.

When OpenAI changes its prices or `AGENT_MODEL` changes to a new model, update `OPENAI_USD_PER_M`. A model that isn't in that table is logged with `cost_usd` null.

## Cascading dropdowns (State → District → Taluk → Village)

The extension fills dependent dropdowns in order (`apps/extension/src/content/cascade.ts`):
- **Detect:** dropdowns that are empty or disabled when scanned are marked `dynamic_options`.
- **Fill in order:** the extension sets the parent, then waits (up to 8 s) for the child's list to load, then picks the spoken value from the real options.
- **Learn the links:** which dropdown feeds which comes from the Form Analyzer's `depends_on`, or is learned by watching which dropdown reloads.
- **Unclear match** (spelling variant, Tamil script, abbreviation): the **Option Resolver Agent** (OpenAI, `/api/resolve-option`) picks from the loaded options, or reports ambiguity.
- **Still unresolved:** the extension uploads the loaded options and a hint (`PATCH /api/sessions/[code]/fields`). The phone row shows **"Pick one"** with "Did you mean…" buttons.
- **Parent changed later:** children are re-checked. Values that no longer fit are cleared and sent to the phone picker, never left silently wrong.
- **Safety check:** a final pass re-fills any dropdown the page reset after the extension moved on.

## Several forms at once (one per tab)

One signed-in user can fill several forms at once, for example two CAN registrations in two tabs:
- **Per-tab sessions.** Each tab has its own session, QR code, phone and values.
- **The popup follows the tab.** It always shows the session of the tab it was opened on. Scanning in one tab never touches another.
- **One connection.** The service worker keeps one Realtime socket with a channel per session (`apps/extension/src/background/tabs.ts`).
- **Closing a tab** ends only that tab's session.
- **Moved tabs are safe.** A tab that has moved to a different site is never filled with the old form's values.
- **Limit:** 5 active forms per browser.
- **Sign out** ends all of them.

## Photo and PDF uploads (migration `0007`)

Upload fields are filled from the phone's camera or files, never by voice.

1. **Detect** (`apps/extension/src/content/detector.ts`): the extension finds `<input type=file>`, including inputs hidden behind a styled "Choose file" button, a label or a drop zone. It reads the `accept` attribute, the text around the field ("JPG only, below 50 KB"), and any separate **Upload** button the page needs.
2. **Read the rules:** the Form Analyzer turns that into `file_rules`: kind, formats, max/min KB, max pages, pixel size, and a note. `accept` always wins over what the AI read. The shared helpers are in `packages/shared/src/files.ts`.
3. **Phone:** a "Photos and documents" card lists the upload fields, like "Applicant photo · JPG · max 50 KB". **Take photo** or **Choose file**; rotate, crop, **Add page**; then **Make file**.
   - Conversion happens on the phone (`apps/web/lib/files/convert.ts`): a JPG within the size limit (quality search, then resize), several photos as one A4 PDF within the limit (pdf-lib, loaded only when needed), or the exact pixel size if the page asks for one.
   - Re-encoding drops EXIF/GPS data.
   - **Document photos** (certificates, ID cards): the phone finds the sheet on the table (`lib/files/docscan.ts`: brightest large area, its 4 corners) and opens a 4-corner editor to adjust them. The page is then cut out and straightened (perspective correction, snapped to A4 / ID card / Letter proportions within 3%). **Scan look** (on by default) evens out shadows so the paper turns white and the writing darker; colours such as stamps and photos are kept. If the sheet isn't found (light table, sheet filling the photo), the user places the corners.
   - **A PDF picked on the phone** is sent as it is when it fits. When it is over the size limit, the phone makes it smaller (`lib/files/pdf-shrink.ts`): first a plain re-save with pdf-lib, else every page is redrawn with pdf.js (about 150 dpi) and rebuilt within the limit, at the original page sizes. The text then becomes part of the image. Pages are never dropped: a PDF with more pages than the field allows gets a message, and so does a password-locked PDF or one with more than 30 pages. pdf.js loads only when a PDF has to be made smaller, and runs on the page (no worker file).
4. **Upload:** `POST /api/sessions/[code]/files/upload-url` checks the file against the rules and returns a one-time signed URL. The phone uploads straight to the private Storage bucket `form-files`, which avoids API body limits. Then `POST /files` makes the server check what arrived (real type from the first bytes, real size) before the computer sees it. A newer upload replaces the older one.
5. **Desktop:** the extension downloads the file through a 60-second signed link and puts it into the page as a real file (`DataTransfer` + `input.files` + change events), so the site's own checks run.
   - If the site shows an error or drops the file, the phone shows "The website refused it: …".
   - If the page has its own **Upload** button, it is highlighted and the popup says to click it.
6. **Deletion:**
   - The stored file is deleted as soon as the computer reports it filled or refused.
   - It is also deleted on Start over and when the form tab closes.
   - Files from expired sessions are purged after each new session, plus a daily Vercel Cron (`/api/cron/purge-files`, needs `CRON_SECRET`).

**Not supported:** in-page webcam widgets and upload fields inside another site's iframe.

Test pages: `test-fixtures/upload.html` (plain input with its own size check, hidden input + Upload button, drop zone) and `test-fixtures/convert.html` (the phone converter in a real browser).

## Spoken corrections and commands

The Field Mapping Agent also sees the **last 3 recordings** and the fields they set. That lets corrections that don't name a field work. All of these go through the same AI call, with no extra agent and no extra delay:
- **Pointing back at the last answer:** "no, not Jahan, Jagan", "Jahan illa, Jagan" and "change it to 9876…" correct the field that was just said.
- **Partial edits:** "the last digit is 5" and "pincode la 455 illa 445" change part of the current value.
- **Spelled names:** "J A G A N", including Tamil letter names, becomes "Jagan".
- **Commands:** "start over", "send it" and "what is left?" (also in Tanglish and Tamil). The phone never acts on these by itself:
  - "start over" opens the Start over sheet;
  - "send it" asks "Send the form to the computer now?";
  - "what is left?" lists the required fields that are still empty.

## Phone screens in Tamil

The **தமிழ் / English** switch at the top of the phone page changes every screen text and message.
- The choice is remembered on the phone; the default follows the phone's language.
- Field labels show both languages, like "தந்தை பெயர் · Father's name". The Form Analyzer writes `label_ta` (migration `0006`), and the English label stays so it matches the computer screen.
- Values filled into the form stay in English.

## Custom dropdowns (react-select, MUI, choices.js, select2)

Dropdowns that aren't real `<select>`s are filled the way a person would fill them. The code is in `apps/extension/src/content/combobox.ts`, and every widget uses the same steps:
1. Open the dropdown.
2. Type to filter.
3. Wait for the options; they may load from a server.
4. Pick one locally, or ask the **Option Resolver Agent**.
5. Click the option.
6. Check that the choice took.

Also handled:
- **Different spellings:** if the widget's own search hides the right option ("Omaloor" vs "Omalur"), the full list is checked as well.
- **Multi-select** (comma-separated values) and clearing (Start over, Undo) work.
- **Unclear matches** go to the phone's **Pick one** list, as for cascading dropdowns.

Detection uses generic accessibility markup first (`role=combobox` / `listbox` / `option`), with fallbacks for:
- react-select
- MUI Autocomplete and Select
- choices.js
- select2, including select2 loading options from a server
- AntD (best effort, not tested)

Test page: `test-fixtures/dropdowns.html`.

## Fields that appear later (multi-step forms, dependent fields)

While a form session is active, the extension watches the page (`apps/extension/src/content/watch.ts`).
- **Fields that appear later are added to the session.** That covers a wizard's next step, the form's next page on the same site, and a field shown by a checkbox or by choosing "Other". It uses `POST /api/sessions/[code]/fields`, and the Form Analyzer reads only the new fields.
- **The phone shows them right away:** "3 new fields on the computer (step 2)", under a **Step 2** heading.
- **Values wait for their field.** A value spoken for a field that isn't on the page yet shows as "Waiting: this field isn't on the page yet" in the popup. It fills as soon as the field appears.

Test page: `test-fixtures/wizard.html`.

## Start over and the desktop tab (migration `0005`)

**Timings**
- The QR code must be scanned within 10 minutes and works once.
- After scanning, the phone link lasts 30 minutes.
- Reloading the phone page in the same browser tab resumes with all answers. Only a recording still in progress is lost, and the page warns before leaving.
- **Phone back button:** the page opens from a QR scan with no history, so back would close it. After the first tap the page adds a history entry: back then closes whatever is open (photo sheet, typing box, Start over), or shows "Press back again to leave"; a second back leaves.
- **Connect phone again** (popup, after pairing; `POST /api/sessions/[code]/reconnect`): when the phone page was closed, the popup shows the same QR code again above the fields, for 10 minutes. Scanning it opens the phone page with every answer kept. Tokens of the earlier phone stop working (they carry the old `paired_at`), and a phone page still open shows "Disconnected". Not possible once the form tab was closed.

**Start over** is a phone button that opens a sheet with two choices:
- **Clear phone answers:** clears the answers on the phone. The computer's form is left as it is, and auto-fill stops.
- **Clear phone and computer form:** also clears the computer's form. The extension uses Undo, or, if the page reloaded since the fill, empties the fields it filled.

How it works: `reset_session` writes `null` for every field at the phone's next seq, so recordings still in flight can't bring old answers back. It also deletes the previous applicant's transcripts. The same QR code is then used for the next applicant.

**Desktop tab state**
The extension reports the form tab's state to the phone (`PATCH /api/sessions/[code]/desktop`):

| State | Phone shows | Allowed |
| --- | --- | --- |
| **moved** to another site | amber banner | Speaking is fine; Send to desktop is off until the tab is back on the form's site. |
| **closed** (tab closed, "New form", sign out) | **"Tab closed"** card | Nothing; the server refuses (409) recordings, edits and Send for that QR code. |

**Send to desktop** is the button next to the big mic on the phone (there is no separate review page). It asks first when required fields are empty, waits while speech is still being processed, and changes to "Send 2 changes" when answers change after a Send. **Desktop acknowledgement:** after a Send the phone shows "Sent. Click Fill form on the computer.", then "Filled on computer ✓ 14/16" once the page is filled. If nothing could be filled, it offers **Send again**.

**Other phone messages**
- QR code already used vs expired.
- In-app browsers (WhatsApp, Lens): **Copy link**.
- Microphone blocked: step-by-step instructions.
- Recording stopped by a screen lock or call: what was recorded is sent.
- Offline: banner, plus automatic resend when back online.
- Required fields still empty: confirmation before Send.
- Sarvam or OpenAI busy (429/5xx): one server retry, then "Speech service is busy".

## Privacy

- Audio is never stored. It is only held in memory while one request runs.
- **Uploaded photos and PDFs** live in a private bucket that clients can't list or read. Upload and download links work for one file (download links for 60 seconds). Files are deleted as soon as the computer has them, on Start over, when the form tab closes, and at the latest when the session expires. Re-encoding on the phone removes EXIF/GPS data, and file contents are never logged.
- `pg_cron` runs `purge_expired()` every 15 minutes (migration `0009`):
  - transcripts, values and spoken dropdown hints are deleted about 40–55 minutes after a session is created;
  - whole session records (page URL, title, fields) are deleted after 30 days;
  - sign-in attempts are deleted after 1 day.
  - The public privacy policy (`store/pages/privacy.md`) states these times, so change both together.
- Clients can't write to the database directly; every write goes through the API using the service role.
- RLS limits each client to reading its own session.

## Not in this MVP

These are planned for later:
- form memory
- cross-origin iframes
- PWA manifest
- offscreen-document fallback for the service worker

See `PLAN.md` for the full design.

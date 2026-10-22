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
3. In the SQL editor, run `supabase/migrations/0001_init.sql`, then `0002_cron.sql`, `0003_recording_parts.sql`, `0004_cascading_fields.sql` and `0005_session_reset.sql`. If you link the Supabase CLI, `supabase db push` does the same.
4. Collect these values from Settings → API / JWT Keys:
   - Project URL
   - `anon` (publishable) key
   - `service_role` (secret) key
   - **legacy JWT secret** (HS256)

> The API signs its own JWTs: one for the extension user, and one per phone session, scoped to that session. They are signed with the project's HS256 JWT secret so that RLS and Realtime accept them. If your project only uses the newer asymmetric signing keys, keep the legacy HS256 secret active (or add a shared secret as a signing key). Otherwise the RLS checks in `check:db` fail and Realtime won't connect.

### 2. Environment

```bash
cp apps/web/.env.example apps/web/.env.local              # Supabase + Sarvam + OpenAI + PUBLIC_BASE_URL
cp apps/extension/.env.example apps/extension/.env.local  # API base + Supabase URL / anon key
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
| `pnpm eval:mapping` | Sends about 30 Tamil, English and Tanglish fixtures to the real Field Mapping Agent and prints per-field accuracy. Uses OpenAI tokens. |

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

**Desktop acknowledgement:** after Send to desktop, the phone shows "Filled on computer ✓ 14/16". With no answer within 15 s, it shows "The computer hasn't responded", with **Send again**.

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
- Transcripts and values are purged by `pg_cron` about 40 minutes after a session is created.
- Clients can't write to the database directly; every write goes through the API using the service role.
- RLS limits each client to reading its own session.

## Not in this MVP

These are planned for later:
- form memory
- cross-origin iframes
- PWA manifest
- offscreen-document fallback for the service worker
- correction Orchestrator agent

See `PLAN.md` for the full design.

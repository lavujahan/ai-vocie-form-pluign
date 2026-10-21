# Voice form filler

A Chrome extension finds the form on a desktop page and shows a QR code. You scan it with your phone and speak (Tamil, English or Tanglish). OpenAI turns the speech into English field values, and the extension fills the original form with framework-safe events.

```
apps/extension     Chrome MV3 extension: React + Vite + @crxjs (detector, filler, popup, service worker)
apps/web           Next.js: API routes, mobile voice page (/s/[code]), admin panel (/admin)
packages/shared    zod schemas, types, normalization (dates, phones, emails, fuzzy option match), validation
supabase           SQL migrations (schema, RLS, latest-wins upsert, purge cron)
```

## How it works

1. **Extension popup → Scan form.** The content script detects fields, including same-origin iframes and open shadow roots. `POST /api/sessions` stores them and returns a single-use QR code that expires after 10 minutes. The **Form Analyzer Agent** then runs in the background and adds clean labels, semantic types and validation rules.
2. **Phone scans the QR code.** It opens `/s/<code>`, which pairs the phone and gives it a 30-minute session JWT.
3. **Tap the mic to start and tap again to stop.** Each recording is one *utterance*, sent with a `seq` number, and several can be processed at once. The server transcribes it (`gpt-4o-transcribe`, falling back to `whisper-1`), runs the **Field Mapping Agent**, and calls `upsert_field_value`. A value is only overwritten by a newer `seq`, so newer speech wins even if it finishes processing first.
4. **Values stream to the phone and the extension over Supabase Realtime.** Press **Fill form** once; after that, new values fill the page automatically and the changed field is highlighted. **Undo** restores the page's original values.

## Setup

Prerequisites: Node 20+, pnpm 9 (`npm i -g pnpm@9`), a Supabase project, an OpenAI API key, and an HTTPS tunnel such as `cloudflared` or `ngrok`. The phone's mic only works over HTTPS.

```bash
pnpm install
```

### 1. Supabase

1. Create a project at supabase.com.
2. Enable the **pg_cron** extension (Database → Extensions).
3. In the SQL editor, run `supabase/migrations/0001_init.sql` and then `0002_cron.sql`. If you link the Supabase CLI, `supabase db push` does the same.
4. Collect these values from Settings → API / JWT Keys:
   - Project URL
   - `anon` (publishable) key
   - `service_role` (secret) key
   - **legacy JWT secret** (HS256)

> The API signs its own JWTs: one for the extension user, and one per phone session, scoped to that session. They are signed with the project's HS256 JWT secret so that RLS and Realtime accept them. If your project only uses the newer asymmetric signing keys, keep the legacy HS256 secret active (or add a shared secret as a signing key). Otherwise the RLS checks in `check:db` fail and Realtime won't connect.

### 2. Environment

```bash
cp apps/web/.env.example apps/web/.env.local              # Supabase + OpenAI + PUBLIC_BASE_URL
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

## Privacy

- Audio is never stored. It is only held in memory while one request runs.
- Transcripts and values are purged by `pg_cron` about 40 minutes after a session is created.
- Clients can't write to the database directly; every write goes through the API using the service role.
- RLS limits each client to reading its own session.

## Not in this MVP

These are planned for later:
- cascading dropdowns (State → District → Village) and custom dropdown adapters (react-select, select2, MUI)
- multi-step forms
- form memory
- cross-origin iframes
- PWA manifest
- offscreen-document fallback for the service worker
- correction Orchestrator agent

See `PLAN.md` for the full design.

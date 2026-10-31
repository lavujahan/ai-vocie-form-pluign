# Chrome Web Store listing: Voice form filler

Copy each section into the matching field in the Chrome Web Store developer dashboard.
The store shows the description as plain text, so the description below uses `•` bullets and no Markdown.

This plan follows Google's guides:
- [best listing](https://developer.chrome.com/docs/webstore/best-listing)
- [store listing tab](https://developer.chrome.com/docs/webstore/cws-dashboard-listing)
- [privacy tab](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy)
- [user data FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq)

---

## Plan

Status key: ☐ to do · ◐ in progress · ☑ done. Steps marked **blocker** will get the extension rejected if skipped.

### Decisions needed first

| # | Decision | Options | Affects |
| --- | --- | --- | --- |
| D1 | Store title | ☑ **"Voice Form Filler: Fill web forms by speaking on your phone"** | Step 1.4, all images |
| D2 | Content script | ☑ Done: no content script on any site. Access is asked per site when the user taps Scan form (`optional_host_permissions`), and the detector is registered for that site only | Step 1.3 |
| D3 | Public pages | ☑ Homepage, privacy and support pages go on your other existing site. ☐ Still needed: that site's address and the support email/phone, to fill the `{{…}}` placeholders. | Steps 1.2, 2.x, 4.2 |
| D4 | Regions | ☐ Open: all regions, or India only | Step 4.2 |

### Phase 1: Extension changes (`apps/extension`)

| # | Step | Files | Status |
| --- | --- | --- | --- |
| 1.1 | **Blocker:** store and toolbar icon. White Lucide `mic` on a `#1e4e9c` rounded square, 96 px artwork in 128 px. Export 16, 32, 48 and 128 px PNGs, and add `icons` and `action.default_icon` to the manifest. | `public/icons/*`, `vite.config.ts` | ☐ |
| 1.2 | **Blocker:** consent notice on the sign-in card, linked to the privacy page on your other site (see **Consent inside the extension**). Put the link in a `VITE_PRIVACY_URL` build setting rather than hard-coding it. | `src/popup/App.tsx`, `src/env.ts` | ☑ done: notice under the sign-in form, link from `VITE_PRIVACY_URL` (`apps/extension/.env.example`) |
| 1.3 | **Minimum permissions**, per D2. For (a), inject from the service worker on Scan and keep the watcher and tab-moved checks working; re-run `pnpm --filter extension e2e` and the `watch` and `tabs` unit tests. For (b), only remove `file:///*`. | `vite.config.ts`, `src/background/*`, `src/content/index.ts` | ◐ `file:///*` removed; on-demand injection waits for D2 |
| 1.4 | Use the D1 title in the manifest `name` and `default_title`. Keep the popup heading short ("Voice form filler"). | `vite.config.ts` | ☑ done (also `short_name: "Voice Form Filler"`) |
| 1.5 | Bump `version` to `1.0.0` for the first public release. | `vite.config.ts`, `package.json` | ☑ done |
| 1.6 | **Blocker:** make data retention match the privacy policy. The purge job (`0002_cron.sql`) deletes answers and transcripts, but keeps `form_sessions` (page URL, title, form name) and `form_fields` forever. `form_fields.choice_hint` even holds what the person said for an unclear dropdown. New migration `0009`: on expiry, set `choice_hint` to null; delete sessions older than 30 days (fields cascade, usage rows keep their numbers with `session_id` set to null). Add the check to `check:db`. | `supabase/migrations/0009_retention.sql` | ◐ written + `check:db` test; apply `0009` in Supabase and run `pnpm --filter web check:db` |

### Phase 2: Public pages (on your other site)

The content is written in `store/pages/`. Copy it to your other site and fill in the `{{…}}` placeholders.

| # | Page | Content | Status |
| --- | --- | --- | --- |
| 2.1 | **Blocker:** privacy policy | [pages/privacy.md](pages/privacy.md). Section 5 is true once migration `0009` is applied in Supabase (step 1.6). | ◐ written, not published |
| 2.2 | Homepage (the dashboard's Homepage URL) | [pages/home.md](pages/home.md). Add screenshots after Phase 3. | ◐ written, not published |
| 2.3 | Support (the dashboard's Support URL) | [pages/support.md](pages/support.md). Every answer uses the app's real on-screen messages. | ◐ written, not published |
| 2.4 | Change `apps/web/app/page.tsx` to link to the new homepage, or leave it. Optional. | — | ☐ |

### Phase 3: Images (`store/images`)

| # | Step | Status |
| --- | --- | --- |
| 3.1 | Made in **Claude Design** using the prompts in [design-brief.md](design-brief.md): Prompt 0 (shared brief), then the icon, 5 screenshots, promo tile, marquee and video. | ◐ prompts written |
| 3.2 | Export the PNGs at the exact sizes and save them to `store/images/`; the icons go to `apps/extension/public/icons/`. | ☐ |
| 3.3 | Check every image: exact size; full bleed with square corners; promo tile readable at 220×140; no real portal names or logos; only made-up data; only features that exist. | ☐ |

The images can be built in parallel with Phases 1 and 2, but they need the D1 title and the 1.1 icon.

### Phase 3b: Subscriptions (migration `0013`)

| # | Step | Status |
| --- | --- | --- |
| S.1 | Apply `supabase/migrations/0013_subscriptions.sql` and run `pnpm --filter web check:db`. Existing users get a 7-day Trial; renew paying customers in Admin → Users → Plan. | ☐ |
| S.2 | Apply `supabase/migrations/0015_plan_prices.sql`, then check the plan prices in Admin → Plans (Trial free 7 days / 15 min, Starter ₹99 / 60 min, Basic ₹249 / 150 min, Pro ₹649 / 400 min, Business ₹1,949 / 1,200 min; extra minutes ₹79 / 50 min). | ☐ |
| S.3 | Set `VITE_ACCOUNT_URL` (WhatsApp chat link or your site) for the production build: the popup's "Get one" and "Renew" links. Put the same contact in place of `{{ACCOUNT_CONTACT}}` in the description. | ☐ |
| S.4 | Publish [pages/terms.md](pages/terms.md) (plans, payments, refunds) and link it from the homepage and support page. Have it reviewed; check whether you need GST registration. | ☐ |
| S.5 | The privacy policy now lists plan and payment records (sections 2 and 5): publish the updated page. | ☐ |

### Phase 4: Submit

| # | Step | Status |
| --- | --- | --- |
| 4.1 | Build with the production `VITE_API_BASE` and Supabase URL. Load the unpacked build once and test sign-in, scan, fill and upload against production. Zip the contents of `apps/extension/dist`. | ☐ |
| 4.2 | Dashboard, **Store listing:** title, summary, description, category, language, icon, screenshots, promo tile, homepage and support URLs, mature content off. | ☐ |
| 4.3 | Dashboard, **Privacy:** single purpose, permission justifications (rewritten if 1.3 changed the manifest), remote code "No", data boxes, the three certifications, and the privacy policy URL. Put the same URL on the developer account page. | ☐ |
| 4.4 | Dashboard, **Distribution:** regions (D4), public visibility. Submit for review. | ☐ |

---

## Name (max 75 characters)

The store title comes from `name` in `apps/extension/vite.config.ts`. Options:

- **Recommended:** `Voice Form Filler: Fill web forms by speaking on your phone` (59). It says what the extension does, without extra keywords.
- `Voice Form Filler – Speak in Tamil or English to fill any form` (63). Riskier: Google's guidelines warn against stuffing the title with keywords.
- `Voice form filler` (current; clear, but doesn't explain the phone part)

Search the store before you choose: the title must not look like an existing extension's.

## Summary (max 132 characters)

```
Long queue, one typist? Applicants speak Tamil, English or Tanglish on their own phone, and the form on your computer fills itself.
```
(131 characters)

## Category

Productivity → Workflow & Planning

## Language

English. Tamil is supported on the phone screens, so mention it in the description, not as a second listing language.

---

## Detailed description (max 16,000 characters)

Written problem-first: about 70% is the counter's problems and how each one is solved, about 30% is the feature list, privacy and plans.
- Each problem has one Tamil line under it. The Tamil is formal written Tamil, with the English words people use at the counter (form, phone, field, PDF), not spoken dialect. Have a Tamil reader check it before you publish.
- Spoken examples in quotes ("en peru Ramesh…", "pincode la 455 illa 445") stay in Tanglish on purpose: they show what the applicant can say.
- No "Aadhaar", portal, government or other company names, so the listing doesn't look official or affiliated. "e-Sevai" appears once, only to describe the kind of centre, because operators search for it.

```
Long queues. One typist. Applications rejected for one wrong letter. Photos that are never under 50 KB.

Voice Form Filler (Voice2Fill) is built for the counters where these problems happen every day: e-Sevai and common service centres, browsing centres, help desks and offices that fill online forms for other people.

The applicant scans a QR code and speaks their answers on their own phone, in Tamil, English or Tanglish. The form on your computer fills itself in English. You check it and submit it, as you always do.

நீண்ட வரிசை, ஒரே ஒரு தட்டச்சாளர், ஒரு எழுத்துப் பிழையால் நிராகரிக்கப்படும் விண்ணப்பம் — சேவை மையங்களின் அன்றாடச் சிக்கல்கள் இவை. Voice2Fill மூலம் விண்ணப்பதாரர் தமது phone-இல் தமிழில் பேசினால் போதும்; கணினியில் உள்ள form ஆங்கிலத்தில் தானாக நிரம்பும். நீங்கள் சரிபார்த்துச் சமர்ப்பிக்கலாம்.


THE PROBLEMS IT SOLVES


1. "The queue is long, and there is only one of me."

One operator, one keyboard, one applicant at a time. On rush days, when a new scheme opens, people wait for hours or walk to the next centre.

With Voice2Fill:
• Up to 5 forms fill at the same time, one per browser tab, each with its own QR code and its own applicant's phone.
• People in the queue start giving their details while you finish with the current applicant.
• "Start over" clears the answers, so the next applicant can use the same QR code.
• The same staff serve more people, without extra computers.

ஒரே நேரத்தில் 5 விண்ணப்பதாரர்கள் தங்கள் சொந்த phone-இல் விவரங்களைக் கூறலாம். காத்திருப்பு நேரம் குறையும்.


2. "One wrong letter, and the application is rejected."

Names, initials, father's names and village names are easy to mistype when they are read out across a busy counter. A rejected application means the citizen has to come back, and your centre takes the blame.

With Voice2Fill:
• The applicant sees their own answers on their phone and checks them before sending.
• Names can be spelled letter by letter, including Tamil letter names: "J A G A N" becomes "Jagan".
• Corrections work the way people talk: "no, not Jahan, Jagan", "the last digit is 5", "pincode la 455 illa 445".
• Any single field can be corrected with its own mic, or typed.
• When an answer could match more than one option, the phone asks "Which one did you mean?" with buttons. Nothing is guessed silently.
• Each filled field is outlined on the computer's form, so you can review it at a glance. Undo puts the page back the way it was.

விண்ணப்பதாரரே தமது விவரங்களை phone-இல் சரிபார்க்கிறார். தெளிவில்லாத பதில்கள் ஊகிக்கப்படுவதில்லை; உறுதிசெய்யக் கேட்கப்படும்.


3. "The applicant speaks Tamil. The form is in English."

Many applicants cannot read an English form, so every label has to be explained across the counter, one field at a time.

With Voice2Fill:
• Applicants speak in Tamil, English or Tanglish, even mixed in one sentence ("en peru Ramesh, ooru Chennai"). The form is filled in English.
• The whole phone screen switches between தமிழ் and English.
• Every field shows both languages: "தந்தை பெயர் · Father's name".
• The Tamil helper (the த bubble on the phone) turns any English label or help line into Tamil, so the applicant understands what is being asked.

தமிழில் பேசினால் போதும்; form ஆங்கிலத்தில் நிரம்பும். ஒவ்வொரு field-உம் தமிழிலும் ஆங்கிலத்திலும் காட்டப்படும்.


4. "Photo must be JPG, under 50 KB." "Upload all pages as one PDF."

Every website has its own upload rules. Resizing photos on separate websites, scanning pages one by one and moving files between phones often takes longer than filling the form itself.

With Voice2Fill:
• The extension reads the website's upload rules ("JPG only, below 50 KB", exact pixel size, page limits).
• The applicant takes a photo on their phone, then rotates or crops it, or adds more pages.
• The phone converts it to fit: a compressed JPG, or several pages combined into one A4 PDF.
• The file goes into the website's own upload field, so the site checks it as usual. If the site rejects it, the phone shows why.
• Location and camera details are removed from photos.

Photo, PDF ஆகியவற்றை website-இன் விதிகளுக்கு ஏற்ப phone தானாக மாற்றுகிறது. தனியாக resize செய்ய வேண்டியதில்லை.


5. "Citizens' ID cards and photos are piling up on our phones."

When documents are forwarded through personal chat apps, they stay on staff phones long after the application is done. That is a risk for the citizen and for your centre.

With Voice2Fill:
• Photos and PDFs go straight from the applicant's phone into the form, and are then deleted.
• Voice recordings are never stored.
• Spoken answers are deleted automatically within about an hour.

ஆவணங்கள் நேரடியாக form-க்குச் சென்று, பின்னர் நீக்கப்படுகின்றன. ஊழியர்களின் phone-இல் எதுவும் தங்குவதில்லை.


6. "The counter is noisy." "The applicant would rather type."

Not everyone wants to say their details aloud at a busy counter.

With Voice2Fill:
• Tick "Typing only" before you scan. The applicant types the answers on their own phone, with no microphone.
• Typing-only forms use no voice minutes.
• Voice can be turned on or off at any time from the extension.

பேச விருப்பமில்லையா? "Typing only" முறையில் விண்ணப்பதாரர் தமது phone-இல் தட்டச்சு செய்யலாம். Voice minutes செலவாகாது.


7. "Long application forms keep changing as you fill them."

State → District → Taluk → Village dropdowns that load one after another. A second page that appears only after the first. Fields that change when you choose "Individual" or "Organisation".

With Voice2Fill:
• Cascading dropdowns are filled in order. It waits for each list to load and picks the option that was spoken, even with spelling variants ("Omaloor" or "Omalur").
• Multi-step forms: fields on the next step, or fields that appear after ticking "Other", are added to the phone right away.
• Forms with branches: when the applicant switches branch, the fields that left the page are set aside with their answers kept, and come back if the branch is chosen again.
• An answer given for a field that is not on the page yet waits, and fills as soon as the field appears.

State, District, Taluk, Village போன்ற தொடர் dropdown-களும், பல படிகள் கொண்ட form-களும் வரிசைப்படி நிரப்பப்படும்.


8. "Our fastest typist left."

A centre should not depend on one person's typing speed. With Voice2Fill, anyone who can read the screen can run the counter: the applicant speaks, and the operator checks and submits.

தட்டச்சு வேகம் இனி தடையல்ல. திரையைப் படிக்கத் தெரிந்த எவரும் counter-ஐ நடத்தலாம்.


HOW IT WORKS

1. Open the web form and click the extension → "Scan form on this page".
2. The applicant scans the QR code with their phone. No app to install; it opens in the phone's browser.
3. They tap the mic and speak: "My name is Ramesh Kumar, phone 98765 43210, district Salem."
4. Press "Fill form" once. New answers then fill the page automatically, and each changed field is highlighted.
5. Check the form and submit it yourself. Voice2Fill never submits a form for you.


FEATURES AT A GLANCE

• Works on React, Vue, Angular and plain HTML forms. Values are entered the way a person types, so the site's own checks run.
• Custom dropdowns: react-select, MUI, choices.js, select2 and standard accessible comboboxes.
• Forms inside frames and shadow DOM on the same site.
• Numbers can be said in pieces ("nine eight seven six…" or "98765 – 43210").
• Speak as long as you need. Long answers are processed in pieces, so nothing is lost.
• Recording stops by itself after a few seconds of silence, so pauses don't use up minutes.
• Voice tips, in Tamil and English, show applicants how to speak so answers come out right the first time.
• The popup shows the form in the tab you opened it on, with fields sorted by what needs you: needs a look, filled, not answered yet.
• If the phone page is closed, "Connect phone again" shows the QR code again, with every answer kept.
• The phone page and its messages are in Tamil and English: blocked microphone, lost connection, expired QR code, required fields still empty.


PRIVACY

• Voice recordings are never stored. They are processed and discarded in the same request.
• Spoken answers and their text are deleted automatically within about an hour.
• Uploaded photos and PDFs are stored privately and deleted as soon as the computer receives them, or when the tab closes.
• QR codes work once and expire after 10 minutes. A phone link lasts 30 minutes.
• The extension reads nothing on a website until you tap "Scan form on this page".
• Nothing is sold or used for advertising.


PLANS

Voice Form Filler needs a Voice2Fill account. Every new account starts with a free 7-day trial with 15 voice minutes. After that, choose a monthly plan with the voice minutes you need.
• Only the time the microphone is recording counts.
• Scanning forms, filling them, photo uploads, typing-only forms and the Tamil helper use no voice minutes.
To get an account or renew, contact us: {{ACCOUNT_CONTACT}}


WHAT YOU NEED

• A Voice2Fill account (phone number and PIN; free trial for new accounts)
• A phone with a browser and a microphone
• Chrome on the computer with the form


NOT SUPPORTED (YET)

• Upload fields inside another website's embedded frame
• Saving details to reuse on future forms
```

---

## Single purpose (dashboard → Privacy tab)

```
Fill web forms on the current page from answers the user speaks or photographs on their phone.
```

## Permission justifications

| Permission | Justification to paste |
| --- | --- |
| `storage` | Keeps the user signed in and remembers the active form session for each tab. |
| `activeTab` | Reads the form fields on the tab where the user clicked "Scan form on this page". |
| `scripting` | Injects the form detector and filler into the tab the user chose to fill, and registers it for a site the user allowed, so the form's next pages fill too. |
| Host permission: API server | Sends the detected form fields and receives the values the user spoke on their phone. |
| Host permission: Supabase | Receives new values in real time while the user speaks, so the form updates without reloading. |
| Optional host permissions (`http://*/*`, `https://*/*`) | Not granted at install. When the user taps "Scan form on this page", Chrome asks for that one site. Once allowed, the form detector loads on that site's pages (a form's next step or a reload); it never runs on other sites. The user can remove the access in Chrome at any time. |

## Data usage disclosures (tick these)

Google counts data as collected if the extension collects, sends, uses or shares it, even data that stays on the device ([User Data FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq)). What you tick here must match the privacy policy and what the extension really does.

| Category | Tick? | Why |
| --- | --- | --- |
| Personally identifiable information | Yes | Names, phone numbers, addresses and ID numbers spoken into forms; the user's own phone number for sign-in |
| Authentication information | Yes | Phone number and PIN; the session token kept in `chrome.storage` |
| Website content | Yes | Field labels, dropdown options and upload rules of the form being filled |
| Web history | Yes | The scan sends the form page's URL (`schema.page_url`), and the phone shows its site name. Google counts URLs as web browsing activity. |
| Personal communications | Yes, to be safe | Voice recordings are sent for transcription. They are captured on the phone web page, not by the extension, but the store's reviewers may count them. |
| Health, financial, location, user activity | No | Not collected. A form may ask for health or bank details, but those go into the PII values above, and the extension doesn't look for them. |

Then tick all three certifications:
- not sold to third parties
- not used for unrelated purposes
- not used for creditworthiness or lending

**Limited Use:** you also certify that data is only used for the extension's purpose, is never used for ads, and is never read by people.
- The admin panel shows usage numbers only, not transcripts or values. That's correct; keep it that way.
- Add a Limited Use statement to the privacy policy. Google requires it on the homepage or one click away from it.

## Consent inside the extension (required, missing now)

The User Data FAQ requires a **clear notice inside the extension, and a user action to agree, before any data is collected**. A notice that is only in the privacy policy or on the store page doesn't count.
- **Currently:** the sign-in and Scan cards have no notice, so this has to be fixed before you submit.
- **Fix:** add a short notice to the sign-in card (`SignIn` in `apps/extension/src/popup/App.tsx`), linked to the privacy policy. Signing in then counts as agreeing. Example wording:
  > Scanning sends this page's address and form fields to Voice Form Filler. Your spoken answers are turned into text by Sarvam AI and OpenAI and deleted within about an hour. [Privacy policy]
- Clicking "Scan form on this page" afterwards is the action that starts collection, so the notice must appear before the first scan.

## Minimum permissions (reviewers check this)

The privacy page says that asking for more permissions than you need can get the extension rejected.
- **Done:** the manifest has no `content_scripts`. Nothing runs on any website until the user taps Scan form.
- **How:** on Scan, the popup asks Chrome for that one site (`chrome.permissions.request`). Once allowed, the worker registers the detector for that site only (`chrome.scripting.registerContentScripts`), so a wizard's next page and reloads keep working (watcher and tab-moved checks unchanged). If the user says No, the page is still scanned once through `activeTab`.
- **Removing access** in Chrome unregisters the detector for that site.

## Remote code

```
No, I am not using remote code.
```
All JavaScript is bundled into the extension by Vite. Supabase Realtime and the API only send data, not code.

## Privacy policy (required)

The store will not accept the listing without a privacy policy URL. Host one (for example `/privacy` on the Next.js app). It must name the processors:

- **Sarvam AI**: speech to text
- **OpenAI**: reading the form and turning the transcript into field values
- **Supabase**: database, real-time updates and file storage
- **Vercel**: hosting

It must also say:
- **What is collected, how it is used and when it is shared:** match the data table above.
- **How long it is kept:** audio is never stored; transcripts and values are deleted within about an hour; files are deleted when the computer has them; session records are kept 30 days (after step 1.6).
- **How it is protected:** HTTPS/WSS for every connection; Supabase encrypts data at rest; QR codes work once and expire.
- **Limited Use:** "The use of information received from this extension follows the Chrome Web Store User Data Policy, including the Limited Use requirements."
- **Who to contact** about access or deletion.

Put the same URL in the dashboard's Privacy tab and on your developer account page. Google checks that they match.

## Images

This plan follows Google's [listing guidelines](https://developer.chrome.com/docs/webstore/best-listing).

**Rules that apply to all images**
- Every image shows only what the app really does: the real popup and phone screens, with their real colours, icons and on-screen text.
- Keep the branding the same in all of them: accent blue `#1e4e9c` / `#dce8fb`, the red mic button `#d4433d`, and the warm page colour `#faf9f7`.
- Keep text short: one headline of 3 to 5 words per image, plus at most one short line under it.
- Don't claim things like "Number one", "Editor's choice", "best" or "fastest", and don't mention other extensions.
- Use PNG, at full resolution, the right way up.
- Form data is made up (Ramesh Kumar, Salem…). The form page is a generic "Applicant registration" page, with no logo or name of any real portal or government.

### Store icon (128×128 PNG), needed first

The extension has no icon yet: `apps/extension/public` is empty and the manifest has no `icons`.
- **Design:** the white Lucide `mic` on a blue `#1e4e9c` rounded square.
- **Size:** 96×96 artwork centred in 128×128, with transparent padding (Chrome's icon guidance).
- **No UI or screenshots in the icon.**
- **Export 16, 32, 48 and 128 px** and add them to the manifest (`icons` and `action.default_icon`), so the toolbar icon matches the store icon.

### Screenshots (1280×800 PNG, 5)

Full bleed with square corners: the background fills the whole image, with no outer padding or rounded frame.
Each one has a short headline on the left and the real UI on the right.

| # | Headline | What it shows (all from the real app) |
| --- | --- | --- |
| 1 | **Scan once, then just talk** | A form page in Chrome, with the popup's QR card: form name, "14 fields" pill, QR code, "Scan with your phone", "Expires in 9:42". |
| 2 | **Speak Tamil, English or Tanglish** | The phone mid-recording ("Listening… 0:07", red mic, transcript quote) next to the form, with a newly filled field outlined in yellow `#f2b705` (the filler's real highlight). The popup shows "Phone paired · Live" and the values. |
| 3 | **Dependent dropdowns, filled in order** | State → District → Taluk → Village on the form, and the phone's review screen with a "Pick one" row: "You said “…”. Which one did you mean?" and option buttons. |
| 4 | **Photos sized to the site's rules** | The phone's file sheet ("Applicant photo", "JPG · max 50 KB", thumbnail with rotate/crop, "Ready: JPG · 38 KB", "Send to computer"), and the popup row "✓ 38 KB". |
| 5 | **Paper documents to one PDF** | The phone's document sheet ("Address proof", "JPG / PDF · max 500 KB · up to 3 pages", two page photos with rotate/crop/delete, "Add page", "Ready: PDF (2 pages) · 412 KB", "Send to computer"). The site's own Upload button is outlined in yellow, and the popup shows "✓ 412 KB" and "Click “Upload” next to this field on the page". |

Tamil versions of the screenshots can only be uploaded if the extension itself supports Tamil. That needs a `_locales/ta/messages.json` in the extension, and the extension has no `_locales` yet. The promo tile and marquee can't be localized. Optional; skip it for the first release.

### Small promo tile (440×280 PNG or JPEG)

It appears in search results and on category pages, so it matters more than the marquee.
- **Not a screenshot:** use the brand mark and a simple drawing instead.
- **Saturated background, no large white or light grey areas:** a blue `#1e4e9c` background filling the whole tile.
- **Visual:** the red mic button with a white mic, sound arcs, and a simple phone → form shape.
- **Text:** "Voice Form Filler" and, under it, "Speak. It fills."
- **Check it at half size (220×140):** the mic and the name must still be readable.

### Marquee (1400×560 PNG), optional

It is only used if Google picks the item for the homepage carousel.
- **Same look as the promo tile, with more room:** headline on the left, a simple phone + form drawing on the right.
- **Keep it uncluttered:** at most the headline and one short line under it.

### Video (optional)

A 30 to 45 second screen recording on YouTube. Show: scan QR → speak a Tanglish sentence → form fills → upload a photo → Undo. Use the same made-up data as the screenshots.

## Other dashboard fields

| Field | What to enter |
| --- | --- |
| Official URL | Optional. A site you have verified in Google Search Console. Once verified, it shows under the listing title; without it, the store shows your publisher name. |
| Homepage URL | A page describing the extension's features. The current `apps/web/app/page.tsx` is one card with an "Admin panel" link, so it needs a short features page with links to the privacy policy and support. |
| Support URL | A contact page or email address. The store also has a built-in support hub. |
| Mature content | Off |
| Distribution → regions | All regions by default. Set it to India if the service is only for Indian forms. |


---

## How this differs from the competitors (internal only)

Don't paste this table or name these extensions anywhere in the listing: Google's guidelines say not to mention other extensions.

| | QuickForm (50k users, 4.8★) | Fill A Form AI (1k, 2.3★) | AI Auto Form Filler (10k, 3.2★) | **Voice form filler** |
| --- | --- | --- | --- | --- |
| Input | Record a form once, replay it | Saved profile / knowledge base | Pasted plain text | **Voice on phone** |
| Works for a new person each time | No (needs a profile per person) | No | Partly (paste new text) | **Yes** |
| Tamil / Tanglish | No | No | No | **Yes** |
| File/photo uploads | No | No | No | **Yes, resized to site rules** |
| Cascading dropdowns | Delays only | No | No | **Yes** |
| Stores your personal data | Yes, synced online | Yes, synced | Locally | **Answers auto-deleted within ~1 hour** |
| Multi-step forms | Auto-click | — | Click Fill on each step | **New fields appear on phone automatically** |

Competitor descriptions focus on saving data so it can be reused. Our listing leads with what they can't do: filling a form for a new person by voice, in Tamil, including photos, without storing anything.

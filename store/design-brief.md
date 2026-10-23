# Design brief: Voice Form Filler store assets

These are prompts for Claude Design, covering every image and the video in the store plan ([chrome-web-store.md](chrome-web-store.md) → Images).

**How to use**
1. Start one Claude Design project. Paste **Prompt 0 (shared brief)** first, once.
2. Then paste the asset prompts one at a time, in order: icon first, because every other asset uses it.
3. Export each asset at the exact size listed, as PNG, and check it against the **checklist** at the end.

Everything in the prompts comes from the app's code: the colours (`packages/shared/ui/tokens.css`), the components (`apps/extension/src/popup`, `apps/web/app/s/[code]`) and the on-screen wording (`apps/web/lib/i18n.ts`). If the app's UI changes, update this file before making new images.

---

## Prompt 0: shared brief (paste first)

```
You are designing Chrome Web Store assets for a real Chrome extension called "Voice Form Filler". Every screen you draw must look like the real app described below. Do not invent features, buttons, badges, ratings or text that are not listed here.

WHAT THE PRODUCT DOES
A Chrome extension reads the form on a desktop web page and shows a QR code. The user scans it with their phone, taps a mic and speaks the answers in Tamil, English or Tanglish. The answers appear on the computer's form. Photos and documents for upload fields are taken on the phone, converted to the site's size rules and put into the form. The user always checks and submits the form themselves.

BRAND
- Name: Voice Form Filler
- Mark: the Lucide "mic" icon (outline, 2px stroke, round caps), white on a blue rounded square.
- Tone: calm, practical, trustworthy. For service-centre operators and office staff in Tamil Nadu. Not flashy, not "AI magic".

COLOURS (use these exact values)
Brand blue (saturated, for backgrounds of promo art): #1E4E9C
Light blue (accent background, selected tabs, pills): #DCE8FB
Red (mic button): #D4433D
Highlight yellow (outline around a field that was just filled on the web page): #F2B705
App UI colours:
  page background #FAF9F7 · card #FFFFFF · subtle #F4F3F0 · border #E5E3DF
  text #1F1E1C · muted text #6B6863
  accent text #1E4E9C on #DCE8FB
  "live"/success text #1F6B2A on #D7F0D9
  warning text #7A5000 on #F9E2B0
  danger text #A32B26 on #FBE0DE
Do not use gradients, glows, neon or purple.

TYPE
System UI sans-serif (Segoe UI / Roboto / Inter look). For Tamil text use Noto Sans Tamil.
Headlines: semibold, sentence case. UI text inside the app screens: 14px body, 12px small, 16px titles (at 1x).

APP UI COMPONENTS (draw the app screens with exactly these)
- Card: white, 1px #E5E3DF border, 12px radius, 16px padding.
- Button (outline): white, 1px border, 8px radius, 40px tall, 14px medium text, optional 16px Lucide icon left of the label.
- Button (primary): background #1F1E1C, text #FAF9F7, 8px radius, 40px tall.
- Pill: 6px radius, 12px medium text, 2px×8px padding. Tones: accent (#1E4E9C on #DCE8FB), live (#1F6B2A on #D7F0D9), warn (#7A5000 on #F9E2B0), danger (#A32B26 on #FBE0DE), neutral (#6B6863 on #F4F3F0).
- Field row: label on the left (text at 80% opacity), value right-aligned in medium weight, 1px divider between rows. A filled value has a small green (#1F6B2A) check icon before it.
- Icons: Lucide, outline, 2px stroke.

THE TWO APP SCREENS
1) Extension popup: 360px wide, page colour #FAF9F7 with 12px padding, one card inside. It opens under the Chrome toolbar icon.
2) Phone page: mobile web page in a plain modern phone frame, page colour #FAF9F7, 16px side padding. Top right: a small outline button that switches language ("தமிழ்" when in English, "English" when in Tamil). Below it, cards.

SAMPLE DATA (made up; use it consistently)
Form name: "Applicant registration" · 16 fields · site shown on phone: "forms.example.in"
Name: Ramesh Kumar · Father's name: Murugan · Date of birth: 12-03-1988 · Gender: Male
Mobile number: 9876543210 · Email: ramesh.kumar@example.com
State: Tamil Nadu · District: Salem · Taluk: Omalur · Village: (being picked)
Upload field 1: "Applicant photo", rules "JPG · max 50 KB", result 38 KB
Upload field 2: "Address proof", rules "JPG / PDF · max 500 KB · up to 3 pages", result a 2-page PDF of 412 KB

THE DESKTOP WEB PAGE (background of screenshots)
A generic, plain registration form in a Chrome window: title "Applicant registration", two-column grey-bordered inputs, labels above inputs. No logo, emblem, seal, flag or name of any real government, department, bank or portal. URL bar: "forms.example.in/register".

STORE RULES (must follow)
- No "best", "#1", "fastest", "Editor's choice", star ratings, user counts or awards.
- No other company's logo. Only the Chrome window shape and toolbar.
- Little text: one headline of 3 to 5 words plus at most one short line per image.
- Images are full bleed: the background fills the whole canvas, square corners, no outer margin or drop-shadow frame around the whole image.
- Text must stay readable when the image is shown at half size.

Reply "Ready" and wait for the first asset prompt.
```

---

## Prompt 1: store and toolbar icon

```
Create the extension icon.

- Canvas 128×128 px, transparent background.
- Artwork: a rounded square 96×96 px, centred (16 px transparent padding on every side), fill #1E4E9C, corner radius about 22 px.
- Inside: the Lucide "mic" icon in white, about 56 px tall, centred, stroke scaled so it reads at small sizes (about 9 px at this size).
- Flat. No text, no gradients, no shadow, no extra sound waves.

Then make versions for 48×48, 32×32 and 16×16. For 16 px, drop the padding (artwork fills about 14 px) and thicken the stroke so the mic is still recognisable.

Export: icon-128.png, icon-48.png, icon-32.png, icon-16.png.
```

---

## Prompt 2: screenshot 1 – "Scan once, then just talk"

```
Screenshot 1 of 5. Canvas 1280×800 px, full bleed.

Layout: left 40% is a solid #1E4E9C panel with text; right 60% is a soft #FAF9F7 area showing the product.

Left panel (white text, left-aligned, vertically centred, 64 px left margin):
- Small icon (from Prompt 1) and the name "Voice Form Filler" in 20 px semibold.
- Headline, 44 px semibold, 2 lines max: "Scan once, then just talk"
- One line, 20 px, 80% white: "Click Scan, then scan the QR code with your phone."

Right side: a Chrome window (light theme) cropped at the right edge, showing the generic "Applicant registration" form from the brief. The extension popup is open, attached under the toolbar icon at the top right of the window, drawn at about 1.3x so it is easy to read. Popup content, top to bottom, inside one card:
  - Row: Lucide "clipboard-list" icon + "Applicant registration" (14px semibold), and on the right an accent pill "16 fields".
  - A QR code, 176×176 px at 1x, on white with 4 px padding and 6 px radius, centred. Use a real-looking QR pattern.
  - "Scan with your phone" (14 px, centred).
  - Lucide "clock" icon (12 px) + "Expires in 9:42" (12 px muted, centred).
  - "Cancel" as a small muted text link, centred.
Nothing else in the popup.
```

## Prompt 3: screenshot 2 – "Speak Tamil, English or Tanglish"

```
Screenshot 2 of 5. Canvas 1280×800 px, full bleed. Same split layout as screenshot 1.

Left panel text:
- Headline: "Speak Tamil, English or Tanglish"
- Line: "The form fills as you speak."

Right side, two things side by side:

A) A phone (front, upright, plain modern frame) showing the phone page:
  - Top right: small outline button "தமிழ்".
  - Card 1:
      Title "Applicant registration" (16px semibold), under it "forms.example.in" (12px muted).
      Two tabs: "Full form" (selected: #DCE8FB background, #1E4E9C text) and "Field by field" (outline).
      A big round red (#D4433D) button, 96 px, with a white square "stop" icon, a soft red ring around it (recording state).
      Under it in red medium text: "Listening… 0:07".
      A quote box (#F4F3F0, 8px radius, 14px text): “என் பேரு Ramesh Kumar, அப்பா பேரு Murugan, mobile number 9876543210”
      (Tamil words appear in Tamil script and English words in English letters: this is how the real speech-to-text writes Tanglish.)
  - Under the card: an outline button, full width: "Check before sending · 6/16 ›".

B) Behind/left of the phone, the Chrome window with the form. The "Mobile number" input shows "9876543210" with a 2px #F2B705 outline 2px outside the input (the real "just filled" highlight). Name and Father's name are already filled.
  The extension popup is open on the window:
    - Header: Lucide "smartphone" icon + "Phone paired" (14px semibold); on the right a live pill "Live".
    - Small muted line: "Applicant registration".
    - Field rows: Name — Ramesh Kumar · Father's name — Murugan · Mobile number — 9876543210 · Email — "—" (muted) · Date of birth — warn pill "Missing".
    - Two buttons in a row: "Fill form" (wide) and "Undo".
    - Small muted line: "New answers from your phone fill in automatically."
```

## Prompt 4: screenshot 3 – "Dependent dropdowns, filled in order"

```
Screenshot 3 of 5. Canvas 1280×800 px, full bleed. Same split layout.

Left panel text:
- Headline: "Dependent dropdowns, filled in order"
- Line: "Unclear answers come to your phone to pick."

Right side:

A) Chrome window with the form scrolled to an "Address" section: four dropdowns in a row or a 2×2 grid, with small arrows between them showing the order: State "Tamil Nadu" → District "Salem" → Taluk "Omalur" → Village (empty, showing "Select village").

B) A phone showing the review screen:
  - Card header: Lucide "arrow-left" icon button + "Check before sending" (16px semibold).
  - Field rows (with dividers): State — ✓ Tamil Nadu · District — ✓ Salem · Taluk — ✓ Omalur · Village — warn pill "Pick one", with a small muted sub-line under the value: You said “Kanniyampatti”.
  - The Village row is expanded underneath: a pale amber box (#F9E2B0 at 60%) with amber text "You said “Kanniyampatti”. Which one did you mean?" and two white outline option buttons: "Kanniyampatti" and "Kanniyampatti Pudur".
  - Under the rows, small muted text: "Tap any value to edit or re-speak it."
  - At the bottom of the card, a full-width outline button with a Lucide "send" icon: "Send to desktop".
```

## Prompt 5: screenshot 4 – "Photos sized to the site's rules"

```
Screenshot 4 of 5. Canvas 1280×800 px, full bleed. Same split layout.

Left panel text:
- Headline: "Photos sized to the site's rules"
- Line: "Take a photo. The phone makes it fit."

Right side:

A) A phone showing the photo sheet: a card with a light blue border (#1E4E9C at 40%):
  - Title "Applicant photo" (16px semibold), under it "JPG · max 50 KB" (12px muted). Top right: an "x" close icon button.
  - One thumbnail tile (3:4, rounded, light border) with a passport-style photo of a person shown as a simple flat placeholder silhouette (no real face). Under the thumbnail, three small icon buttons: rotate (Lucide "rotate-cw"), crop (Lucide "crop"), delete (Lucide "trash-2", red).
  - Green text (#1F6B2A, 14px): "Ready: JPG · 38 KB".
  - Full-width primary dark button: "Send to computer".

B) The Chrome window with the form's "Upload photo" field: a file input showing "photo.jpg" outlined with a 3px #F2B705 highlight.
  The popup open beside it, with rows: Name — Ramesh Kumar · Applicant photo — "✓ 38 KB".
```

## Prompt 6: screenshot 5 – "Paper documents to one PDF"

```
Screenshot 5 of 5. Canvas 1280×800 px, full bleed. Same split layout.

Left panel text:
- Headline: "Paper documents to one PDF"
- Line: "Photograph each page. The phone makes one PDF within the site's limit."

Right side, two things side by side:

A) A phone showing the document sheet: a card with a light blue border (#1E4E9C at 40%):
  - Title "Address proof" (16px semibold), under it "JPG / PDF · max 500 KB · up to 3 pages" (12px muted). Top right: an "x" close icon button.
  - A 3-column grid with two thumbnail tiles (3:4, rounded, light border). Each tile shows a photo of a paper page, drawn as a flat placeholder: an off-white sheet on a dark table, with grey text lines and a small grey box for a stamp. No readable text, no real document design, no emblem.
    Under each thumbnail, three small icon buttons: rotate (Lucide "rotate-cw"), crop (Lucide "crop"), delete (Lucide "trash-2", red). On the second tile, the crop icon is blue (#1E4E9C) because that page was cropped.
  - A row of two buttons: outline button with a Lucide "camera" icon, "Add page"; ghost (text-only, muted) button with a Lucide "file-up" icon, "Choose file".
  - Green text (#1F6B2A, 14px): "Ready: PDF (2 pages) · 412 KB".
  - Full-width primary dark button: "Send to computer".
  Above the card, partly visible, the phone's "Photos and documents" card (small uppercase muted heading) with two rows: Applicant photo — green text "On the computer ✓" · Address proof — warn pill "Add".

B) The Chrome window with the form's "Documents" section: an "Address proof" file input showing "address-proof.pdf", and next to it the site's own "Upload" button, outlined with a 3px #F2B705 highlight (the extension highlights the site's own Upload button when the page has one).
  The popup open beside it, with rows:
    Applicant photo — "✓ 38 KB"
    Address proof — "✓ 412 KB", with a small blue (#1E4E9C) sub-line under it: Click “Upload” next to this field on the page
```

---

## Prompt 7: small promo tile (440×280)

```
Small promo tile. Canvas exactly 440×280 px, full bleed, PNG.

This is promotional art, not a screenshot.
- Background: solid #1E4E9C filling the whole tile. No white or light-grey areas larger than a small shape.
- Left: the red (#D4433D) round mic button (about 96 px), with a white Lucide mic inside and two thin white sound arcs on its right.
- Right of the mic, a simple flat drawing: a small phone outline → a dotted line → a small form outline with three lines, the top one highlighted with a #F2B705 outline.
- Text, white, left-aligned under or beside the art:
    "Voice Form Filler" (26 px semibold)
    "Speak. It fills." (18 px, 85% white)
- Nothing else. Check that the name and mic are still clear when the tile is shown at 220×140.
```

## Prompt 8: marquee (1400×560), optional

```
Marquee promo image. Canvas exactly 1400×560 px, full bleed, PNG.

Same look as the small promo tile, with more space:
- Background solid #1E4E9C.
- Left half: "Voice Form Filler" (36 px semibold, white), then the headline "Speak in Tamil or English. The form fills itself." (48 px semibold, white, 2 lines max).
- Right half: a flat drawing of a phone with the red mic button and a sound wave, connected by a dotted line to a desktop browser outline showing a form with two fields highlighted in #F2B705. Simple shapes, no real UI text.
- Uncluttered: no other text, no badges.
```

---

## Prompt 9: promo video (optional)

Google says screenshots and video should show the real product. The most honest video is a **screen recording of the real app**, using the storyboard below with the same sample data. Use the Claude Design prompt only if you can't record the real app yet.

**Storyboard (about 40 seconds, 1920×1080, no voice-over needed, captions on screen)**

| Time | On screen | Caption |
| --- | --- | --- |
| 0–4 s | Icon + name on #1E4E9C | Voice Form Filler |
| 4–10 s | Chrome with the form → click the toolbar icon → "Scan form on this page" → QR card appears | Scan the form |
| 10–14 s | Phone camera scans the QR; the phone page opens | Open it on your phone |
| 14–24 s | Tap the red mic, "Listening… 0:07", transcript appears; on the computer, fields fill one by one with the yellow outline | Speak in Tamil, English or Tanglish |
| 24–30 s | Village "Pick one" on the phone → tap "Kanniyampatti" → the village dropdown on the computer fills | Pick when it's unclear |
| 30–36 s | Photo sheet → "Ready: JPG · 38 KB" → "Send to computer" → the upload field shows photo.jpg | Photos sized to fit |
| 36–40 s | The full form on the computer, the cursor near the site's own Submit button (not clicked) → end card with icon and name | You check. You submit. |

```
Create an animated storyboard video, 1920×1080, about 40 seconds, that plays the scenes in the table below in order with smooth, simple transitions (fade or slide, no 3D, no particles). Use the components, colours, sample data and screen contents from the shared brief and from screenshots 1–4 exactly. Each scene shows its caption in white on a #1E4E9C bar at the bottom left, 40 px semibold. Show the yellow #F2B705 outline briefly on each field as it fills. The video ends on the icon and "Voice Form Filler" on #1E4E9C. No music cues, logos of other companies, ratings or claims.

[paste the storyboard table here]
```

Upload the video to YouTube (public or unlisted) and paste the link in the dashboard.

---

## Checklist for every exported asset

- [ ] **Exact size:** icon 128×128 (plus 48, 32, 16); screenshots 1280×800; promo tile 440×280; marquee 1400×560.
- [ ] **Format and framing:** PNG; square corners; background reaches every edge.
- [ ] **Only real features, with the app's real wording.** Compare against the prompts above.
- [ ] **Made-up data only:** no real people, real Aadhaar/ID numbers, or real email addresses.
- [ ] **No real portal names or logos:** no government emblem, department or bank, and no other company's logo.
- [ ] **No claims:** no "best", ratings, user counts or awards.
- [ ] **Tamil renders correctly.** Ask a Tamil reader to check the transcript in screenshot 2 and the "தமிழ்" button.
- [ ] **Half-size check:** the promo tile is still clear at 220×140.
- [ ] **Same branding everywhere:** the icon, blue and mic match across all assets.

When the icon is ready, save the PNGs to `apps/extension/public/icons/` (plan step 1.1).

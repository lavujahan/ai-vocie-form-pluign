# Design brief: website marketing posters (hooks, fears, benefits)

These are prompts for **Claude Design**, for the posters in marketing sections 4 (hooks), 5 (fears) and 6 (benefits).

**How to use**
1. Start a new Claude Design project. Paste **Prompt M0 (shared brief)** first, once.
2. Then paste the poster prompts one at a time, in order.
3. Export each poster in both sizes, **1600×900** for desktop and **1080×1350** for mobile and WhatsApp, and check it against the checklist at the end.

The style comes from the app itself: the colours from `packages/shared/ui/tokens.css`, and the components and wording from [design-brief.md](design-brief.md).
The posters can be a bit bolder than the store screenshots: bigger headlines, a gold background colour, and flat illustrated people. They must still look like the same product.

---

## UI/UX style analysis (what the posters must keep)

| Element | In the app | On posters |
| --- | --- | --- |
| Mood | Calm, practical, trustworthy; not "AI magic" | Same. No gradients, glows, neon, purple, robots or sparkles |
| Brand blue `#1E4E9C` | Brand mark, accent text | Main background for hook posters |
| Honey gold `#EBC865` | Popup header, Tamil helper | Background for benefit posters; feels warm and local |
| Warm page `#FAF9F7` | Every page background | Background for the fear infographic |
| Red mic `#D4433D` | The record button | The hero object: "speak here" |
| Yellow outline `#F2B705` | Marks a field the moment it is filled | The "it worked" signal: always outline the filled fields |
| Status pills: amber warn, green live | "Needs a look" / "● Live", "Ready" | Problem = amber, solution = green (the app's own meaning) |
| Shapes | Cards 12 px radius, buttons 8 px, pills 6 px, 1 px warm borders, flat | Same, scaled up |
| Icons | Lucide outline, 2 px stroke | Same |
| Type | System sans, semibold, sentence case; Noto Sans Tamil | Big Tamil headline + smaller English line |
| Bilingual | "தந்தை பெயர் · Father's name" | Tamil first, English under it |
| Honesty | "You check. You submit." Never auto-submits | Every poster shows a person checking, never "auto-submit" |

---

## Prompt M0: shared brief (paste first)

```
You are designing website marketing posters for a real product called "Voice2Fill" (Chrome extension name: "Voice Form Filler"). The audience is e-Sevai / common service centre operators, browsing-centre owners and data-entry staff in Tamil Nadu, plus the citizens they serve.

WHAT THE PRODUCT DOES (do not invent anything else)
A Chrome extension reads the form on a desktop web page and shows a QR code. The applicant scans it with their own phone, taps a red mic and speaks the answers in Tamil, English or Tanglish. The answers appear on the computer's form (in English), and each filled field gets a yellow outline. Unclear answers come back to the phone as "Did you mean…?" buttons. Photos and documents are taken on the phone, converted to the site's size rules (e.g. "JPG · max 50 KB") and put into the form. Up to 5 forms can be filled at once, one per browser tab, each with its own QR code and phone. The operator always checks and submits the form; it never submits by itself. Voice is never stored; answers are deleted within about an hour; photos are deleted once the computer receives them.

BRAND
- Name on posters: "Voice2Fill". Mark: white Lucide "mic" icon (outline, 2px stroke, round caps) on a #1E4E9C rounded square.
- Main tagline (Tamil): "சொன்னா போதும்!"  English: "Speak. It fills."
- Tone: calm, practical, warm, local. Like a trusted shop poster, not a tech startup ad.

COLOURS (exact)
Brand blue #1E4E9C · light blue #DCE8FB · red mic #D4433D · highlight yellow #F2B705
Honey gold #EBC865 with line #CFA63C and ink #1A1813 · mild gold #FBF3DC
Page #FAF9F7 · card #FFFFFF · subtle #F4F3F0 · border #E5E3DF · ink #1F1E1C · muted #6B6863
Success/live: #1F6B2A on #D7F0D9 · Warning: #7A5000 on #F9E2B0 · Danger: #A32B26 on #FBE0DE
No gradients, glows, neon, purple, glassmorphism, 3D, robots, brains, sparkles or "AI" icons.

TYPE
Tamil: Noto Sans Tamil, semibold. Latin: Inter / Segoe UI look, semibold, sentence case.
Each poster: one big Tamil headline (2 lines max), one English line under it (about 45% of the Tamil size), and at most one short supporting line. Text must stay readable at half size.

ILLUSTRATION STYLE
Flat vector, simple shapes, 2-3 tones per object, soft rounded corners, thin outlines matching Lucide. People are Tamil Nadu locals drawn simply (an operator at a counter, an elderly woman in a saree, a young man, a student), friendly and dignified, with no detailed or photorealistic faces. Settings: a small service-centre counter with a desktop monitor, a printer and a queue. No government emblem, seal, flag, ministry, portal name, bank or any other company's logo. Monitors show a generic form titled "Applicant registration" at "forms.example.in".

PRODUCT UI SNIPPETS (draw these simply but faithfully when used)
- Phone page: background #FAF9F7, white cards (12px radius, 1px #E5E3DF border), a 96px round red #D4433D mic button, "Listening… 0:07" in red.
- Filled form field: input with a 2px #F2B705 outline around it.
- Pills: 6px radius, e.g. green "● Live", green "Ready: JPG · 38 KB", amber "Pick one".
- "Did you mean…?" box: pale amber (#F9E2B0 at 60%) with two white outline option buttons.
- QR card: white, rounded, with a QR pattern.

SAMPLE DATA (made up; never real people or ID numbers)
Ramesh Kumar · Murugan · 9876543210 · Lakshmi · Salem · Omalur · Kanniyampatti

LAYOUT RULES
- Make every poster in two sizes: 1600×900 (desktop, text left / art right) and 1080×1350 (mobile, text top / art bottom).
- Full bleed, square outer corners, generous margins (≥ 72px desktop, ≥ 64px mobile).
- Small Voice2Fill mark + name in a corner of every poster.
- No "best", "#1", "fastest", star ratings, user counts, awards, "government approved" or "official".
- Never say the product submits forms. Never show plan sizes as "number of forms"; plans are in minutes only.

Reply "Ready" and wait for the first poster prompt.
```

---

## Section 4: hook posters (blue)

Shared look for H1–H5: background **#1E4E9C**, white headline, English line at 85% white, art on the right. Make them a set: same grid, same headline position.

### Prompt H1: the typing race

```
Hook poster H1. Background #1E4E9C.

Headline (Tamil, white): "ஒரு ஃபார்முக்கு 10 நிமிஷம் டைப் பண்றீங்களா?"
English line: "Still typing every form by hand?"
Support line: "பேசுங்க… ஃபார்ம் தானா நிரம்பும்  ·  Speak, and the form fills itself."

Art: a split scene in two white-bordered panels side by side.
- Left panel, tinted #F4F3F0, labelled with a small neutral pill "Typing": a tired operator hunched over a keyboard, a wall clock, a long empty form on the monitor.
- Right panel, tinted #DCE8FB, labelled with a green pill "Voice2Fill": a relaxed citizen speaking into a phone with the red mic button glowing, sound arcs, and the monitor's form filled with 4 fields outlined in #F2B705. The operator sits relaxed with a hand near the mouse, checking.
Do not show a time number on the right panel.
```

### Prompt H2: the 50 KB photo

```
Hook poster H2. Background #1E4E9C.

Headline: "போட்டோ 50 KB-க்குள்ள வேணுமா?"
English line: "Photo must be under 50 KB?"
Support line: "The phone makes it fit. No resizer websites, no WhatsApp forwarding."

Art: a phone showing the photo sheet card: title "Applicant photo", muted line "JPG · max 50 KB", a 3:4 thumbnail with a flat silhouette (no real face) and small rotate / crop icons, green text "Ready: JPG · 38 KB", and a dark full-width button "Send to computer".
A dotted line from the phone to a desktop monitor where the form's "Upload photo" field shows "photo.jpg" with a #F2B705 outline.
Faded in the background, behind a soft #1E4E9C overlay: a crossed-out browser tab labelled "image resizer" and a crossed-out chat bubble icon (no WhatsApp logo).
```

### Prompt H3: Tamil in, English out

```
Hook poster H3. Background #1E4E9C.

Headline: "பாட்டி தமிழ்ல சொன்னாங்க… ஃபார்ம் இங்கிலீஷ்ல நிரம்புச்சு!"
English line: "She spoke Tamil. The form filled in English."
Support line: "Tamil, English or Tanglish — even mixed in one sentence."

Art: a smiling elderly woman in a saree holding a phone with the red mic button. A white speech bubble from her in Tamil script: "என் பேரு லட்சுமி, ஊரு சேலம்".
An arrow to a white form card with two fields, each outlined in #F2B705:
  "பெயர் · Name" → "Lakshmi"
  "மாவட்டம் · District" → "Salem"
```

### Prompt H4: the queue

```
Hook poster H4. Background #1E4E9C.

Headline: "வரிசையில 15 பேர். நீங்க ஒருத்தர் தான்."
English line: "15 in the queue. Only one of you."
Support line: "Up to 5 applicants fill 5 forms at once — on their own phones."

Art: a service-centre counter seen from the side. One calm operator at a desktop monitor that shows 5 browser tabs, each tab with a small green dot. In front of the counter, 5 different people (elderly man, young woman, student, mother, middle-aged man) each holding their own phone with the red mic button, speaking. Thin dotted lines from each phone to one tab. Behind them the queue is short and relaxed.
```

### Prompt H5: spelling mistakes

```
Hook poster H5. Background #1E4E9C.

Headline: "ஸ்பெல்லிங் தப்பால application reject ஆச்சா?"
English line: "Rejected for one spelling mistake?"
Support line: "The applicant checks their own details on their phone before you submit."

Art: a phone showing the review card "Check before sending" with rows:
  Name — ✓ Jagan (a small muted sub-line: said "no, not Jahan, Jagan")
  Taluk — ✓ Omalur
  Village — amber pill "Pick one", expanded into the pale amber "Did you mean…?" box with two buttons "Kanniyampatti" and "Kanniyampatti Pudur".
Next to it, a hand holding the phone with a thumb about to tap. A small faded "Rejected" stamp in the background, crossed out.
```

---

## Section 5: fear posters (warm page, problem → answer)

These use the app's own status colours: the **problem** is in the amber warning style and the **answer** in the green live style. Keep them calm; this is reassurance, not panic.

### Prompt F0: the full infographic (one image for the section)

```
Fear infographic F0. Size 1600×1200 desktop and 1080×1920 mobile. Background #FAF9F7.

Title (Tamil): "கவலை வேண்டாம்"   English line: "The worries every centre has — and the answer"

Five rows, each a white card (12px radius, 1px #E5E3DF border). Each card has two halves joined by a small arrow:
- Left half: background #F9E2B0 at 50%, an amber Lucide icon, and the worry in #7A5000.
- Right half: background #D7F0D9 at 50%, a green Lucide icon, and the answer in #1F6B2A.

Rows (Tamil line first, English under it in smaller muted text):
1. icon "users" → "door-open"
   Worry: "வரிசை நீளம், customer அடுத்த கடைக்கு போறாங்க" / "Long queue — customers walk to the next centre"
   Answer: "5 பேர் ஒரே நேரத்துல அவங்க phone-ல சொல்லலாம்" / "5 people speak on their own phones at once"
2. icon "file-x" → "check-check"
   Worry: "ஒரு எழுத்து தப்பு, application reject" / "One wrong letter, application rejected"
   Answer: "Applicant தானே phone-ல சரிபார்க்கிறாங்க" / "The applicant checks their own details. Unclear answers are asked, never guessed."
3. icon "calendar-clock" → "gauge"
   Worry: "Scheme திறந்தா கூட்டம் தாங்க முடியல" / "A new scheme opens — the rush is too much"
   Answer: "அதே staff, அதிக பேருக்கு service" / "Same staff, more people served"
4. icon "user-x" → "users-round"
   Worry: "வேகமா டைப் பண்றவர் ஒருத்தர் தான்" / "Only one fast typist — what if they leave?"
   Answer: "Screen படிக்க தெரிஞ்சா யார் வேணாலும் பண்ணலாம்" / "Anyone who can read the screen can run the counter"
5. icon "message-circle-warning" → "shield-check"
   Worry: "Aadhaar, photo எல்லாம் உங்க WhatsApp-ல" / "Citizens' Aadhaar and photos piling up in your WhatsApp"
   Answer: "Photo நேரா form-க்கு, அப்புறம் delete" / "Photos go straight to the form, then deleted. Answers deleted within about an hour."

Footer line, muted, centred: "You check. You submit. Voice2Fill never submits for you."
Voice2Fill mark bottom right.
```

### Prompt F1–F5: one card per worry (for social and the website carousel)

```
Make five separate posters, F1 to F5, one per row of the F0 infographic, using the same text and icons.
Size 1080×1350 (and 1600×900).
Layout: top half background #F9E2B0 with the worry (Tamil big, English under) and a simple flat illustration of that worry (e.g. a customer walking out of a long queue; a "Rejected" stamped paper; a crowd at the door; an empty chair at the keyboard; a phone full of document photos).
Bottom half background #D7F0D9 with the answer and a flat illustration of the same scene, now calm (e.g. 5 people on phones; the phone review screen; a calm counter; a new staff member smiling at the screen; a shield-check over a phone).
A thin #CFA63C line between the halves with a round white arrow badge in the middle.
Voice2Fill mark and "சொன்னா போதும்!" at the bottom.
```

---

## Section 6: benefit posters (honey gold)

Shared look for B1–B4: background **#EBC865**, ink **#1A1813**, white cards with a 1px **#CFA63C** border. Gold is the popup's header colour, so these feel like the product.

### Prompt B1: less waiting time

```
Benefit poster B1. Background #EBC865.

Headline: "காத்திருக்கும் நேரம் குறையும்"
English line: "Less waiting at your counter"
Support line: "People in the queue start speaking on their own phones while you finish the current applicant."

Art: a before/after strip in two white cards.
- Card "Before" (neutral pill): people in a single line, one form at a time, a clock icon.
- Card "With Voice2Fill" (green pill): the same people seated, each with a phone and red mic, forms filling side by side on the monitor's 5 tabs with #F2B705 outlines.
```

### Prompt B2: more people coming in

```
Benefit poster B2. Background #EBC865.

Headline: "இங்கே தமிழில் சொன்னா போதும்"
English line: "Here, you can just say it in Tamil"
Support line: "Elderly and first-time applicants feel welcome — and they tell their friends."

Art: a shop-front of a small service centre with an open shutter, a printed sign on the wall showing the Voice2Fill mark and "இங்கே தமிழில் சொன்னா போதும்". Happy people walking in: an elderly couple, a mother with a child, a farmer. Small speech bubbles between people outside: "அங்கே போங்க, ஈஸியா இருக்கு" ("Go there, it's easy").
Also make an A4 print version (2480×3508) of just the wall sign for the counter: Voice2Fill mark, the Tamil line very large, the English line, and a red mic illustration.
```

### Prompt B3: more earnings

```
Benefit poster B3. Background #EBC865.

Headline: "வரிசை குறையும், வருமானம் கூடும்"
English line: "Shorter queue. Bigger earnings."

Art: a large white card like an app card (12px radius, 1px #CFA63C border) showing a simple calculation, one step per row with Lucide icons:
  "40 applications a day"
  "× 4 minutes saved on each*"
  "= about 2.5 hours free every day"
  Last row, in a green pill style, bigger: "More applicants on rush days"
Next to the card, a flat illustration of an operator smiling, with a small stack of receipts and a calm queue.
Footnote at the bottom, small muted ink: "*Example only. Time saved depends on the form."
```

> ⚠️ Replace the example numbers in B3 with your real pilot numbers (section 8 of the strategy) before you publish it.

### Prompt B4: price per day

```
Benefit poster B4. Background #EBC865.

Headline: "ஒரு நாளைக்கு ₹22 தான்"
English line: "About ₹22 a day"
Support line: "Pro plan · 400 voice minutes · ₹649 a month. Only recording time counts."

Art: a white price card in the app's card style: the Voice2Fill mark, "Pro", "₹649 / month", a light blue pill "400 voice minutes", and a small muted line "Scanning and filling are free". Next to it a flat illustration of a tea glass and a calendar page, suggesting "less than a daily tea break".
Bottom: a dark (#1F1E1C) button with white text "Start your free 7-day trial" and a muted line under it "15 voice minutes · no card needed".
Never show how many forms the minutes cover.
```

---

## Checklist for every poster

- [ ] **Both sizes:** 1600×900 and 1080×1350 (F0: 1600×1200 and 1080×1920).
- [ ] **Exact colours** from the brief; no gradients, glows or purple.
- [ ] **Only real features**: QR, phone mic, Tamil/Tanglish, yellow outline, "Did you mean…?", photo sizing, 5 tabs, auto-delete.
- [ ] **Nothing auto-submits**: the operator always checks.
- [ ] **No emblems, government or portal names, or other companies' logos** (including WhatsApp).
- [ ] **No "best", "#1", ratings, user counts, "official" or "approved".**
- [ ] **Minutes only**, never "forms per plan".
- [ ] **B3 numbers replaced** with your pilot numbers, or the footnote kept.
- [ ] **Tamil checked by a Tamil reader**: spelling, and that the colloquial tone sounds natural.
- [ ] **Half-size test:** the headline is still readable.

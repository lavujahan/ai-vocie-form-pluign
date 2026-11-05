# Design brief: website marketing posters (hooks, fears, benefits)

These are prompts for **Claude Design**, for the posters in marketing sections 4 (hooks), 5 (fears) and 6 (benefits), and for the same posters on Instagram (feed posts and Reels).

**How to use**
1. Start a new Claude Design project with the **Voice2Fill** design system (https://claude.ai/artifact/GYwpmpkRqvxqWQV4vCn5pb; mark it as your default and every new project gets it). Paste **Prompt M0** first, once: it is short, because the colours, type, logo, tone, illustration style, product snippets, sample data, layout rules and plans all come from the design system.
2. Then paste the poster prompts one at a time, in order.
3. Export each poster in the three formats below, and check it against the checklist at the end.

The style comes from the app itself, kept in the Voice2Fill design system (its colours are the app's `packages/shared/ui/tokens.css`). When a price, limit or feature changes, update the design system's *Plans and pricing* and *Posters and video* sections too.
The posters can be a bit bolder than the store screenshots: bigger headlines, a gold background colour, and flat illustrated people. They must still look like the same product.

---

## Formats (every poster)

| Format | Size | Ratio | Where it goes | Layout |
| --- | --- | --- | --- | --- |
| **16:9** | 1920×1080 | 16:9 | Website sections, YouTube thumbnail and community post, WhatsApp and Facebook links, presentations | Text left, art right |
| **Instagram post** | 1080×1350 | 4:5 | Instagram and Facebook feed, WhatsApp | Text top, art bottom |
| **Instagram Reel / Story** | 1080×1920 | 9:16 | Reels (cover and still Reel), Stories, WhatsApp Status, YouTube Shorts | Text top, art in the middle, button low |

**Safe zones (Instagram covers the edges with its own buttons and captions):**
- **Instagram post:** the profile grid shows posts cropped to 3:4, so keep text and the mark at least 64px from the left and right edges.
- **Reel / Story:** keep all text, the mark and the button inside the middle **1080×1420**: nothing important in the top **250px** or the bottom **250px**, nor in the right **120px** (the like and share buttons). The Reel's caption sits over the bottom, so put the call-to-action button above that band.
- **16:9:** keep text at least 96px from every edge (YouTube puts the time stamp bottom right).

**Making a Reel:** the 9:16 still is the Reel's cover and its last frame. For motion, make a 6–8 second version in the same canvas: the background and art fade in (0–1 s), the Tamil headline rises in (1–2 s), the English line follows (2–3 s), the product snippet does its one action (a field gets the yellow outline, the mic pulses once, a price card slides up) (3–6 s), then hold on the full poster with the button (6–8 s). Calm and slow: no flashes, spins or zooms. Add music and the Tamil voice-over in Instagram or a video editor.

1600×900 posters made earlier are the same 16:9 shape: export them at 1920×1080 rather than redrawing.

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
You are designing website marketing posters for "Voice2Fill" (Chrome extension name: "Voice Form Filler").
Use the Voice2Fill design system for everything shared: read its brand book, its "Posters and video" section and its "Plans and pricing" section, and use its tokens, type styles, logo, illustration style, product snippets and sample data exactly. Draw only the features its "Posters and video" section lists.
Make every poster in three formats: 16:9 at 1920×1080 (text left, art right), Instagram post at 1080×1350 (text top, art bottom) and Instagram Reel / Story at 1080×1920 (text top, art in the middle, button low). Keep the Reel's text and button inside the middle 1080×1420, clear of the top and bottom 250px and the right 120px. Put the Voice2Fill mark and name in a corner, inside the safe zone.

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

Headline: "தமிழ்ல சொன்னாங்க… ஃபார்ம் இங்கிலீஷ்ல நிரம்புச்சு!"
English line: " spoke Tamil. The form filled in English."
Support line: "Tamil, English or Tanglish — even mixed in one sentence."

Art: a smiling elderly woman in a saree holding a phone with the red mic button. A white speech bubble from her in Tamil script: "என் பேரு லட்சுமி, ஊரு சேலம்".
An arrow to a white form card with two fields, each outlined in #F2B705:
  "பெயர் · Name" → "Lakshmi"
  "மாவட்டம் · District" → "Salem"
```

### Prompt H4: the queue

```
Hook poster H4. Background #1E4E9C.

Headline: "வரிசையில 5 பேர். நீங்க ஒருத்தர் தான்."
English line: "5 in the queue. Only one of you."
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
Fear infographic F0. Size 1600×1200 for the website and 1080×1920 for Reels and Stories (inside the safe zone; five rows stacked). For the Instagram feed, use F1–F5. Background #FAF9F7.

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
   Answer: "Photo நேரா form-க்கு, அப்புறம் delete" / "Photos go straight to the form, then deleted. Answers deleted within about 2 hours."

Footer line, muted, centred: "You check. You submit. Voice2Fill never submits for you."
Voice2Fill mark bottom right.
```

### Prompt F1–F5: one card per worry (for social and the website carousel)

```
Make five separate posters, F1 to F5, one per row of the F0 infographic, using the same text and icons.
Formats: Instagram post 1080×1350, Reel / Story 1080×1920 (the two halves stacked, the arrow badge between them) and 16:9 1920×1080 (the two halves side by side, worry left, answer right). As a carousel post, F1–F5 go in order after a first slide made from F0's title.
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
Support line: "Pro plan · 400 voice minutes · ₹649 a month. Every feature is in every plan. Only recording time counts."

Art: a large white price card in the app's card style (12px radius, 1px #E5E3DF border):
- Top: "Pro", "₹649 / month", a light blue pill "400 voice minutes · 30 days", and under it four small grey chips with Pro's limits: "2 computers", "600 documents", "300 Voice Form Fill QRs", "450 Non Voice Form Fill QRs". In the card's top-right corner a small flat tea glass in front of a calendar page ("less than a daily tea break").
- A divider labelled "Every plan includes", then 8 features in two columns, each a Lucide icon in a light blue (#DCE8FB) tile, a semibold line and a muted line:
  scan · "Scan from your scanner" / "Straight into the upload field"
  smartphone · "Photos from phone or WhatsApp" / "Take a photo or pick a file"
  file-down · "Big PDFs made smaller" / "Every page kept"
  files · "Photos into one PDF" / "Sized to the site's rules"
  layers · "Up to 5 forms at once" / "One QR per customer"
  clock · "Answers wait 2 hours" / "Even if the site logs you out"
  history · "Latest forms" / "QR for the next customer"
  badge-check · "Typing and filling are free" / "Only recording time counts"
16:9: text left, card right. Instagram post: the card full width under the headline (the tea art can be left out). Reel / Story: headline at the top of the safe zone, the card in the middle, the button above the bottom 250px; in the motion version the card slides up and the limit chips appear one by one.
Bottom: a dark (#1F1E1C) button with white text "Start your free 7-day trial" and a muted line under it "15 voice minutes · no card needed".
Never show how many forms the minutes cover. No WhatsApp logo, only the word.
```

---

## Checklist for every poster

- [ ] **All three formats:** 16:9 1920×1080, Instagram post 1080×1350, Reel / Story 1080×1920 (F0: 1600×1200 and 1080×1920).
- [ ] **Safe zones:** nothing important in a Reel's top and bottom 250px or right 120px; feed-post text 64px from the sides.
- [ ] **Reels:** the still works as the cover; the 6–8 s motion version ends on the full poster.
- [ ] **Exact colours** from the brief; no gradients, glows or purple.
- [ ] **Only real features**: QR, phone mic, Tamil/Tanglish, yellow outline, "Did you mean…?", photo sizing, photos into one PDF, PDF made smaller, Fetch from scan, 5 tabs, QR for other, answers wait 2 hours, Typing only, auto-delete.
- [ ] **Prices and limits match Admin → Plans** (Starter ₹149; Pro 400 min · 300 / 450 QRs · 600 documents · 2 computers).
- [ ] **Nothing auto-submits**: the operator always checks.
- [ ] **No emblems, government or portal names, or other companies' logos** (including WhatsApp).
- [ ] **No "best", "#1", ratings, user counts, "official" or "approved".**
- [ ] **Minutes only**, never "forms per plan".
- [ ] **B3 numbers replaced** with your pilot numbers, or the footnote kept.
- [ ] **Tamil checked by a Tamil reader**: spelling, and that the colloquial tone sounds natural.
- [ ] **Half-size test:** the headline is still readable.

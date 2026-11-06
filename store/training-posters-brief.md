# Design brief: feature, how-to-use and operator training posters

These are prompts for **Claude Design**, for three poster sets about the whole Voice2Fill product:

- **Section A, feature posters (A1–A17):** one feature per poster, for the website, Instagram and WhatsApp.
- **Section B, how-to-use posters (U1–U10):** one task per poster, step by step, with the real popup and phone screens.
- **Section C, operator training posters (T1–T9):** for service-centre staff, printed and kept beside the computer, and shared in the staff group.

**How to use this brief**
1. Start a new Claude Design project with the **Voice2Fill** design system (https://claude.ai/artifact/GYwpmpkRqvxqWQV4vCn5pb). Paste **Prompt T0** first, once.
2. Paste the poster prompts one at a time, in order. Each prompt is complete by itself after T0, so you can redo one poster without the others.
3. Export each poster in its set's formats (below) and check it against the checklist at the end.

The style comes from the app itself, through the design system. These posters teach, so they show more of the real screens than the marketing posters ([marketing-posters-brief.md](marketing-posters-brief.md)) and use fewer illustrated scenes. Button words must be exactly the app's words: they are written here in **bold** or in quotes, as on screen.

---

## Formats

| Set | Format | Size | Where it goes |
| --- | --- | --- | --- |
| **A: features** | 16:9 | 1920×1080 | Website, YouTube, WhatsApp and Facebook links |
| | Instagram post | 1080×1350 | Instagram and Facebook feed, WhatsApp |
| | Reel / Story | 1080×1920 | Reels, Stories, WhatsApp Status, YouTube Shorts |
| **B: how to use** | 16:9 | 1920×1080 | Training slides, YouTube, the website's help page |
| | Instagram carousel | 1080×1350 per slide | Slide 1: title and the result. One slide per step after it |
| | A4 portrait print | 2480×3508 (300 dpi) | Printed for the counter or the staff room |
| **C: training** | A4 portrait print | 2480×3508 (300 dpi) | On the wall beside the operator's computer |
| | 16:9 | 1920×1080 | Staff WhatsApp group, training slides |

**Safe zones**
- **Reel / Story:** all text, the mark and the button inside the middle 1080×1420: nothing important in the top 250px, the bottom 250px or the right 120px.
- **Instagram post and carousel:** text at least 64px from the left and right edges.
- **16:9:** text at least 96px from every edge.
- **A4 print:** 120px margins and a 3 mm bleed (36px) with nothing important in it. It must read from 1 metre away: headline at least 120px, body text at least 40px, screen snippets big enough that the button words read at 40px or more.

---

## Prompt T0: shared brief (paste first)

```
You are designing feature, how-to-use and staff training posters for "Voice2Fill" (Chrome extension name: "Voice Form Filler").
Use the Voice2Fill design system for everything shared: its brand book, "Posters and video" section and "Plans and pricing" section, and its tokens, type styles, logo, illustration style, product snippets and sample data, exactly.

What the product is: a Chrome extension for service centres. The operator opens a form on a website, clicks "QR for this page" and "Generate QR". The customer scans the QR with their own phone and speaks the answers in Tamil, English or Tanglish. The answers appear on the computer, and the operator clicks "Fill form", checks the fields outlined in yellow, and submits the website's form themselves. Nothing is ever submitted by Voice2Fill.

Rules for every poster:
- Bilingual: the Tamil line first and larger, the English line under it.
- Use the app's exact words on buttons and screens, as written in each prompt. Do not invent buttons, screens or features.
- Screens are drawn as the app's product snippets: the extension popup (honey-gold header with the blue mic mark, mild gold page, white cards) and the phone page (warm page, gold header, big red mic). Flat, no device photos.
- Put the Voice2Fill mark and name in a corner, inside the safe zone.
- No government emblems, portal names or other companies' logos. No "best", "#1", ratings, user counts, "official" or "approved".
- Voice plans are sold in voice minutes. Never say "forms per plan".

Formats by set:
- Set A (feature posters): 16:9 at 1920×1080 (text left, art right), Instagram post at 1080×1350 (text top, art bottom), Reel/Story at 1080×1920 (text top, art middle, button low; keep it inside the middle 1080×1420, clear of the top and bottom 250px and the right 120px).
- Set B (how-to-use posters): 16:9 at 1920×1080 with the steps left to right; Instagram carousel at 1080×1350 with a title slide and then one slide per step; A4 portrait print at 2480×3508 with the steps top to bottom.
- Set C (staff training posters): A4 portrait print at 2480×3508 first, readable from 1 metre (headline 120px or more, body 40px or more, 120px margins), then a 16:9 version at 1920×1080.

Reply "Ready" and wait for the first poster prompt.
```

---

## Section A: feature posters (honey gold)

Shared look for A1–A17: background honey gold **#EBC865**, dark headline, one product snippet as the art. A small blue pill at the top names the feature group: **Voice**, **Photos and documents**, **Busy counter**, **Tamil** or **Privacy**. Make them a set: same grid, same headline position, same pill position.

### Prompt A1: scan, speak, filled

```
Feature poster A1. Group pill: "Voice".

Headline (Tamil): "QR ஸ்கேன் பண்ணுங்க… ஃபோன்லயே பேசுங்க"
English line: "Scan the QR. Speak on your own phone."
Support line: "No app to install. The answers appear on the computer."

Art: three panels joined by arrows.
1. The extension popup showing a QR code with "Scan with your phone camera" and "Expires in 9:42".
2. A phone on its phone page with the big red mic, a speech bubble in Tamil script: "பெயர் லட்சுமி, மாவட்டம் சேலம்".
3. A desktop form with "Name: Lakshmi" and "District: Salem", both fields outlined in #F2B705.
```

### Prompt A2: Tamil in, English out

```
Feature poster A2. Group pill: "Voice".

Headline: "தமிழ், English, Tanglish… எப்படி வேணாலும் பேசலாம்"
English line: "Tamil, English or Tanglish. The form fills in English."
Support line: "Even mixed in one sentence: “en peru Ramesh, ooru Chennai”."

Art: three speech bubbles on the left, one in Tamil script ("என் பெயர் ரமேஷ்"), one in English ("My name is Ramesh"), one in Tanglish ("en peru Ramesh"). All three arrows meet at one white form field card on the right: "பெயர் · Name" → "Ramesh", outlined in #F2B705.
```

### Prompt A3: you check, you submit

```
Feature poster A3. Group pill: "Voice".

Headline: "நிரம்பின ஒவ்வொரு ஃபீல்டும் மஞ்சள் கோட்டில்"
English line: "Every filled field is outlined in yellow."
Support line: "You check it, then you submit. Undo puts the page back."

Art: a desktop form with 5 fields, each outlined in #F2B705 with its value. The operator's hand rests on the mouse; a small "Undo" button in the extension popup's footer beside a dark "Fill form" button. A green pill "You submit" near the website's own Submit button, which is NOT pressed.
```

### Prompt A4: "Which one did you mean?"

```
Feature poster A4. Group pill: "Voice".

Headline: "சந்தேகமா இருந்தா… ஃபோனே கேட்கும்"
English line: "Not sure? The phone asks."
Support line: "Nothing is guessed silently."

Art: a phone showing a field row "வட்டம் · Taluk" with an amber line "Which one did you mean?" and three buttons under it: "Omalur", "Mettur", "Salem". The customer's finger taps "Omalur". On the right, the computer's dropdown shows "Omalur" outlined in #F2B705.
```

### Prompt A5: spelling and corrections

```
Feature poster A5. Group pill: "Voice".

Headline: "தப்பா வந்தா… சொல்லியே திருத்தலாம்"
English line: "Wrong? Just say the correction."
Support line: "Spell it letter by letter, or say what to change."

Art: two small before-and-after cards.
- Card 1: speech bubble "J A G A N" → field "Name: Jagan".
- Card 2: speech bubble "no, not Jahan, Jagan" → the value "Jahan" struck through, "Jagan" beside it, outlined in #F2B705.
A third, smaller card: speech bubble "pincode la 455 illa 445" → "PIN code: 637445".
```

### Prompt A6: the photo is made to fit

```
Feature poster A6. Group pill: "Photos and documents".

Headline: "50 KB-க்குள்ள போட்டோ… ஃபோனே சரி பண்ணும்"
English line: "Photo under 50 KB? The phone makes it fit."
Support line: "It reads the website's rules: JPG, size, pixels."

Art: a phone showing the photo card: title "Applicant photo", muted line "JPG · max 50 KB", a 3:4 thumbnail with a flat silhouette (no real face) and small rotate and crop icons, green text "Ready: JPG · 38 KB", and a dark full-width button "Send to computer". A dotted line to the desktop form's "Upload photo" field showing "photo.jpg", outlined in #F2B705.
```

### Prompt A7: pages into one PDF

```
Feature poster A7. Group pill: "Photos and documents".

Headline: "பல பக்கம்… ஒரே PDF"
English line: "Many pages. One PDF."
Support line: "Take a photo of each page. The phone makes one A4 PDF that fits the size limit."

Art: three phone photos of document pages (plain lines, no real text or emblems) sliding into one PDF icon labelled "certificate.pdf · 3 pages · 180 KB", then into the desktop form's upload field, outlined in #F2B705.
```

### Prompt A8: Fetch from scan

```
Feature poster A8. Group pill: "Photos and documents".

Headline: "ஸ்கேனர்ல இருந்து நேரா ஃபார்முக்கு"
English line: "From your scanner straight into the form."
Support line: "Fetch from scan picks up the newest scan from your scanner's folder."

Art: a desktop scanner beside a monitor. The monitor shows a small window titled "Fetch from scan" with a scanned page thumbnail and the line "Scan the document". An arrow to the form's upload field, outlined in #F2B705. Note on the window: "Scans for this form stay on this computer".
```

### Prompt A9: 5 forms at once

```
Feature poster A9. Group pill: "Busy counter".

Headline: "ஒரே நேரத்துல 5 ஃபார்ம்"
English line: "Up to 5 forms at once, one per browser tab."
Support line: "Each tab has its own QR and its own customer's phone."

Art: a browser with 5 tabs along the top, each tab with a small green dot. Below, 3 customers in a row each holding a phone with the red mic, each linked by a thin line to one tab. The operator sits calmly in front.
```

### Prompt A10: QR for other

```
Feature poster A10. Group pill: "Busy counter".

Headline: "வரிசையில நிக்கிறவங்களும் இப்பவே ஆரம்பிக்கலாம்"
English line: "People in the queue can start now."
Support line: "QR for other gives a QR for a form you used before. No website open."

Art: the extension popup showing the "QR for other" screen with the heading "Latest forms" and the line "One QR per customer". Under it two form rows ("Patta transfer · 16 fields · Used 12 times", "Community certificate · 22 fields · Used 8 times"), and a QR code beside the first. On the right, a short queue of people; the second person is already speaking into their phone.
```

### Prompt A11: answers wait for you

```
Feature poster A11. Group pill: "Busy counter".

Headline: "வெப்சைட் லாக் அவுட் ஆனாலும்… பதில்கள் காத்திருக்கும்"
English line: "Website logged you out? The answers wait."
Support line: "Sent answers wait 2 hours under Customer answers waiting."

Art: the extension popup showing "Customer answers waiting" with two rows, each with the customer's name and the last 4 digits of the phone ("Lakshmi · ••• 0567", "Ravi · ••• 4321"), and on each row the buttons "Use" and "×". A small menu under the first row: "Customer needs to correct". Behind it, a faded browser page with a "Session expired" message (no portal name).
```

### Prompt A12: Typing only

```
Feature poster A12. Group pill: "Busy counter".

Headline: "சத்தமா இருக்கா? டைப் பண்ணலாம்"
English line: "Noisy counter? The customer can type."
Support line: "Tick Typing only before you scan. No mic, no voice minutes."

Art: the extension popup's start card with the checkbox "Typing only" ticked and the dark button "Generate QR". Beside it, a phone with no mic anywhere: a light blue banner with a pencil icon "Tap a field to type its answer", field rows with "✎ Type" buttons, and the bottom bar "3 / 16 filled" with a full-width dark button "Send to desktop".
```

### Prompt A13: the Tamil helper on the phone

```
Feature poster A13. Group pill: "Tamil".

Headline: "புரியாத இங்கிலீஷ் வார்த்தையா? தமிழ்ல பாருங்க"
English line: "An English word you don't know? See it in Tamil."
Support line: "Tap the த bubble on the phone. Nothing goes into the form by itself."

Art: a phone with the gold round "த" bubble with a small blue "EN" tag at the edge of the screen. A bottom sheet with a gold header "தமிழ் உதவி": the typed text "Date of birth", the Tamil "பிறந்த தேதி" under it, and a "Copy" button.
```

### Prompt A14: Tamil typing, on the phone or the computer

```
Feature poster A14. Group pill: "Tamil".

Headline: "தமிழ்ல பேசுங்க… எழுத்தா வரும். எங்க வேணாலும் paste பண்ணுங்க"
English line: "Speak Tamil, get Tamil text. Paste it anywhere."
Support line: "Speak on your phone (scan the QR) or into the computer's mic. Uses voice minutes."

Art: the extension popup's Tamil typing panel: honey-gold header with a blue square "த", "Tamil typing", the line "Speak Tamil, then copy the text anywhere". Under it a two-part switch "Phone | This computer" with Phone selected, a green line "Phone connected. Speak on the phone." with "Disconnect", the text box with "எங்கள் நிலம் சேலம் மாவட்டம், ஓமலூர் வட்டத்தில் உள்ளது." and a dark "Copy text" button.
Beside the popup, a phone showing "தமிழ் டைப்பிங் · Tamil typing", the big red mic, and one sentence card with "Sent to computer", "Edit" and "Delete".
In the popup's corner, the gold round "த" bubble with a small red mic badge.
```

### Prompt A15: voice tips

```
Feature poster A15. Group pill: "Voice".

Headline: "சரியா பேசினா… நிமிஷமும் மிச்சம், பதிலும் சரி"
English line: "Speak the right way: fewer minutes, right answers."
Support line: "6 voice tips, in Tamil and English, on the phone and in the extension."

Art: a fan of 6 small tip cards, each with a lightbulb icon and its title:
"Say the field name, then the answer" · "Not too slow, not too fast" · "Tap Stop as soon as you finish" · "Numbers in small groups" · "Fix one answer by typing" · "Phone close".
In the corner, the blue round lightbulb bubble.
```

### Prompt A16: long forms

```
Feature poster A16. Group pill: "Voice".

Headline: "நீளமான ஃபார்மா? பல ஸ்டெப்பா? பிரச்சனை இல்ல"
English line: "Long forms and many steps are fine."
Support line: "District → Taluk → Village fill in order. Fields that appear later are added to the phone."

Art: three dropdowns stacked with arrows between them: "State: Tamil Nadu" → "District: Salem" → "Taluk: Omalur" → "Village: Kadayampatti", each outlined in #F2B705 one after the other. On the side, a phone list where a new row slides in with a small "New" pill.
```

### Prompt A17: privacy

```
Feature poster A17. Group pill: "Privacy".

Headline: "ஆதார், போட்டோ… யார் ஃபோன்லயும் தங்காது"
English line: "IDs and photos don't pile up on anyone's phone."
Support line: "Voice recordings are never stored. Answers delete themselves within about an hour."

Art: three white cards in a row, each with a green tick:
- a microphone icon: "Voice recordings: never stored"
- a text icon: "Answers: deleted in about an hour (2 hours after Send)"
- a photo icon: "Photos and PDFs: deleted once the computer has them"
A crossed-out chat bubble icon in the background (no app logo).
```

---

## Section B: how-to-use posters (warm page)

Shared look for U1–U10: background warm page **#FAF9F7**, a honey-gold title band at the top with the task's name, then numbered steps. Each step is a round blue number (1, 2, 3…), a one-line instruction (Tamil, then English) and a cropped screen snippet with the button to press outlined in **#F2B705**. The last step always shows the result with a green tick. On the carousel, slide 1 is the title band plus the result, then one slide per step.

### Prompt U1: fill a form by voice

```
How-to poster U1. Title band: "குரலில் ஃபார்ம் நிரப்புவது எப்படி · How to fill a form by voice"

Steps:
1. "ஃபார்ம் பக்கத்தைத் திறந்து Voice2Fill-ஐ கிளிக் செய்யுங்க" / "Open the form page and click the Voice2Fill icon." Snippet: Chrome toolbar with the Voice2Fill icon highlighted.
2. "QR for this page, பிறகு Generate QR" / "Click QR for this page, then Generate QR." Snippet: the popup start card with the step list "QR for this page · Pair your phone · Speak the answers · Click Fill form" and the dark button "Generate QR" highlighted.
3. "வாடிக்கையாளர் ஃபோனில் QR ஸ்கேன் செய்யட்டும்" / "The customer scans the QR with their phone camera." Snippet: QR with "Scan with your phone camera" and "Expires in 9:42".
4. "சிவப்பு மைக்கைத் தட்டி பேசட்டும்" / "They tap the red mic and speak." Snippet: phone page with the big red mic.
5. "Send to desktop" / "They check their answers and tap Send to desktop." Snippet: phone bottom bar with "16 / 16 filled" and the dark "Send to desktop" button highlighted.
6. "Fill form கிளிக் செய்யுங்க" / "Click Fill form." Snippet: popup footer with the dark "Fill form" button highlighted.
7. Result: "மஞ்சள் ஃபீல்டுகளைச் சரிபாருங்க, நீங்களே Submit செய்யுங்க" / "Check the yellow fields, then submit it yourself." Snippet: the form with fields outlined in #F2B705 and a green tick.
```

### Prompt U2: a typing-only form

```
How-to poster U2. Title band: "டைப்பிங் மட்டும் · Typing only (no mic)"

Steps:
1. "Generate QR-க்கு முன் Typing only டிக் செய்யுங்க" / "Tick Typing only before Generate QR." Snippet: start card with "Typing only" ticked (highlighted) and "Generate QR".
2. "வாடிக்கையாளர் ஸ்கேன் செய்து ஒவ்வொரு பதிலையும் டைப் செய்யட்டும்" / "The customer scans and types each answer." Snippet: phone with the banner "Tap a field to type its answer" and "✎ Type" buttons.
3. "Send to desktop, பிறகு Fill form" / "They tap Send to desktop; you click Fill form." Snippet: phone "Send to desktop" and popup "Fill form".
4. Result: "வாய்ஸ் நிமிஷம் செலவாகாது" / "No voice minutes used." Snippet: header chip "✎ Typing only" with a green tick.
Small note at the bottom: "Voice can be turned on or off any time from the popup: Turn voice on / Turn voice off."
```

### Prompt U3: a photo or document from the phone

```
How-to poster U3. Title band: "போட்டோ, ஆவணம் அனுப்புவது எப்படி · Sending a photo or document from the phone"

Steps:
1. "ஃபோனில் அப்லோடு ஃபீல்டைத் தட்டுங்க" / "On the phone, tap the upload field." Snippet: row "Applicant photo · JPG · max 50 KB" with a camera button.
2. "போட்டோ எடுங்க. சுழற்றலாம், வெட்டலாம், பக்கங்கள் சேர்க்கலாம்" / "Take the photo. Rotate, crop or add pages." Snippet: 3:4 thumbnail (flat silhouette) with rotate and crop icons and "Add page".
3. "Ready ஆனதும் Send to computer" / "When it says Ready, tap Send to computer." Snippet: green "Ready: JPG · 38 KB" and the dark button "Send to computer" highlighted.
4. "Fill form கிளிக் செய்யுங்க" / "Click Fill form." Snippet: popup "Fill form".
5. Result: "வெப்சைட்டின் சொந்த அப்லோடு ஃபீல்டில் ஃபைல்" / "The file is in the website's own upload field." Snippet: form field "photo.jpg" outlined in #F2B705.
Small note: "If the website refuses the file, the phone shows why."
```

### Prompt U4: Fetch from scan

```
How-to poster U4. Title band: "ஸ்கேனரில் இருந்து எடுப்பது · Fetch from scan"

Steps:
1. "முதல் முறை: Connect your scan folder" / "First time only: Connect your scan folder." Snippet: the Fetch from scan window with the button "Connect your scan folder" highlighted.
2. "ஆவணத்தை ஸ்கேனரில் ஸ்கேன் செய்யுங்க" / "Scan the document on your scanner." Snippet: the line "Scan the document" and a scanner icon.
3. "புதிய ஸ்கேன் தானாக வரும். சரிபார்த்து சேமிங்க" / "The newest scan appears. Check it and save it for the field." Snippet: thumbnail labelled "Your scan" with the field name.
4. "Fill form" / "Click Fill form." Snippet: popup "Fill form".
5. Result: the file in the form's upload field, outlined in #F2B705, with the note "Scans for this form stay on this computer".
```

### Prompt U5: QR for other (the queue)

```
How-to poster U5. Title band: "வரிசையில் உள்ளவருக்கு QR · QR for other"

Steps:
1. "எந்த டேப்பிலும் popup-ஐத் திறந்து QR for other" / "In any tab, open the popup and click QR for other." Snippet: popup with "QR for other" highlighted.
2. "Latest forms-ல் ஃபார்மைத் தேர்வு செய்யுங்க" / "Pick the form under Latest forms." Snippet: list "Latest forms · One QR per customer" with "Patta transfer · 16 fields · Used 12 times" highlighted.
3. "வரிசையில் உள்ளவர் ஸ்கேன் செய்து பேசட்டும்" / "The next person in the queue scans and speaks." Snippet: QR beside a person holding a phone.
4. "அவர் முறை வந்ததும் ஃபார்மைத் திறந்து Customer answers waiting-ல் Use" / "When it's their turn, open the form and click Use under Customer answers waiting." Snippet: the waiting row with "Use" highlighted.
5. Result: "Fill form → சரிபார்த்து Submit" / "Fill form, check, submit." Snippet: filled form with a green tick.
```

### Prompt U6: answers that wait

```
How-to poster U6. Title band: "காத்திருக்கும் பதில்கள் · Customer answers waiting"

Three cards side by side (not numbered steps), each with a popup snippet and one line:
- "Use": "சரியான ஃபார்மைத் திறந்து Use கிளிக் செய்யுங்க, பிறகு Fill form" / "Open the right form, click Use, then Fill form." The "Use" button highlighted.
- "Customer needs to correct": "QR மீண்டும் வரும். பதில்கள் அப்படியே இருக்கும்" / "The QR shows again. The answers are kept." The menu item highlighted, and a small "Copy link" for a customer who has left.
- "×": "பதில்களும் ஃபைல்களும் இப்போதே அழியும்" / "Deletes the answers and files now." The "×" highlighted.
Footer line: "Sent answers wait 2 hours. Each Send starts the 2 hours again."
```

### Prompt U7: Tamil typing on the phone

```
How-to poster U7. Title band: "ஃபோனில் தமிழ் டைப்பிங் · Tamil typing on the phone"

Steps:
1. "popup-ல் தங்க நிற த பட்டனைக் கிளிக் செய்யுங்க" / "Click the gold த bubble in the popup." Snippet: the gold round "த" bubble with a red mic badge, highlighted.
2. "முதல் முறை: Speak on phone" / "First time: choose Speak on phone." Snippet: the screen "How will you speak?" with the card "Speak on phone" (blue "RECOMMENDED" tag) highlighted and the card "This computer's mic" under it.
3. "ஃபோனில் QR ஸ்கேன் செய்யுங்க" / "Scan the QR with the phone." Snippet: QR with "Scan with the phone camera" and the chips "1 Scan · 2 Tap the mic · 3 Text comes here".
4. "மைக்கைத் தட்டி தமிழில் பேசுங்க" / "Tap the mic and speak Tamil." Snippet: phone "தமிழ் டைப்பிங் · Tamil typing", big red mic, "தட்டி தமிழில் பேசுங்கள்".
5. "தவறா? ஃபோனிலேயே Edit அல்லது Delete" / "A mistake? Edit or Delete it on the phone." Snippet: sentence card with "Sent to computer", "Edit" and "Delete"; a small inset of the edit box with "Speak again", "Cancel", "Save".
6. "Copy text, பிறகு எங்கு வேண்டுமானாலும் paste" / "Click Copy text, then paste it anywhere." Snippet: popup with the green "Phone connected" line and the dark "Copy text" button highlighted.
7. Result: "முடிந்ததும் ஃபோனில் Done" / "When finished, tap Done on the phone." Snippet: phone "முடிந்தது · Finished. The text is on the computer." with a green tick.
Small note: "Uses voice minutes only. Editing costs nothing."
```

### Prompt U8: Tamil typing on this computer's mic

```
How-to poster U8. Title band: "கணினி மைக்கில் தமிழ் டைப்பிங் · Tamil typing on this computer's mic"

Steps:
1. "த பட்டன், பிறகு This computer" / "Click the த bubble, then This computer." Snippet: the switch "Phone | This computer" with "This computer" highlighted.
2. "முதல் முறை மட்டும்: Allow microphone" / "First time only: Allow microphone." Snippet: the card "Allow your microphone" with the dark button "Allow microphone" highlighted, and Chrome's small "Allow" prompt in a little window.
3. "சிவப்பு மைக்கைத் தட்டி பேசுங்க" / "Tap the red mic and speak." Snippet: "Listening 0:05" with level bars.
4. Result: "Copy text" / "Copy the text and paste it anywhere." Snippet: text box with Tamil text and the "Copy text" button turning green "Copied".
Small note: "No microphone on this computer? Use Speak on phone."
```

### Prompt U9: next customer, closed phone page

```
How-to poster U9. Title band: "அடுத்த வாடிக்கையாளர், மூடிய ஃபோன் பக்கம் · Next customer, closed phone page"

Three cards, each a problem and the button that fixes it:
- "ஃபோன் பக்கம் மூடிடுச்சா?" / "Phone page closed?" → "Connect phone again": the QR comes back, every answer is kept. The button highlighted.
- "அதே QR-ல் அடுத்தவர்?" / "Next person on the same form?" → "Start over" on the phone (புதிதாகத் தொடங்கு): the answers are cleared.
- "இந்த ஃபார்ம் முடிஞ்சதா?" / "Done with this form?" → "End form" in the popup's ⋯ menu.
Plus a small fourth strip: "QR expired before anyone scanned it? Click Regenerate. It is free."
```

### Prompt U10: several forms, app windows

```
How-to poster U10. Title band: "பல ஃபார்ம்கள் ஒரே நேரத்தில் · Several forms at once"

Steps:
1. "ஒவ்வொரு ஃபார்மும் தனி டேப்பில்" / "Open each form in its own tab." Snippet: browser with 3 tabs.
2. "ஒவ்வொரு டேப்பிலும் Generate QR" / "Click Generate QR in each tab." Snippet: 3 small QR codes, one under each tab.
3. "popup அந்த டேப்பின் ஃபார்மைக் காட்டும்" / "The popup shows the form of the tab it was opened on." Snippet: popup header "1 other form open".
4. Result: "5 ஃபார்ம்கள் வரை" / "Up to 5 forms at once." Green tick.
Side box: "Website installed as an app (no toolbar)? Right-click the page → Fill this form with Voice2Fill, or press Alt+Shift+V."
```

---

## Section C: operator training posters (print first)

Shared look for T1–T9: white page, a brand-blue **#1E4E9C** header band with the poster's title in white (Tamil, then English), the Voice2Fill mark in the band's corner, and a thin honey-gold line under the band. Big, plain and printable: black text on white, colour only for the app's own meanings (yellow outline = filled, amber = needs a look, green = live / done, red = the mic). Number each poster small in the footer ("Training T1 of 9").

### Prompt T1: your first day

```
Training poster T1. Header: "முதல் நாள் · Your first day"

Four numbered boxes:
1. "Sign in": the popup's sign-in card with "Phone number" and "PIN". Line: "Your phone number and PIN, from your administrator."
2. "Pin the icon": Chrome's puzzle-piece menu with a pin beside Voice2Fill. Line: "Pin Voice2Fill so it is always in the toolbar."
3. "Allow the site once": the first time on a website, Chrome asks to allow it. Line: "Click Allow. Voice2Fill reads nothing on a site until you click QR for this page."
4. "Check your minutes": the popup header with a chip "386 min left". Line: "The chip shows the voice minutes left in your plan."
```

### Prompt T2: the popup, labelled

```
Training poster T2. Header: "Popup-ல் என்ன இருக்கு · What's in the popup"

One large popup drawing in the middle, with numbered callout lines to:
1. The honey-gold header: form name and chips ("● Live", minutes left). "What form this is, and if the phone is connected."
2. The progress bar "10 of 16 filled". "How much is done."
3. The groups "Needs a look" (amber), "Filled" (green tick), "Not answered yet". "Look at Needs a look first."
4. The dark "Fill form" button. "Puts the phone's answers into the page. The page changes only when you click it."
5. The "⋯" menu: "Connect phone again", "Start over", "End form". "When something needs resetting."
6. The two round bubbles bottom right: blue lightbulb "Voice tips" and gold "த" "Tamil typing".
```

### Prompt T3: what the colours mean

```
Training poster T3. Header: "நிறங்களின் அர்த்தம் · What the colours mean"

Four big rows, each a colour swatch, a real example and one line:
- Yellow outline #F2B705 around a form field: "நிரம்பியது · Filled. Check it before you submit."
- Amber pill "Needs a look": "சரிபாருங்க · The answer may be wrong or unclear. Open it."
- Green pill "● Live" and a green tick: "இணைப்பில் · Connected, or done."
- Red round mic: "பேசுங்க · Tap to speak. Tap again to stop."
```

### Prompt T4: tell the customer before handing over the phone

```
Training poster T4. Header: "ஃபோன் கொடுக்கும் முன் சொல்லுங்க · Tell the customer before handing over the phone"

Six tip cards in a 2×3 grid, each with a lightbulb icon, the Tamil title large and the English title under it, and a small tag "Saves minutes" (green) or "Right answers" (blue):
1. "புலத்தின் பெயர், பிறகு பதில்" / "Say the field name, then the answer". Example: "பெயர் சௌரவ், மொபைல் 98765 43210, மாவட்டம் ஈரோடு". Tag: Right answers.
2. "மிக மெதுவாகவும் வேண்டாம், மிக வேகமாகவும் வேண்டாம்" / "Not too slow, not too fast. Think first, then tap the mic." Tag: Right answers.
3. "முடிந்ததும் உடனே நிறுத்து தட்டவும்" / "Tap Stop as soon as you finish". Line: "Pauses use minutes too. It stops by itself after 4 seconds of silence." Tag: Saves minutes.
4. "எண்களைச் சிறு குழுக்களாகச் சொல்லுங்கள்" / "Numbers in small groups". Line: "Mobile in two groups of 5, Aadhaar in groups of 4." Tag: Right answers.
5. "ஒரு பதிலைத் திருத்த தட்டச்சு செய்யுங்கள்" / "Fix one answer by typing". Line: "Tap ✎ Type on that field. It uses no minutes." Tag: Saves minutes.
6. "ஃபோன் அருகில், வாய் மைக்கை நோக்கி" / "Phone close". Line: "A hand's length away. No speakerphone, TV or fan noise." Tag: Right answers.
Footer: "The same tips are on the phone, and under the blue lightbulb in the popup."
```

### Prompt T5: fixing a wrong answer

```
Training poster T5. Header: "தவறான பதிலைத் திருத்த · Fixing a wrong answer"

A ladder of five steps, easiest at the top, each with a small snippet:
1. "மீண்டும் சொல்லுங்க" / "Say it again with the field name": "no, not Jahan, Jagan".
2. "அந்த ஃபீல்டின் மைக்" / "Use that field's own mic" (the small mic on the row, shown once most fields are filled).
3. "✎ Type": type the answer on the phone. No minutes.
4. "Which one did you mean?": tap the right option button.
5. On the computer: "Undo" puts the page back after Fill form; "Start over" clears every answer.
Footer: "Captcha and OTP: type them on the computer."
```

### Prompt T6: when something goes wrong

```
Training poster T6. Header: "பிரச்சனை வந்தா என்ன செய்வது · When something goes wrong"

A two-column table, problem on the left (with a small amber warning icon), what to click on the right (with the button drawn as in the app):
- "QR expired" → "Regenerate" (free if nobody scanned it)
- "The phone page was closed" → "Connect phone again" (answers kept)
- "The website logged you out" → open the form again → "Customer answers waiting" → "Use"
- "The website refused the photo" → the phone shows why; take it again
- "Microphone blocked on this computer" → "Allow microphone", or use "Speak on phone"
- "Minutes used up" or "Plan ended" → the "Renew" link in the popup
- "Fields came out wrong" → "Undo", then correct on the phone and "Fill form" again
```

### Prompt T7: what uses your plan

```
Training poster T7. Header: "பிளானில் எது கணக்காகும் · What uses your plan"

Left column, "Counts" (each with a small meter like the popup's):
- "Voice minutes": only the time the mic is recording, on a form or in Tamil typing.
- "Voice Form Fill QR": each Generate QR with voice on.
- "Non Voice Form Fill QR": each Generate QR with Typing only.
- "Documents": each photo or PDF sent into a form, from the phone or the scanner.
- "Computers": computers signed in at the same time.
Right column, "Free" (each with a green tick):
- Regenerate on an expired QR nobody scanned · Connect phone again · Start over · Use on a waiting form
- Typing only answers (no minutes) · the Tamil helper · editing in Tamil typing
- A Tamil typing QR (it uses only the minutes you speak)
Footer: "When one counter runs out, only that stops. Renew or ask your administrator to add more."
```

### Prompt T8: privacy at the counter

```
Training poster T8. Header: "வாடிக்கையாளர் தகவல் பாதுகாப்பு · Keeping customers' details safe"

Five rules, each with an icon:
1. "Voice2Fill never submits a form. You check and you submit."
2. "Don't forward ID photos on chat apps. They go from the customer's phone straight into the form."
3. "Voice recordings are never stored. Answers delete themselves within about an hour."
4. "Finished, or the wrong customer? Click × to delete waiting answers now."
5. "Sign out when you leave the computer. Closing Chrome signs you out too."
```

### Prompt T9: do and don't (laminated card)

```
Training poster T9. Header: "செய்யுங்க · செய்யாதீங்க · Do and don't"

Two columns. Left, green ticks, "Do":
- Show the voice tips before handing over the phone
- Check every yellow field before you submit
- Use Typing only at a noisy counter
- Use QR for other when the queue is long
- Speak on phone for Tamil typing when this computer has no mic
Right, red crosses, "Don't":
- Don't let Voice2Fill submit for you (it never does)
- Don't record the whole form again for one wrong answer: use ✎ Type
- Don't leave the mic recording through long pauses
- Don't send customers' photos through chat apps
- Don't share your PIN
Make this one also fit an A5 card (1748×2480) for laminating.
```

---

## Checklist for every poster

- [ ] **The set's formats:** A in 16:9, Instagram post and Reel; B in 16:9, carousel and A4; C in A4 and 16:9 (T9 also A5).
- [ ] **Safe zones and print margins:** Reel top and bottom 250px and right 120px clear; A4 120px margins, readable from 1 metre.
- [ ] **Button words exactly as in the app:** QR for this page, Generate QR, Typing only, Fill form, Undo, Send to desktop, Send to computer, Connect phone again, Start over, End form, Regenerate, QR for other, Latest forms, Customer answers waiting, Use, Customer needs to correct, Fetch from scan, Connect your scan folder, Speak on phone, This computer, Copy text, Disconnect, Edit, Delete, Speak again, Done.
- [ ] **Exact colours** from the design system; no gradients, glows or purple.
- [ ] **Only real features**, as listed in this brief.
- [ ] **Counter names exactly:** Voice minutes, Voice Form Fill QR, Non Voice Form Fill QR, Documents, Computers. Minutes only, never "forms per plan".
- [ ] **A Tamil typing QR uses minutes only**, never shown as a Voice Form Fill QR.
- [ ] **Nothing auto-submits**: the operator always checks and submits.
- [ ] **No emblems, government or portal names, or other companies' logos.**
- [ ] **Tamil checked by a Tamil reader**: spelling, and that the colloquial headlines sound natural.
- [ ] **Half-size test:** headlines still readable; on A4, button words readable from 1 metre.

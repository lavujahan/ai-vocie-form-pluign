# Design brief: Voice2Fill promo videos (3D animation)

Prompts for **Claude Design**, for two videos:

| Video | Job | Length | Sizes |
| --- | --- | --- | --- |
| **V1: Business problem** | Convince an e-Sevai or browsing-centre owner they have a problem and that this solves it | About 65 s | 1920×1080 and 1080×1920 (WhatsApp, Reels) |
| **V2: Features** | Show how it works, including the newest features | About 3:40, in 15 short chapters | 1920×1080; each chapter also works as a short clip |

**Written from the code at commit `7b38bb7`.** Where this file disagrees with `chrome-web-store.md` or the README, this file is right (see **What changed in the code** below). `design-brief.md` and `pages/home.md` match it.

**How to use**
1. Start a new Claude Design project. Paste **Prompt V0** once.
2. For V1, paste **Prompt V1**, then **Prompt V1-Vertical**.
3. For V2, paste **one chapter at a time**. A long video is easier to fix chapter by chapter.
4. Add the Tamil voice-over and quiet background music in a video editor afterwards. The voice-over lines and timings are in each table.
5. Fill in `{{ACCOUNT_CONTACT}}` before you export the end cards.

**Not tested in Claude Design yet.** The prompts ask for real 3D (Three.js) played from a self-contained HTML page. If it gives you only an HTML page and no video file, press Play and record the screen at 1080p with OBS or Clipchamp. If true 3D doesn't work there, the prompt tells it to use CSS 3D instead.

**If 3:40 feels long,** drop chapters 12 and 14 from the full video and keep them as short clips.

---

## What changed in the code (don't copy these from the older docs)

| Older docs say | The code does now | In the videos |
| --- | --- | --- |
| "Scan form on this page" button | **"QR for this page"**, then **"Generate QR"**, with **"QR for other"** beside it | Use the new buttons |
| Typing only sits on the first popup screen | It is asked after a QR button is pressed, just before **Generate QR** | Show it in that step |
| After the first Fill, new answers fill the page automatically | The page changes **only when the operator clicks Fill form** (`tabs.ts`) | Always show the operator clicking Fill form |
| Answers appear on the form as you speak | Answers arrive **after Stop**, while the phone shows "Matching your answers to the fields…" | Speak, Stop, short wait, then the rows fill together |
| Voice commands: "start over", "send it", "what is left?" | **Removed.** They fill nothing; the phone's buttons do these jobs | Never show voice commands |
| "Check before sending" review screen; "Full form / Field by field" tabs | **Gone.** One page shows every field, with the mic and Send in a bottom bar | Use the phone layout in Prompt V0 |
| 96 px mic in the middle of a card | **72 px** red mic in the bottom bar, labelled Start / Stop | Use the bottom bar |
| Language button at the top right of the phone | It is inside the phone's **⋯** menu | Use the ⋯ menu |
| "My name is Ramesh Kumar…" | The voice tip says **say the field name, then the answer**, and not "My name is…" | "Name Ramesh Kumar, mobile 98765 43210, district Salem" |
| Answers deleted within about an hour | Within about an hour, or **about 2 hours after the customer sends them** | Use the longer wording where it matters |
| One gold "த" bubble (phone) | **Two different tools:** on the phone, "த" with a blue EN tag is the Tamil helper; in the popup, "த" with a red mic is Tamil typing | Keep them apart |
| (not covered) | **New:** QR for other, Customer answers waiting, Fetch from scan, Tamil typing | Chapters 7, 9, 10 and 13 |

---

## Prompt V0: shared brief (paste first)

```
You are making two 3D animated promo videos for a real product, "Voice2Fill" (Chrome extension: "Voice Form Filler"). The audience is e-Sevai and common service centre operators, browsing-centre owners and data-entry staff in Tamil Nadu. They are busy, practical small-business owners, not technology people.

OUTPUT
Build each video as one self-contained HTML page that plays by itself from a timeline, with a Play button and a scrubber, at 1920×1080 and 30 fps. Use real 3D (Three.js) if you can. If not, use CSS 3D transforms and tell me. The animation must give the same result every time it plays, so I can record the screen. Add no audio; I will add voice-over and music later. Reserve the bottom 15% for captions.

3D STYLE
A warm, soft "Orginal miniature" look: rounded matte objects, like a small handmade model of a Tamil Nadu service centre. Soft studio light, gentle shadows, a slow and steady camera (slow push-ins and small orbits, never fast spins). Plain background colours from the palette below.
Allowed for this video: 3D and soft shadows.
Still not allowed: neon, glows, lens flares, particles, purple, glass effects, robots, brains, sparkles, holograms, floating "AI" text. This is a calm, trustworthy shop tool, not "AI magic".

PEOPLE
Stylised rounded 3D characters, friendly and dignified, like a good animated film. An operator at a counter; citizens such as an elderly woman in a saree, an elderly man, a farmer, a mother with a child, a student. Never mock anyone. No photorealistic faces.

PLACE
A small service-centre counter: desktop computer, a flatbed scanner, printer, tube light, wall fan, a plastic chair or two, paper tokens, an open shutter onto the street. No government emblem, seal, flag, ministry, department or portal name. No bank names. No logos of any other company (no WhatsApp, Chrome or Android logos; a plain browser-window shape is fine). Any computer shows a plain form titled "Applicant registration" at "forms.example.in".

COLOURS (exact)
Brand blue #1E4E9C · light blue #DCE8FB · red mic #D4433D · filled-field yellow #F2B705
Honey gold #EBC865, gold line #CFA63C, gold ink #1A1813 · mild gold #FBF3DC
Page #FAF9F7 · card #FFFFFF · subtle #F4F3F0 · border #E5E3DF · ink #1F1E1C · muted #6B6863
Success #1F6B2A on #D7F0D9 · Warning #7A5000 on #F9E2B0 · Danger #A32B26 on #FBE0DE

CAPTIONS AND TITLES
Tamil first in Noto Sans Tamil semibold, with a smaller English line under it in Inter or Segoe UI. Sentence case. Captions: white text on a #1E4E9C bar at the bottom left. Keep every word on screen for at least 2 seconds.
Logo: white Lucide "mic" outline icon on a #1E4E9C rounded square, with the name "Voice2Fill".

REAL PRODUCT SCREENS
Every screen shown on a phone or computer must be this exact UI, drawn flat and sharp as a texture on the device. When the viewer must read a screen, turn the camera to face it straight on and hold. Never invent a button, badge or feature.

Phone page (background #FAF9F7, opens in the phone's browser, no app). Show it in English unless a scene says Tamil:
- Top bar: the form name in semibold, under it "forms.example.in" with a small green dot, and a "⋯" button on the right. The ⋯ menu holds "தமிழ்" (the language switch) and "Start over".
- A scrolling list of field rows divided by thin lines. Each row: a muted label such as "Father's name *", the value under it in semibold with a green tick, and at the right a 52 px outlined "✎ Type" button. Once most fields are filled, a blue "Speak" button appears beside it.
- Row states: green tick + value; amber pill "Say it" (required, empty); amber pill "Check this" (doubtful value); amber pill "Pick one" (choose an option); a line "Heard: “…”" under a value.
- Upload rows sit under the small heading "Photos and documents", with a paperclip and a blue "Add" camera button.
- Fixed bottom bar: an italic line of what was heard; "6 / 16 filled" in bold, sometimes with an amber chip "2 need you"; then a 72 px round red mic button with a white mic and "Start" (while recording: a white square, "Stop", and a soft red ring), with "Tap to speak" or the time under it; beside it a wide dark #1F1E1C rounded button with a send icon, "Send to desktop".
- Floating at the screen edge: a blue round lightbulb bubble (voice tips) above a gold round "த" bubble with a small blue "EN" tag (Tamil helper). They hide while recording.
- While recording: "Listening… say any fields. They fill when you tap Stop."
- After speech, when quiet: amber chip "Quiet · stops in 3 s".
- After Stop, the status line changes in turn: "Please wait…", "Matching your answers to the fields…", "Filling the form…".
- After Send: "Sent. Click “Fill form” on the computer." Then green: "Filled on computer ✓ 14/16".
- In Tamil mode the whole screen changes together: labels read "தந்தை பெயர் · Father's name", and the buttons read "பேச தட்டவும்" (tap to speak), "தொடங்கு" (start), "நிறுத்து" (stop), "கணினிக்கு அனுப்பு" (send to desktop). Never mix English buttons with Tamil labels.

Phone page for a customer in a queue (the same page, with these changes):
- The dark button reads "Send to operator".
- After Send, a white centred card: a green tick in a pale green circle, "Your answers are saved", "The operator will call you at your turn.", an amber box "Keep the phone that gets the OTP with you.", and an outline button "Change my answers".
- After the operator fills it: "Your form is filled", "Check with the operator before you leave."

Extension popup (360 px wide, attached under the browser toolbar, page colour #FBF3DC):
- Honey-gold header band #EBC865: the logo and "Voice2Fill" on the left; small chips on the right such as "● Live" and "42 min"; a second line "Applicant registration · forms.example.in".
- Bottom right of the content: two round 44 px bubbles side by side. Blue with a white lightbulb (voice tips). Gold with a dark "த" and a small red mic badge (Tamil typing).
- Home: a white row "This page  forms.example.in"; two buttons side by side, dark "QR for this page" and outline "QR for other ⌄"; four numbered steps: QR for this page, Pair your phone, Speak the answers, Click Fill form; a footer with "Pro plan · till 30 Nov", "86 / 400 min · 21%", a thin bar and "⋯".
- After "QR for this page": a white card with a checkbox "Typing only (no voice)" and the line "The customer types every answer. No mic on the phone, no voice minutes used.", then an outline "Cancel" and a dark "Generate QR".
- After "QR for other": a white card "Latest forms", with "One QR per customer" on the right. Rows: "Applicant registration", under it "forms.example.in · 16 fields · Used 12 times", an outline "QR" button and a small ×.
- QR screen: a QR code on white, "Scan with your phone camera", a clock icon and "Expires in 9:42", footer "Waiting for your phone…" with a Cancel button.
- QR for one customer: the same, with a larger 256 px QR, the Tamil line "உங்கள் போன் கேமராவால் ஸ்கேன் செய்யுங்கள்" under the English, an outline "Copy link", and a "‹ Back" button. Once a phone scans it, the popup returns home with a green banner "QR scanned. The answers appear here once the customer presses Send."
- Waiting list on the home screen: a card with a 2 px blue border and a light blue title bar, "Customer answers waiting" with a small count. Rows: "Ramesh Kumar •••• 3210", under it "Applicant registration · Sent 10:42 am · 1 h 42 left", a dark "Use" button and a small ×.
- After pairing: "6 of 16 filled" with a progress bar; a light blue banner "3 new answers from the phone. Click Fill form to add them."; white cards titled "NEEDS A LOOK", "FILLED" and "NOT ANSWERED YET" holding rows of label and value; footer with a dark "Fill form" button (with a small "3 new" tag), an outline "Undo", and "⋯". On a form with upload fields, a white button with a 2 px blue border: a printer icon, "Fetch from scan", "Scans for this form stay on this computer".

Fetch from scan (a window of its own, beside the form):
- Gold header "Fetch from scan", chip "2 upload fields".
- A bar: green dot "Connected", a folder icon, "Scans", outline "Refresh" and "Change folder".
- "New scans" with cards of paper thumbnails, each with a time and a file name. A selected card has a blue border and a round number: 1, 2, in page order.
- "1 scan selected. Use for which field?" with the upload fields as buttons, such as "Address proof *" and "JPG / PDF · max 500 KB · up to 3 pages".
- A review screen titled with the field name: "The website asks for JPG / PDF · max 500 KB · up to 3 pages"; left "Your scan" with four draggable corners; right "Result" with green ticks "PDF, 1 page", "412 KB, limit 500 KB", "Cropped and straightened"; footer "Back" and a dark "Save to form".
- Footer: "Scans stay on this computer until the form ends."

Tamil typing (a panel in the popup):
- Gold header: a blue square with a white "த", "Tamil typing", and the line "Speak Tamil, then copy the text anywhere".
- A white card: a 68 px red mic, "Tap and speak in Tamil", "Speaking uses your voice minutes". While recording: "Listening 0:05", moving level bars, "Stops in 3 s". Then "Writing your Tamil…".
- "TAMIL TEXT", "You can edit it", a text box in Noto Sans Tamil, a dark "Copy text" and an outline "Clear".

On the web form, a field that was just filled gets a 2 px #F2B705 outline around it.

SAMPLE DATA (made up; use only this)
Ramesh Kumar · father Murugan · 12-03-1988 · Male · mobile 98765 43210 · Tamil Nadu · Salem · Omalur · Kanniyampatti · a form of 16 fields.
Customers in the waiting list: Ramesh Kumar •••• 3210 · Lakshmi •••• 7788.
Applicant photo: "JPG · max 50 KB", result "Ready: JPG · 38 KB". Address proof: "JPG / PDF · max 500 KB · up to 3 pages", result "Ready: PDF (2 pages) · 412 KB".
Tamil labels: பெயர் · Name, தந்தை பெயர் · Father's name, பிறந்த தேதி · Date of birth, கைபேசி எண் · Mobile number, மாவட்டம் · District, வட்டம் · Taluk.

HONESTY RULES (the product must never look better than it is)
- The form never submits itself. The operator clicks Fill form, checks, and clicks the site's own Submit.
- Answers arrive after Stop, not word by word.
- No spoken commands. "Start over" and "Send" are buttons.
- A form appears under Latest forms only after the operator has used it once. Each customer gets their own QR code; a QR works once.
- Answers wait for the operator only after the customer presses Send, for about 2 hours.
- Captcha and OTP are typed on the computer. In a queue, the customer keeps the phone that gets the OTP.
- Tamil typing uses voice minutes. Typing only, the Tamil helper and photos use none.
- No time-saved numbers, percentages, customer counts, ratings or "best / #1 / fastest / official / government approved".
- Plans are shown in voice minutes only. Never show how many forms a plan covers.

Reply "Ready" and wait for the first video prompt.
```

---

## Prompt V1: business problem (about 65 s)

The story: a calm morning turns into a queue, the pains pile up, then one idea takes the weight off. Spend the first half on the owner's problem. Don't show any product screens until 0:27.

```
Video V1, "The queue". About 65 seconds, 1920×1080. Phone screens in this video are in Tamil mode. Follow this table exactly. The VO column is for timing only: show its Tamil as the caption, with the English under it.

| Time | Scene (3D) | VO / caption |
|---|---|---|
| 0:00–0:05 | Close on a paper token dropping onto the counter: "16". Pull back fast enough to feel the moment, but smoothly: the operator is alone at the counter and the queue runs out through the shutter onto the street. | "வரிசையில பதினஞ்சு பேர். நீங்க ஒருத்தர் தான்." / 15 in the queue. Only one of you. |
| 0:05–0:11 | The operator leans towards the screen, looks from the citizen to the keyboard and back. Empty form fields stack up in the air around them like a pile of paper, higher each time. | "ஒவ்வொரு விவரத்தையும் கேட்டு, கேட்டு டைப் பண்ணணும்." / Ask, type, ask, type. Every detail. |
| 0:11–0:17 | Visual joke: a big square 3D photo print tries to squeeze through a small slot marked "50 KB". It bumps, gets stuck, tries again. The operator rubs their forehead. | "போட்டோ 50 KB-க்குள்ள வரணும். அது ஒரு தனி வேலை." / Photo under 50 KB. That's a job of its own. |
| 0:17–0:22 | A printed paper slides back along the counter. Camera closes in on one letter in a name, circled in amber. The citizen sighs. | "ஒரு எழுத்து தப்பானா, திரும்ப அலைச்சல்." / One wrong letter, and they're back again. |
| 0:22–0:27 | The last people in the queue check the time, turn and walk to another shop down the street. Hold on the empty spot where they stood. | "கூட்டம் பார்த்து, customer அடுத்த கடைக்கு போயிடுறாங்க." / They see the crowd and walk to the next shop. |
| 0:27–0:32 | Everything stops. The room dims gently. A round red mic button rises onto the counter and the room warms up again. Title appears large. | "இனிமே… சொன்னா போதும்!" / Now, just say it. |
| 0:32–0:40 | Calm music moment. An elderly woman in the queue scans a large QR code on the monitor with her phone; the phone page opens with no app. She taps the red mic and speaks. A speech bubble: "பெயர் லட்சுமி, மாவட்டம் சேலம்". | "QR scan பண்ணி, அவங்க phone-லயே தமிழ்ல சொல்லலாம்." / Scan the QR. They speak Tamil on their own phone. |
| 0:40–0:47 | Pull back: the people waiting are now seated, each with their own phone. Each one scans their own QR, one after another, speaks and presses Send. In the popup, the card "Customer answers waiting" fills up one row at a time: 1, 2, 3. The operator serves the person at the counter, calm. | "வரிசையில காத்திருக்கும்போதே form நிரப்பிடலாம். அவங்க முறை வரும்போது பதில்கள் தயாரா இருக்கும்." / They fill the form while they wait. At their turn, the answers are ready. |
| 0:47–0:52 | The same photo from earlier meets the "50 KB" slot, gently shrinks and slides through. A green label: "Ready: JPG · 38 KB". | "போட்டோவை phone-ஏ சரியான அளவுக்கு மாத்திடும்." / The phone makes the photo fit. |
| 0:52–0:57 | The operator clicks "Use", then "Fill form", and the fields fill with yellow outlines. The operator reads the screen with the citizen, then clicks the site's Submit button themselves. | "நீங்க சரிபார்த்து, Submit பண்ணுங்க. அவ்வளவு தான்." / You check it and submit. That's all. |
| 0:57–1:02 | Same wide shot as the opening: the queue is short and relaxed, new people walk in from the street, the operator smiles. Title in gold: "வரிசை குறையும், வருமானம் கூடும்" | Same words, spoken. / Shorter queue. Bigger earnings. |
| 1:02–1:07 | End card on #1E4E9C: logo, "சொன்னா போதும்!", "Speak. It fills.", "7 நாள் இலவசம் · 7-day free trial · 15 voice minutes", "{{ACCOUNT_CONTACT}}". | "ஏழு நாள் இலவசமா try பண்ணிப் பாருங்க." / Try it free for 7 days. |
```

### Prompt V1-Vertical

```
Now make a vertical version of V1 at 1080×1920 for phones. Same scenes, order, timing and captions. Re-frame each shot for portrait: closer on people, taller queue shots, the monitor above and phones below. Keep titles in the middle 70% of the height, so phone apps don't cover them. The first 3 seconds must work with the sound off.
```

---

## Prompt V2: features, one chapter at a time

Paste the intro first, then one chapter per message. Each chapter is 10 to 20 seconds.

```
Video V2, "How it works". 1920×1080. We will build it chapter by chapter. Every chapter uses a clean studio version of the 3D world: a soft rounded desktop computer and a large phone standing on a #FAF9F7 surface, with one person's hands or a simple character when needed. The product screens are the star: keep the camera straight on whenever text must be read. Phone screens are in English unless a chapter says otherwise. Show a small chapter title at the top left for the first 2 seconds. Reply "Ready for chapter 1".
```

| # | Time | Prompt to paste | VO / caption |
| --- | --- | --- | --- |
| **1** | 0:00–0:14 | **Scan once.** Chapter 1, "Scan the form". On the computer, the form page is open. A cursor clicks the extension icon; the popup opens; click "QR for this page", then "Generate QR". The popup changes to the QR code with "Expires in 9:42". A phone camera scans it, and the phone page opens in its browser with all 16 fields listed. Tap ⋯, then "தமிழ்": for 2 seconds every label and button changes to Tamil, with labels like "தந்தை பெயர் · Father's name". Show a small label "No app to install". | "Form-ஐ scan பண்ணுங்க. Phone-ல QR காட்டுங்க. எந்த app-உம் தேவையில்லை." / Scan the form. Show the QR. No app needed. |
| **2** | 0:14–0:32 | **Speak.** Chapter 2, "Just say it". Tap the red mic. It turns into Stop with a red ring. Line: "Listening… say any fields. They fill when you tap Stop." Speech bubble: "Name Ramesh Kumar, mobile 98765 43210, மாவட்டம் சேலம்". The speaker goes quiet: the amber chip counts "Quiet · stops in 3 s", 2, 1, and the recording stops by itself. Status line: "Matching your answers to the fields…". Then Name, Mobile and District fill together with green ticks and "6 / 16 filled". | "Field பேரைச் சொல்லி, பதிலைச் சொல்லுங்க. தமிழ், English, ரெண்டும் கலந்தும் பேசலாம். பேசி முடிச்சா, அதுவே நின்னுடும்." / Say the field name, then the answer. Tamil, English or both. It stops by itself when you finish. |
| **3** | 0:32–0:48 | **Fix mistakes.** Chapter 3, "Fix it easily". A row shows "Jahan" with "Heard: “Jahan”". Speech bubble: "Jahan இல்ல, Jagan". The value changes to Jagan. Next, the row "District" shows "Erodu" with an amber "Check this" pill; tap "✎ Type", correct it to "Erode" and Save; a green tag says "Free: no minutes used". The bottom bar's amber chip "2 need you" becomes "1 need you". | "தப்பா வந்தா, பேசியே திருத்தலாம். இல்ல, Type பண்ணலாம். அதுக்கு minutes செலவாகாது." / Correct it by speaking, or type it. Typing uses no minutes. |
| **4** | 0:48–1:04 | **Fill and check.** Chapter 4, "You stay in control". Tap "Send to desktop". The phone says "Sent. Click “Fill form” on the computer." The popup shows the blue banner "3 new answers from the phone. Click Fill form to add them." The operator clicks "Fill form". Fields on the web page fill one by one with yellow outlines. The phone shows "Filled on computer ✓ 14/16". Then the cursor rests near the site's Submit button without the form submitting itself. Small line: "Captcha and OTP: type them on the computer." Show the "Undo" button pulsing once. | "Fill form click பண்ணுங்க. Form நிரம்பும். சரிபார்த்து, Submit நீங்களே பண்ணுங்க. Undo-வும் இருக்கு." / Click Fill form. Check it. You submit. Undo is there too. |
| **5** | 1:04–1:18 | **Dropdowns.** Chapter 5, "Dropdowns, in order". On the web form, four dropdowns: State → District → Taluk → Village. They fill in turn; each waits for the next list to load (a small spinner). Village can't be matched: the phone row shows the amber "Pick one" pill, "You said “Kanniyampatti”. Which one did you mean?" with two white buttons, "Kanniyampatti" and "Kanniyampatti Pudur". A thumb taps the first. | "State, District, Taluk, Village: வரிசையா நிரப்பும். சந்தேகம்னா, phone-ல கேக்கும். தானா guess பண்ணாது." / Filled in order. If it's unsure, it asks. It never guesses. |
| **6** | 1:18–1:38 | **Photos and documents.** Chapter 6, "Photos and documents". Part 1: the row "Applicant photo · JPG · max 50 KB", tap Add, take a photo, a frame sits on the face, then "Ready: JPG · 38 KB", "Send to computer", and the row shows "On the computer ✓". Part 2: a paper certificate on a dark table is photographed at an angle. "Finding the page…", four corner handles snap onto the sheet, the page straightens and the option "Scan look (white paper, darker writing)" turns it clean. Add a second page. "Ready: PDF (2 pages) · 412 KB". Part 3: a big PDF is chosen; "Making the PDF smaller…", then "Made smaller from 2.1 MB, every page kept." Use flat placeholder paper with grey lines and no real document design. | "போட்டோவை அளவுக்கு மாத்தும். Document-ஐ scan மாதிரி நேராக்கி, ஒரே PDF ஆக்கும். பெரிய PDF-ஐயும் சின்னதாக்கும்." / Photos sized to fit. Paper straightened into one clean PDF. Big PDFs made smaller. |
| **7** | 1:38–1:54 | **New: Fetch from scan.** Chapter 7, "From your scanner". Show a small gold tag "New". A flatbed scanner closes and hums on the desk. The operator clicks "Fetch from scan" in the popup, and a window opens beside the form with "Connected · Scans". A new card appears under "New scans"; click it and a round blue "1" appears. "1 scan selected. Use for which field?" Click "Address proof *". The review screen shows "Your scan" with four corners and "Result" with green ticks: "PDF, 1 page", "412 KB, limit 500 KB", "Cropped and straightened". Click "Save to form". The popup says "1 scan saved. Click Fill form to add it." Click Fill form; the upload field fills with a yellow outline. Keep the footer line in view: "Scans stay on this computer until the form ends." Use flat placeholder paper. | "Scanner-ல scan பண்ணுங்க. File இங்க வரும். எந்த field-க்குனு click பண்ணுங்க. அளவை அதுவே சரிபண்ணும்." / Scan it. It shows up here. Click the field. The size is fixed for you. |
| **8** | 1:54–2:08 | **Busy counter.** Chapter 8, "Made for a busy counter". The monitor shows 5 tabs, each with its own QR and phone; clicking a tab changes the popup to that form. Then one phone taps ⋯, "Start over", "Clear phone and computer form"; a green line says "Cleared here and on the computer. Ready for the next applicant." Then a new step appears on the web form and the phone shows "3 new fields on the computer (step 2)". Finally a phone page is closed by mistake; in the popup's ⋯ menu, click "Connect phone again"; the QR returns with the line "Scan with your phone. Answers so far are kept." | "அஞ்சு form வரைக்கும். அடுத்த ஆளுக்கு Start over. Phone மூடினாலும், பதில்கள் போகாது." / Up to 5 forms. Start over for the next person. Close the phone by mistake, and the answers stay. |
| **9** | 2:08–2:28 | **New: Queue QR.** Chapter 9, "Before their turn". Show a small gold tag "New". The operator is still on another job. In the popup, click "QR for other"; the "Latest forms" card opens, "One QR per customer". Click "QR" on "Applicant registration", then "Generate QR". A large QR appears, with no form open on the computer; show a small label "No website login needed yet". A customer in a chair scans it, and the popup returns home with the green banner "QR scanned. The answers appear here once the customer presses Send." The customer speaks and taps "Send to operator". Their phone shows "Your answers are saved", "The operator will call you at your turn." and "Keep the phone that gets the OTP with you." The card "Customer answers waiting" shows "Ramesh Kumar •••• 3210". At their turn, the operator opens the form, clicks "Use", then "Fill form", and the fields fill. The phone changes to "Your form is filled". | "வரிசையில இருக்கிறவங்களுக்கு ஆளுக்கு ஒரு QR. Website login இப்போ தேவையில்லை. அவங்க பேசி, Send பண்ணுவாங்க. அவங்க முறை வரும்போது Use, அப்புறம் Fill form." / One QR for each person. No website login yet. They speak and press Send. At their turn: Use, then Fill form. |
| **10** | 2:28–2:42 | **New: Answers wait.** Chapter 10, "Logged out? Nothing lost". Show a small gold tag "New". The customer has pressed Send. The website on the computer shows a plain "Session expired, please log in" page, and the tab closes. The customer's phone shows "Your answers are saved" and "The operator will fill your form. You don't need to do anything else." The operator logs in again and opens the form. The popup shows "Customer answers waiting" with "Sent 10:42 am · 1 h 42 left". Click "Use", then "Fill form". Then show the button "Customer needs to correct": it brings the QR back with "Copy link" and the line "Send this only to this customer. It works once, for 10 minutes." | "Website logout ஆயிடுச்சா? கவலை வேண்டாம். Send பண்ண பதில்கள் ரெண்டு மணி நேரம் இருக்கும். Login பண்ணி Use கொடுங்க." / Website logged you out? Don't worry. Sent answers wait for 2 hours. Log in and click Use. |
| **11** | 2:42–2:54 | **Typing only.** Chapter 11, "Typing only". In the popup, click "QR for this page", tick "Typing only (no voice)", then "Generate QR". The header gets a "✎ Typing only" chip. A customer waiting in a queue opens the phone page: no mic anywhere, a blue banner "Tap a field to type its answer.", and Send fills the bottom bar. They tap a field and type. Green tag: "No voice minutes used". | "கூட்டத்துல சத்தமா இருக்கா? Typing only போடுங்க. Customer அவங்க phone-ல டைப் பண்ணலாம். Minutes செலவாகாது." / Too noisy? Turn on Typing only. The customer types on their phone. No minutes used. |
| **12** | 2:54–3:04 | **Tamil helper.** Chapter 12, "Tamil helper". On the phone, tap the gold "த" bubble with the blue EN tag. A bottom sheet with a gold header "தமிழ் உதவி" slides up. Type "Date of birth"; after a short pause "பிறந்த தேதி" appears; tap Copy and it changes to "Copied". Small line: "Nothing goes into the form by itself." | "புரியாத English வார்த்தையா? டைப் பண்ணுங்க, தமிழ்ல காட்டும்." / An English word you don't know? Type it and see it in Tamil. |
| **13** | 3:04–3:16 | **New: Tamil typing.** Chapter 13, "Tamil typing". Show a small gold tag "New". In the popup, click the gold "த" bubble with the red mic. The Tamil typing panel opens. The operator speaks into a headset on the computer. "Listening 0:05", level bars moving, then "Writing your Tamil…". The text "ஐயா, எனது சான்றிதழின் நகல் வேண்டும்." appears in the box. Click "Copy text"; it changes to "Copied". Paste it into a plain remarks box on a web page. Small line: "Uses your voice minutes". | "Letter, message, remark: தமிழ்ல பேசுங்க, எழுத்தா வரும். Copy பண்ணி எங்க வேணாலும் paste பண்ணுங்க." / Letters, messages, remarks: speak Tamil, get Tamil text. Copy it anywhere. |
| **14** | 3:16–3:26 | **Voice tips.** Chapter 14, "Voice tips". The operator clicks the blue lightbulb in the popup. Card "Tip 1 of 6", titled "Say the field name, then the answer", with the note "Tell your customer before handing over the phone". Flip quickly through the tips: Tap Stop as soon as you finish, Numbers in small groups (98765 · 43210), Fix one answer by typing, Phone close. Show the two tags "₹ Saves minutes" and "✓ Better accuracy". | "எப்படிப் பேசணும்னு ஆறு சின்ன tips. Customer-க்கு காட்டுங்க. Minutes மிச்சமாகும்." / Six quick tips to show your customer. They save minutes. |
| **15** | 3:26–3:42 | **Trust and price.** Chapter 15, "Safe and simple". Three simple 3D icons appear in turn. A shield: "Voice is never stored." A clock: "Answers deleted within about 2 hours." A photo fading away: "Photos deleted once the computer has them." Then a price card: "Pro · ₹649 / month · 400 voice minutes", and the small line "Only recording time counts." End card on #1E4E9C: logo, "சொன்னா போதும்!", "7-day free trial · 15 voice minutes", "{{ACCOUNT_CONTACT}}". | "Voice சேமிக்கப்படாது. பதில்கள் ரெண்டு மணி நேரத்துல அழிஞ்சிடும். ஏழு நாள் இலவசமா try பண்ணுங்க." / Voice is never stored. Answers deleted within about 2 hours. Try it free for 7 days. |

---

## Checklist before you publish

- [ ] **Fill form is clicked by a person** in every video. The page never fills by itself.
- [ ] **Answers arrive after Stop**, not word by word.
- [ ] **Submit is the operator's own click.** The form never submits itself.
- [ ] **The current buttons:** "QR for this page", "Generate QR" and "QR for other", not "Scan form on this page".
- [ ] **No voice commands, no review screen, no "Full form / Field by field" tabs.**
- [ ] **Screens match the app**: 72 px mic in the bottom bar, gold popup header, real wording.
- [ ] **One QR per customer** in every queue scene. A QR works once.
- [ ] **The two "த" bubbles are kept apart:** EN tag on the phone (Tamil helper), red mic in the popup (Tamil typing).
- [ ] **No time-saved numbers** until you have your own measurements.
- [ ] **Minutes only**, never "number of forms".
- [ ] **No emblems, portal names or other companies' logos.**
- [ ] **`{{ACCOUNT_CONTACT}}` is filled in.**
- [ ] **A Tamil speaker has checked** every caption and voice-over line.
- [ ] **Sound-off test:** V1's first 3 seconds make sense with no sound.
- [ ] **For the Chrome Web Store:** use the short video in `design-brief.md` (Prompt 9), or V2 after comparing its screens with the real app.

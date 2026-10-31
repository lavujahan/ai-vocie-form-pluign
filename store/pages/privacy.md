<!--
Before publishing:
1. Replace {{COMPANY}}, {{SITE}} and {{EMAIL}}.
2. Section 5, "Form session records", assumes plan step 1.6 is done: session records are deleted after 30 days.
   If you publish before applying it, change that row to: "Kept until the account is deleted."
3. Every statement here must match the Chrome Web Store Privacy tab and what the code does.
   If the code changes, update this page.
-->

# Privacy policy: Voice Form Filler

**Effective date:** 31 October 2026

Voice Form Filler ("the service") is run by {{COMPANY}} ("we", "us"). It has two parts:
- the **Chrome extension**, which reads a form on your computer and fills it in;
- the **phone page**, which opens when you scan the QR code. You speak your answers or add photos there.

This policy explains what data the service handles, why, who it is shared with, and how long it is kept.

## 1. Summary

- We use your data only to fill the form you chose. We never sell it, use it for advertising or use it to decide on credit or loans.
- Voice recordings are never stored. They are turned into text and thrown away.
- Your spoken answers and their text are deleted automatically, within about an hour of starting a form. Answers your customer has sent are kept for about 2 hours after sending, so a form can be finished if a website logs you out.
- Uploaded photos and documents are deleted as soon as the computer receives them.
- The extension never submits a form. You check it and submit it yourself.

## 2. What we collect and why

| Data | When | Why |
| --- | --- | --- |
| **Account details**: name, phone number, a hashed PIN | When your administrator creates your account | To sign you in |
| **Sign-in attempts**: phone number, IP address, success or failure | Each time you sign in | To block repeated wrong PINs and protect accounts |
| **Form page details**: the page's address (URL), title and form name | When you click "Scan form on this page" | To show the phone which form it is filling, and to avoid filling the wrong page |
| **Form structure**: field labels, field types, dropdown options, upload rules (for example "JPG, max 50 KB") | When you scan, and when new fields appear on a later step | To understand the form so your answers go into the right fields |
| **Voice recordings** | When you tap the mic on the phone, or the mic in the extension's Tamil typing (this uses your computer's microphone, only after you allow it in Chrome) | To turn your speech into text. Not stored. |
| **What you said, as text, and the field values made from it** | After each recording on a form | To fill the form and let you check and correct the answers |
| **Tamil typing text** | After each Tamil typing recording | To show you the text to copy. It is sent back to the extension and not stored on our servers. It stays in your browser until you clear it, sign out or close Chrome. |
| **Photos and documents** you add on the phone | When you upload one for an upload field | To put the file into the website's upload field |
| **Usage records**: time of each request, minutes of audio, number of AI tokens, cost | Each time speech is transcribed or the AI reads a form | To count the voice minutes in your plan and keep track of costs. These records contain no audio, text or answers. |
| **Plan and payment records**: your plan, its dates and minutes, and each payment's amount, date, method and reference (for example a UPI transaction id) | When you get or renew a plan, or buy extra minutes | To know which plan you paid for, and for our accounts. We never receive or store card numbers, UPI PINs or bank passwords. |

We don't collect your browsing history. The extension runs on no website by default. When you click "Scan form on this page", Chrome asks you to allow that one site; the extension then reads that site's form pages only while a form session is open, so a form's next step also fills. You can remove that access in Chrome at any time.

## 3. Who we share it with

We share data only with the services needed to run Voice Form Filler. Each one processes it for us under its own terms:

| Service | What it receives | Why |
| --- | --- | --- |
| **Sarvam AI** | Voice recordings and, with some speech models, the form's field and option names as spelling hints | Turns speech into text (Tamil, English and Tanglish) |
| **OpenAI** | What you said as text, the form's field labels and options, and your last few answers | Reads the form and turns what you said into field values |
| **Supabase** | Account, session, answer and file data | Database, live updates between phone and computer, and private file storage |
| **Vercel** | All requests to our server, in transit | Hosts the server and the phone page |

Photos and documents are never sent to Sarvam AI or OpenAI.
We may also disclose data if the law requires it.

These providers may process data on servers outside India.

## 4. On your devices

- **Extension:** keeps your sign-in and open form sessions in Chrome's temporary session storage. It is cleared when you sign out or close the browser.
- **Phone page:**
  - keeps the current session in the browser tab's storage until you close the tab;
  - remembers your language choice (தமிழ் or English);
  - converts photos on the phone itself. Location and camera details (EXIF/GPS) are removed before upload.

## 5. How long we keep it

| Data | Kept for |
| --- | --- |
| Voice recordings | Not stored. Only held in memory while it is being converted to text. |
| What you said (text) and the field values | Deleted automatically about 40 to 60 minutes after the form session starts. Once the customer presses Send, about 2 hours after the last Send. "Start over" deletes them straight away, and so does the × beside a waiting form in the extension. |
| Photos and documents | Deleted as soon as the computer has the file or the website refuses it. Also deleted on "Start over", with the × beside a waiting form, when the session expires, and when the form tab is closed unless the customer has already sent the form. A sent form's files are kept for about 2 hours after sending if the computer has not received them. |
| Form session records (page address, title, field labels) | 30 days, then deleted |
| Sign-in attempts | 1 day |
| Usage records | Kept for billing. When an account is deleted, its usage records are no longer linked to it. |
| Plan and payment records | As long as the law requires us to keep accounting records. When an account is deleted, its payment records are no longer linked to it. |
| Account details | Until your administrator deletes the account |

## 6. How we protect it

- Every connection uses encryption (HTTPS and secure WebSockets). Stored data is encrypted by our database provider.
- QR codes work only once and expire after 10 minutes. When a customer needs to correct a form, the operator can send them the same code as a link, with the same limits. A phone link lasts 30 minutes.
- Each session can only be read by its own computer and phone. Phones and computers can't write to the database directly; every change goes through our server.
- Uploaded files are stored privately. Download links work for a single file and expire after 60 seconds.
- PINs are stored only as a hash. An account is locked for a while after too many wrong PINs.

## 7. Who can see your data

No person reads your recordings, transcripts, answers or files. That applies to us and to your administrator.
- **Administrators can see:** account names, phone numbers, plans, payments and usage totals (minutes, tokens, cost).
- **We may look at data only:** with your permission, to investigate security problems or abuse, or when the law requires it.

## 8. Chrome Web Store Limited Use

The use of information received from the Voice Form Filler extension follows the [Chrome Web Store User Data Policy](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq), including the Limited Use requirements.

## 9. Your choices and rights

- **Stop at any time:** use "Start over" on the phone, close the form tab, or sign out of the extension. A form your customer has sent stays until its hold ends: delete it sooner with the × in the extension.
- **Ask us:** email {{EMAIL}} to see, correct or delete your data, or to have your account deleted. Your administrator can also deactivate your account.

## 10. Children

The service is meant for adults and organisations. It is not directed at children under 13.

## 11. Changes

If this policy changes, we will update the date at the top of this page. If a change means we handle data in a new way, we will show a notice in the extension before it applies.

## 12. Contact

{{COMPANY}} · {{EMAIL}} · {{SITE}}

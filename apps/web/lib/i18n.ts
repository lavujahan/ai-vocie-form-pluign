import { MSG } from './session-rules';

/**
 * Phone screens in English or Tamil. Values filled into the form stay English (the website needs
 * them); only the screen text and field labels change. A missing Tamil string falls back to English.
 */

export type Lang = 'en' | 'ta';

const en = {
  connecting: 'Connecting to your computer…',
  cantContinue: "Can't continue",
  tabClosedTitle: 'Tab closed',
  tabClosedBody: 'The form tab on the computer was closed. Nothing will be sent. Scan a new QR code from the computer to continue.',
  offline: "You're offline. Recordings are sent when you're back online.",
  form: 'Form',
  processing: '{n} processing',
  modeFull: 'Full form',
  modeField: 'Field by field',
  stopRec: 'Stop recording',
  startRec: 'Start recording',
  unsupported: 'This browser can’t record audio. Open the link in Chrome (Android) or Safari (iPhone).',
  micBlocked: 'Microphone access was blocked.',
  listening: 'Listening… {time}',
  tapToSpeakField: 'Tap to speak: {label}',
  allFilled: 'All fields have values',
  tapToSpeak: 'Tap to speak',
  interrupted: 'Recording stopped (screen locked, call or app switch). What you said was sent. Tap the mic to continue.',
  tooShort: 'Tap, speak, then tap again to stop.',
  failed: 'Failed',
  checkBeforeSending: 'Check before sending',
  reconnecting: 'Reconnecting…',
  startOver: 'Start over',
  clearOne: 'Clear {n} answer? This can’t be undone.',
  clearMany: 'Clear all {n} answers? This can’t be undone.',
  clearPhone: 'Clear phone answers',
  clearBoth: 'Clear phone and computer form',
  cancel: 'Cancel',
  clearedBoth: 'Cleared here and on the computer. Ready for the next applicant.',
  clearedPhone: 'Answers cleared. Ready for the next applicant.',
  newFieldsOne: '1 new field on the computer{step}.',
  newFieldsMany: '{n} new fields on the computer{step}.',
  stepSuffix: ' (step {n})',
  step: 'Step {n}',
  copyLink: 'Copy link',
  linkCopied: 'Link copied. Paste it in Chrome',
  copyPrompt: 'Copy this link and open it in Chrome:',
  micHelpTitle: 'To allow the microphone:',
  micHelpChrome: 'Chrome (Android): tap the icon left of the address, then Permissions → Microphone → Allow.',
  micHelpSafari: 'Safari (iPhone): tap “aA” in the address bar, then Website Settings → Microphone → Allow.',
  tryAgain: 'Try again',
  recordingPill: 'Recording',
  processingLabel: 'Processing',
  tapToRetry: 'Tap to retry',
  checkThis: 'Check this',
  sayIt: 'Say it',
  pickOne: 'Pick one',
  backToRecording: 'Back to recording',
  youSaid: 'You said “{text}”',
  tapToEdit: 'Tap any value to edit or re-speak it. Captcha and OTP: type them on the computer.',
  missingOne: '1 required field is empty. Send anyway?',
  missingMany: '{n} required fields are empty. Send anyway?',
  sendAnyway: 'Send anyway',
  sentToDesktop: 'Sent to desktop',
  sendAgain: 'Send again',
  sendToDesktop: 'Send to desktop',
  voiceSendConfirm: 'Send the form to the computer now?',
  sendNow: 'Send now',
  ackWaiting: 'Filling on the computer…',
  ackFilled: 'Filled on computer ✓ {filled}/{total}',
  ackSkipped: ' · {n} not filled, check them there',
  ackNothing: 'Nothing could be filled on the computer. The form page may have changed. Open it again on the computer, then Send again.',
  ackTimeout: 'The computer hasn’t responded. Is the browser open with the form tab? Then Send again.',
  yes: 'Yes',
  no: 'No',
  hint_ambiguous: 'Which one did you mean?',
  hint_no_match: 'That isn’t in the list. Pick the right one, or say it again.',
  hint_parent_changed: 'That doesn’t fit the new choice above. Pick again, or say it again.',
  hint_not_loaded: 'The list didn’t load on the computer. Pick from the list, or say it again.',
  listeningStop: 'Listening… tap the stop button when done.',
  save: 'Save',
  speakField: 'Speak {label}',
  whatsLeftNone: 'Nothing required is missing.',
  whatsLeftSome: 'Still needed: {list}',
  beforeUnload: 'Recording in progress. Leave anyway?',
  switchLang: 'தமிழ்',
  // Messages that come from the server (matched by their English text, see `serverText`).
  srvTabClosed: MSG.tabClosed,
  srvTabMoved: MSG.tabMoved,
  srvCleared: MSG.cleared,
  srvQrExpired: MSG.qrExpired,
  srvQrUsed: MSG.qrUsed,
  srvQrUnknown: MSG.qrUnknown,
  srvNoSpeech: 'Didn’t catch any speech. Tap to retry.',
  srvBusy: 'Speech service is busy. Tap to retry in a minute.',
  srvNoMatch: 'Couldn’t match that to the form. Tap to retry.',
  srvNoTranscribe: 'Couldn’t transcribe. Tap to retry.',
  srvNetwork: 'Network error. Tap to retry.',
  srvLinkExpired: 'This link has expired. Scan the QR code again.',
  srvSessionExpired: 'This session has expired. Scan a new QR code.',
  srvSessionEnded: 'This session has ended. Scan a new QR code.',
  srvCouldNotSend: 'Could not send. Try again.',
  srvCouldNotClear: 'Could not clear. Try again.',
  srvAlreadyCleared: 'This form was already cleared. Reload the page.',
  srvCouldNotConnect: 'Could not connect. Check your network and scan again.',
};

export type TextKey = keyof typeof en;

const ta: Partial<Record<TextKey, string>> = {
  connecting: 'கணினியுடன் இணைக்கிறது…',
  cantContinue: 'தொடர முடியவில்லை',
  tabClosedTitle: 'டேப் மூடப்பட்டது',
  tabClosedBody: 'கணினியில் படிவம் உள்ள டேப் மூடப்பட்டது. எதுவும் அனுப்பப்படாது. தொடர, கணினியிலிருந்து புதிய QR குறியீட்டை ஸ்கேன் செய்யவும்.',
  offline: 'இணைய இணைப்பு இல்லை. இணைப்பு வந்ததும் பதிவுகள் அனுப்பப்படும்.',
  form: 'படிவம்',
  processing: '{n} செயலாக்கத்தில்',
  modeFull: 'முழு படிவம்',
  modeField: 'ஒவ்வொரு புலமாக',
  stopRec: 'பதிவை நிறுத்து',
  startRec: 'பதிவைத் தொடங்கு',
  unsupported: 'இந்த உலாவியில் ஒலிப்பதிவு செய்ய முடியாது. இணைப்பை Chrome (Android) அல்லது Safari (iPhone)-இல் திறக்கவும்.',
  micBlocked: 'மைக்ரோஃபோன் அனுமதி தடுக்கப்பட்டுள்ளது.',
  listening: 'கேட்கிறது… {time}',
  tapToSpeakField: 'பேச தட்டவும்: {label}',
  allFilled: 'எல்லா புலங்களிலும் மதிப்பு உள்ளது',
  tapToSpeak: 'பேச தட்டவும்',
  interrupted: 'பதிவு நின்றது (திரை பூட்டு, அழைப்பு அல்லது வேறு செயலி). நீங்கள் பேசியது அனுப்பப்பட்டது. தொடர மைக்கைத் தட்டவும்.',
  tooShort: 'தட்டி, பேசி, முடிந்ததும் மீண்டும் தட்டவும்.',
  failed: 'தோல்வி',
  checkBeforeSending: 'அனுப்பும் முன் சரிபார்க்கவும்',
  reconnecting: 'மீண்டும் இணைக்கிறது…',
  startOver: 'புதிதாகத் தொடங்கு',
  clearOne: '{n} பதிலை அழிக்கவா? இதைத் திரும்பப் பெற முடியாது.',
  clearMany: 'எல்லா {n} பதில்களையும் அழிக்கவா? இதைத் திரும்பப் பெற முடியாது.',
  clearPhone: 'கைபேசி பதில்களை அழி',
  clearBoth: 'கைபேசி மற்றும் கணினி படிவத்தை அழி',
  cancel: 'ரத்து',
  clearedBoth: 'இங்கும் கணினியிலும் அழிக்கப்பட்டது. அடுத்த விண்ணப்பதாரருக்குத் தயார்.',
  clearedPhone: 'பதில்கள் அழிக்கப்பட்டன. அடுத்த விண்ணப்பதாரருக்குத் தயார்.',
  newFieldsOne: 'கணினியில் 1 புதிய புலம்{step}.',
  newFieldsMany: 'கணினியில் {n} புதிய புலங்கள்{step}.',
  stepSuffix: ' (படி {n})',
  step: 'படி {n}',
  copyLink: 'இணைப்பை நகலெடு',
  linkCopied: 'இணைப்பு நகலெடுக்கப்பட்டது. Chrome-இல் ஒட்டவும்',
  copyPrompt: 'இந்த இணைப்பை நகலெடுத்து Chrome-இல் திறக்கவும்:',
  micHelpTitle: 'மைக்ரோஃபோனை அனுமதிக்க:',
  micHelpChrome: 'Chrome (Android): முகவரிக்கு இடப்பக்கம் உள்ள ஐகானைத் தட்டி, Permissions → Microphone → Allow.',
  micHelpSafari: 'Safari (iPhone): முகவரிப் பட்டியில் “aA” தட்டி, Website Settings → Microphone → Allow.',
  tryAgain: 'மீண்டும் முயற்சி செய்',
  recordingPill: 'பதிவாகிறது',
  processingLabel: 'செயலாக்கத்தில்',
  tapToRetry: 'மீண்டும் முயல தட்டவும்',
  checkThis: 'சரிபார்க்கவும்',
  sayIt: 'சொல்லவும்',
  pickOne: 'ஒன்றைத் தேர்ந்தெடு',
  backToRecording: 'பதிவுக்குத் திரும்பு',
  youSaid: 'நீங்கள் சொன்னது “{text}”',
  tapToEdit: 'மாற்ற அல்லது மீண்டும் பேச எந்த மதிப்பையும் தட்டவும். Captcha, OTP: கணினியில் தட்டச்சு செய்யவும்.',
  missingOne: '1 கட்டாயப் புலம் காலியாக உள்ளது. இருந்தாலும் அனுப்பவா?',
  missingMany: '{n} கட்டாயப் புலங்கள் காலியாக உள்ளன. இருந்தாலும் அனுப்பவா?',
  sendAnyway: 'இருந்தாலும் அனுப்பு',
  sentToDesktop: 'கணினிக்கு அனுப்பப்பட்டது',
  sendAgain: 'மீண்டும் அனுப்பு',
  sendToDesktop: 'கணினிக்கு அனுப்பு',
  voiceSendConfirm: 'படிவத்தை இப்போது கணினிக்கு அனுப்பவா?',
  sendNow: 'இப்போது அனுப்பு',
  ackWaiting: 'கணினியில் நிரப்புகிறது…',
  ackFilled: 'கணினியில் நிரப்பப்பட்டது ✓ {filled}/{total}',
  ackSkipped: ' · {n} நிரப்பப்படவில்லை, கணினியில் சரிபார்க்கவும்',
  ackNothing: 'கணினியில் எதையும் நிரப்ப முடியவில்லை. படிவப் பக்கம் மாறியிருக்கலாம். கணினியில் மீண்டும் திறந்து, மீண்டும் அனுப்பவும்.',
  ackTimeout: 'கணினியிடமிருந்து பதில் இல்லை. உலாவியில் படிவ டேப் திறந்துள்ளதா? பிறகு மீண்டும் அனுப்பவும்.',
  yes: 'ஆம்',
  no: 'இல்லை',
  hint_ambiguous: 'எதைக் குறிப்பிட்டீர்கள்?',
  hint_no_match: 'அது பட்டியலில் இல்லை. சரியானதைத் தேர்ந்தெடுக்கவும் அல்லது மீண்டும் சொல்லவும்.',
  hint_parent_changed: 'மேலே உள்ள புதிய தேர்வுக்கு அது பொருந்தவில்லை. மீண்டும் தேர்ந்தெடுக்கவும் அல்லது மீண்டும் சொல்லவும்.',
  hint_not_loaded: 'கணினியில் பட்டியல் ஏறவில்லை. பட்டியலிலிருந்து தேர்ந்தெடுக்கவும் அல்லது மீண்டும் சொல்லவும்.',
  listeningStop: 'கேட்கிறது… முடிந்ததும் நிறுத்து பொத்தானைத் தட்டவும்.',
  save: 'சேமி',
  speakField: '{label} சொல்லவும்',
  whatsLeftNone: 'கட்டாயப் புலங்கள் எதுவும் மீதமில்லை.',
  whatsLeftSome: 'இன்னும் தேவை: {list}',
  beforeUnload: 'பதிவு நடக்கிறது. வெளியேறவா?',
  switchLang: 'English',
  srvTabClosed: 'டேப் மூடப்பட்டது. கணினியில் படிவம் உள்ள டேப் மூடப்பட்டது. எதுவும் அனுப்பப்படாது. தொடர, கணினியிலிருந்து புதிய QR குறியீட்டை ஸ்கேன் செய்யவும்.',
  srvTabMoved: 'கணினியில் படிவ டேப் வேறு இணையதளத்திற்கு மாறிவிட்டது. அனுப்ப, கணினியில் படிவத்தை மீண்டும் திறக்கவும்.',
  srvCleared: '"புதிதாகத் தொடங்கு" மூலம் இது அழிக்கப்பட்டது.',
  srvQrExpired: 'இந்த QR குறியீடு காலாவதியானது. கணினியில் புதியதை உருவாக்கவும்.',
  srvQrUsed: 'இந்த QR குறியீடு ஏற்கனவே வேறு கைபேசியில் திறக்கப்பட்டது. கணினியில் புதியதை உருவாக்கவும்.',
  srvQrUnknown: 'இந்த QR குறியீடு செல்லாது. கணினியில் புதியதை உருவாக்கவும்.',
  srvNoSpeech: 'பேச்சு எதுவும் கேட்கவில்லை. மீண்டும் முயல தட்டவும்.',
  srvBusy: 'பேச்சு சேவை பிஸியாக உள்ளது. ஒரு நிமிடம் கழித்து மீண்டும் தட்டவும்.',
  srvNoMatch: 'அதைப் படிவத்துடன் பொருத்த முடியவில்லை. மீண்டும் முயல தட்டவும்.',
  srvNoTranscribe: 'பேச்சை எழுத்தாக மாற்ற முடியவில்லை. மீண்டும் முயல தட்டவும்.',
  srvNetwork: 'இணைய பிழை. மீண்டும் முயல தட்டவும்.',
  srvLinkExpired: 'இந்த இணைப்பு காலாவதியானது. QR குறியீட்டை மீண்டும் ஸ்கேன் செய்யவும்.',
  srvSessionExpired: 'இந்த அமர்வு காலாவதியானது. புதிய QR குறியீட்டை ஸ்கேன் செய்யவும்.',
  srvSessionEnded: 'இந்த அமர்வு முடிந்தது. புதிய QR குறியீட்டை ஸ்கேன் செய்யவும்.',
  srvCouldNotSend: 'அனுப்ப முடியவில்லை. மீண்டும் முயலவும்.',
  srvCouldNotClear: 'அழிக்க முடியவில்லை. மீண்டும் முயலவும்.',
  srvAlreadyCleared: 'இந்தப் படிவம் ஏற்கனவே அழிக்கப்பட்டது. பக்கத்தை மீண்டும் ஏற்றவும்.',
  srvCouldNotConnect: 'இணைக்க முடியவில்லை. இணையத்தைச் சரிபார்த்து மீண்டும் ஸ்கேன் செய்யவும்.',
};

export function translate(lang: Lang, key: TextKey, vars: Record<string, string | number> = {}): string {
  const s = (lang === 'ta' ? ta[key] : undefined) ?? en[key];
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

/** The server's English messages (errors, session states), by their exact text. */
const SERVER_TEXT = new Map<string, TextKey>(
  (Object.keys(en) as TextKey[])
    .filter((k) => k.startsWith('srv'))
    // Server messages use straight apostrophes; the screen text uses curly ones.
    .map((k) => [en[k].replace(/’/g, "'"), k]),
);

/** A message from the server, in the screen's language when it is a known one (otherwise as sent). */
export function serverText(lang: Lang, text: string | null | undefined): string {
  if (!text) return '';
  const key = SERVER_TEXT.get(text.replace(/’/g, "'"));
  return key ? translate(lang, key) : text;
}

/** A field's label on the phone: in Tamil mode "தந்தை பெயர் · Father's name" (the English matches the computer). */
export function fieldLabelFor(lang: Lang, f: { label: string; label_ta?: string | null }): string {
  return lang === 'ta' && f.label_ta ? `${f.label_ta} · ${f.label}` : f.label;
}

const LANG_KEY = 'vff:lang';

/** The phone's saved choice, else Tamil if the phone's language is Tamil. */
export function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved === 'en' || saved === 'ta') return saved;
  } catch {
    /* storage blocked */
  }
  return typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('ta') ? 'ta' : 'en';
}

export function saveLang(lang: Lang) {
  try {
    localStorage.setItem(LANG_KEY, lang);
  } catch {
    /* storage blocked: the choice lasts until reload */
  }
}

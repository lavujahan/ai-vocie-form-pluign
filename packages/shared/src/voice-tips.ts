/**
 * Voice tips: how to speak so answers come out right first time, using fewer voice minutes. Shown from
 * the tips bubble in the extension popup (for the operator to show the customer) and on the phone.
 */

export type TipsLang = 'en' | 'ta';
export type TipId = 'label' | 'pace' | 'stop' | 'numbers' | 'type' | 'close';
/** 'money': uses fewer voice minutes; 'accuracy': answers come out right. */
export type TipTag = 'money' | 'accuracy';

export type VoiceTip = {
  id: TipId;
  tag: TipTag;
  title: Record<TipsLang, string>;
  body: Record<TipsLang, string>;
};

/** Recording stops by itself after this much silence, once the person has spoken. */
export const AUTO_STOP_SECONDS = 4;

export const VOICE_TIPS: VoiceTip[] = [
  {
    id: 'label',
    tag: 'accuracy',
    title: { en: 'Say the field name, then the answer', ta: 'புலத்தின் பெயர், பிறகு பதில்' },
    body: {
      en: 'Several fields in one go is fine: “Name Saurav, mobile 98765 43210, district Erode”. Don’t say “My name is…”.',
      ta: 'ஒரே பதிவில் பல புலங்கள் சொல்லலாம்: “பெயர் சௌரவ், மொபைல் 98765 43210, மாவட்டம் ஈரோடு”. “என் பெயர்…” என்று சொல்ல வேண்டாம்.',
    },
  },
  {
    id: 'pace',
    tag: 'accuracy',
    title: {
      en: 'Not too slow, not too fast. Think first, then tap the mic.',
      ta: 'மிக மெதுவாகவும் வேண்டாம், மிக வேகமாகவும் வேண்டாம். யோசித்துவிட்டு மைக்கைத் தட்டுங்கள்.',
    },
    body: {
      en: 'No “hmm…”, “uh…” or “okay so…”. Speak like you are talking to the person at the counter.',
      ta: '“ம்ம்…”, “அ…” போன்ற சொற்கள் வேண்டாம். கவுண்டரில் உள்ளவரிடம் பேசுவது போல் பேசுங்கள்.',
    },
  },
  {
    id: 'stop',
    tag: 'money',
    title: { en: 'Tap Stop as soon as you finish', ta: 'முடிந்ததும் உடனே நிறுத்து தட்டவும்' },
    body: {
      en: `Pauses use minutes too. If you forget, it stops by itself after ${AUTO_STOP_SECONDS} seconds of silence.`,
      ta: `இடைவெளிகளுக்கும் நிமிடங்கள் செலவாகும். மறந்தாலும், ${AUTO_STOP_SECONDS} விநாடி அமைதிக்குப் பின் தானாக நிற்கும்.`,
    },
  },
  {
    id: 'numbers',
    tag: 'accuracy',
    title: { en: 'Numbers in small groups', ta: 'எண்களைச் சிறு குழுக்களாகச் சொல்லுங்கள்' },
    body: {
      en: 'Mobile in two groups of 5, Aadhaar in groups of 4. Dates as “15 August 1990”. For a choice list, say the option as it is shown.',
      ta: 'மொபைல் எண்ணை 5, 5 எண்களாக, ஆதாரை 4, 4 எண்களாக. தேதியை “15 ஆகஸ்ட் 1990” என்று. தேர்வுப் பட்டியலில், திரையில் உள்ளபடியே சொல்லுங்கள்.',
    },
  },
  {
    id: 'type',
    tag: 'money',
    title: { en: 'Fix one answer by typing', ta: 'ஒரு பதிலைத் திருத்த தட்டச்சு செய்யுங்கள்' },
    body: {
      en: 'Tap ✎ Type on that field; it uses no minutes. Don’t record the whole form again. Type emails and codes.',
      ta: 'அந்தப் புலத்தில் ✎ தட்டச்சு என்பதைத் தட்டவும்; நிமிடங்கள் செலவாகாது. முழுப் படிவத்தையும் மீண்டும் பதிவு செய்ய வேண்டாம். மின்னஞ்சல், குறியீடுகளைத் தட்டச்சு செய்யுங்கள்.',
    },
  },
  {
    id: 'close',
    tag: 'accuracy',
    title: { en: 'Phone close', ta: 'ஃபோன் அருகில், வாய் மைக்கை நோக்கி' },
    body: {
      en: 'Speak toward the mic at the bottom of the phone, a hand’s length away. No speakerphone, TV or fan noise. Tamil, English or both are fine.',
      ta: 'ஃபோனின் கீழே உள்ள மைக்கை நோக்கி, ஒரு கை தூரத்தில் பேசுங்கள். ஸ்பீக்கர், டிவி, மின்விசிறி சத்தம் வேண்டாம். தமிழ், ஆங்கிலம் அல்லது இரண்டும் கலந்து பேசலாம்.',
    },
  },
];

/** The words around the tips, in both languages. */
export const TIPS_TEXT = {
  en: {
    title: 'Voice tips',
    step: 'Tip {n} of {total}',
    skip: 'Skip',
    back: 'Back',
    next: 'Next',
    done: 'Done',
    close: 'Close',
    money: 'Saves minutes',
    accuracy: 'Better accuracy',
    free: 'Free',
    open: 'Voice tips',
  },
  ta: {
    title: 'குரல் குறிப்புகள்',
    step: 'குறிப்பு {n} / {total}',
    skip: 'தவிர்',
    back: 'பின்',
    next: 'அடுத்து',
    done: 'முடிந்தது',
    close: 'மூடு',
    money: 'நிமிடங்கள் மிச்சம்',
    accuracy: 'சரியான பதில்',
    free: 'இலவசம்',
    open: 'குரல் குறிப்புகள்',
  },
} satisfies Record<TipsLang, Record<string, string>>;

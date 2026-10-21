import type { FieldOption, SemanticType } from './schemas';

// ---------- Text & fuzzy matching ----------

/** Lowercase, strip Latin diacritics and punctuation, collapse whitespace. Keeps Tamil script. */
export function normalizeText(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ')
    .trim();
}

/**
 * Collapses common Tamil→Latin transliteration variants so that
 * Thiruvallur/Tiruvallur and Kancheepuram/Kanchipuram compare equal.
 */
export function phoneticKey(s: string): string {
  return normalizeText(s)
    .replace(/\s+/g, '')
    .replace(/th/g, 't')
    .replace(/dh/g, 'd')
    .replace(/zh/g, 'l')
    .replace(/sh/g, 's')
    .replace(/ph/g, 'f')
    .replace(/ck/g, 'k')
    .replace(/ee/g, 'i')
    .replace(/oo/g, 'u')
    .replace(/w/g, 'v')
    .replace(/(.)\1+/g, '$1');
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = cur;
  }
  return prev[b.length];
}

function similarity(a: string, b: string): number {
  const max = Math.max(a.length, b.length);
  return max === 0 ? 1 : 1 - levenshtein(a, b) / max;
}

/** 0..1 similarity between something spoken and a candidate label/value. */
export function fuzzyScore(spoken: string, candidate: string): number {
  const a = normalizeText(spoken);
  const b = normalizeText(candidate);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const pa = phoneticKey(a);
  const pb = phoneticKey(b);
  if (pa === pb) return 0.97;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (` ${long} `.includes(` ${short} `)) return 0.8 + 0.15 * (short.length / long.length);
  const ta = new Set(a.split(' '));
  const tb = new Set(b.split(' '));
  const inter = [...ta].filter((t) => tb.has(t)).length;
  const jaccard = inter / new Set([...ta, ...tb]).size;
  return Math.max(similarity(pa, pb) * 0.9, jaccard * 0.85);
}

/** Cross-language synonyms for common option labels. Keys are normalized English. */
const OPTION_SYNONYMS: Record<string, string[]> = {
  male: ['m', 'man', 'boy', 'aan', 'aaN', 'ஆண்', 'gents'],
  female: ['f', 'woman', 'girl', 'pen', 'penn', 'பெண்', 'ladies'],
  married: ['kalyanam aachu', 'kalyanam aagiduchu', 'thirumanam aanavar', 'திருமணமானவர்', 'திருமணம் ஆனது'],
  single: ['unmarried', 'kalyanam aagala', 'kalyanam aagalai', 'திருமணமாகாதவர்'],
  unmarried: ['single', 'kalyanam aagala', 'திருமணமாகாதவர்'],
  yes: ['aam', 'aama', 'aamam', 'ஆம்', 'sari', 'ok', 'y', 'true'],
  no: ['illa', 'illai', 'இல்லை', 'n', 'false'],
  india: ['bharat', 'இந்தியா', 'indiya'],
};

function synonymScore(spoken: string, candidate: string): number {
  const syns = OPTION_SYNONYMS[normalizeText(candidate)];
  if (!syns) return 0;
  const s = normalizeText(spoken);
  return syns.some((x) => normalizeText(x) === s) ? 0.95 : 0;
}

export type OptionMatch = {
  option: FieldOption | null;
  score: number;
  /** Score of the second-best option, to detect ambiguity. */
  runner_up: number;
  top: { option: FieldOption; score: number }[];
};

export function matchOption(spoken: string, options: FieldOption[]): OptionMatch {
  const scored = options
    .map((option) => ({
      option,
      score: Math.max(
        fuzzyScore(spoken, option.label),
        fuzzyScore(spoken, option.value),
        synonymScore(spoken, option.label),
        synonymScore(spoken, option.value),
      ),
    }))
    .sort((x, y) => y.score - x.score);
  return {
    option: scored[0]?.option ?? null,
    score: scored[0]?.score ?? 0,
    runner_up: scored[1]?.score ?? 0,
    top: scored.slice(0, 3),
  };
}

// ---------- Numbers ----------

const DIGIT_WORDS: Record<string, string> = {
  zero: '0', oh: '0', o: '0', nil: '0',
  one: '1', two: '2', three: '3', four: '4', five: '5',
  six: '6', seven: '7', eight: '8', nine: '9',
  // Tanglish
  poojyam: '0', pujyam: '0', onnu: '1', ondru: '1', rendu: '2', irandu: '2', moonu: '3',
  munu: '3', naalu: '4', nalu: '4', anju: '5', ainthu: '5', aaru: '6', ezhu: '7', elu: '7',
  ettu: '8', onbathu: '9', onbadhu: '9', ombodhu: '9', ombathu: '9',
  // Tamil script
  'பூஜ்ஜியம்': '0', 'சுழியம்': '0', 'ஒன்று': '1', 'ஒன்னு': '1', 'இரண்டு': '2', 'ரெண்டு': '2',
  'மூன்று': '3', 'மூணு': '3', 'நான்கு': '4', 'நாலு': '4', 'ஐந்து': '5', 'அஞ்சு': '5',
  'ஆறு': '6', 'ஏழு': '7', 'எட்டு': '8', 'ஒன்பது': '9',
};
const REPEAT_WORDS: Record<string, number> = { double: 2, triple: 3, 'டபுள்': 2, 'டிரிபிள்': 3 };

/** "nine eight double seven 1 2" → "987712". Unknown words are dropped. */
export function wordsToDigits(raw: string): string {
  const tokens = raw
    .toLowerCase()
    .replace(/[-,.]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  let out = '';
  let repeat = 1;
  for (const t of tokens) {
    if (REPEAT_WORDS[t]) {
      repeat = REPEAT_WORDS[t];
      continue;
    }
    let digits: string | undefined;
    if (/^\d+$/.test(t)) digits = t;
    else if (DIGIT_WORDS[t]) digits = DIGIT_WORDS[t];
    if (digits === undefined) continue;
    // "double 9" repeats the first digit, then appends the rest.
    out += digits[0].repeat(repeat) + digits.slice(1);
    repeat = 1;
  }
  return out;
}

export function normalizePhone(raw: string): string {
  let digits = /[a-z஀-௿]/i.test(raw) ? wordsToDigits(raw) : raw.replace(/\D/g, '');
  // Indian numbers: drop +91 / leading 0 when that leaves a 10-digit mobile.
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  return digits;
}

// ---------- Email ----------

export function normalizeEmail(raw: string): string {
  return ` ${raw.toLowerCase()} `
    .replace(/புள்ளி/g, ' dot ')
    .replace(/\s(at the rate of|at the rate|at sign|at)\s/g, '@')
    .replace(/\s(dot|period|point)\s/g, '.')
    .replace(/\s(underscore)\s/g, '_')
    .replace(/\s(hyphen|dash|minus)\s/g, '-')
    .replace(/\s+/g, '')
    .replace(/\.+$/, '');
}

// ---------- Dates ----------

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5,
  jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9,
  oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
  'ஜனவரி': 1, 'பிப்ரவரி': 2, 'மார்ச்': 3, 'ஏப்ரல்': 4, 'மே': 5, 'ஜூன்': 6,
  'ஜூலை': 7, 'ஆகஸ்ட்': 8, 'செப்டம்பர்': 9, 'அக்டோபர்': 10, 'நவம்பர்': 11, 'டிசம்பர்': 12,
};

function pad(n: number, w = 2): string {
  return String(n).padStart(w, '0');
}

function toIso(y: number, m: number, d: number): string | null {
  if (y < 100) y += y <= 30 ? 2000 : 1900;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${pad(y, 4)}-${pad(m)}-${pad(d)}`;
}

/** Parses many spoken/written date forms to YYYY-MM-DD. Numeric dates are read day-first. */
export function normalizeDate(raw: string, opts: { dayFirst?: boolean } = {}): string | null {
  const dayFirst = opts.dayFirst ?? true;
  const s = raw.trim().toLowerCase();

  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return toIso(+m[1], +m[2], +m[3]);

  m = s.match(/^(\d{1,2})[-/. ](\d{1,2})[-/. ](\d{2,4})$/);
  if (m) {
    const [a, b, y] = [+m[1], +m[2], +m[3]];
    return dayFirst ? toIso(y, b, a) : toIso(y, a, b);
  }

  const tokens = s.replace(/[,]/g, ' ').split(/\s+/).filter(Boolean);
  let month: number | undefined;
  let day: number | undefined;
  let year: number | undefined;
  for (const t of tokens) {
    const clean = t.replace(/(st|nd|rd|th)$/, '');
    if (MONTHS[t] !== undefined) month = MONTHS[t];
    else if (/^\d{4}$/.test(clean)) year = +clean;
    else if (/^\d{1,2}$/.test(clean) && day === undefined) day = +clean;
  }
  if (month && day && year) return toIso(year, month, day);
  return null;
}

/** Detects a date format like "DD/MM/YYYY" from a placeholder or pattern. */
export function detectDateFormat(hint: string | null | undefined): string | null {
  if (!hint) return null;
  const m = hint.match(/(dd|mm|yyyy|yy)[-/. ](dd|mm|yyyy|yy)[-/. ](dd|mm|yyyy|yy)/i);
  return m ? m[0] : null;
}

/** Formats an ISO date using a format like "dd/mm/yyyy". */
export function formatDate(iso: string, format: string): string {
  const [y, mo, d] = iso.split('-');
  return format
    .replace(/yyyy/i, y)
    .replace(/yy/i, y.slice(2))
    .replace(/mm/i, mo)
    .replace(/dd/i, d);
}

// ---------- Booleans ----------

const TRUE_WORDS = ['yes', 'true', '1', 'y', 'agree', 'agreed', 'checked', 'on', 'aam', 'aama', 'ஆம்', 'sari', 'ok', 'tick'];
const FALSE_WORDS = ['no', 'false', '0', 'n', 'disagree', 'unchecked', 'off', 'illa', 'illai', 'இல்லை', 'vendam', 'வேண்டாம்'];

export function normalizeBoolean(raw: string): 'true' | 'false' | null {
  const s = normalizeText(raw);
  if (TRUE_WORDS.includes(s)) return 'true';
  if (FALSE_WORDS.includes(s)) return 'false';
  return null;
}

// ---------- Per semantic type ----------

function titleCaseIfLower(s: string): string {
  if (s !== s.toLowerCase() || /[^\x00-\x7F]/.test(s)) return s;
  return s.replace(/\b\p{L}/gu, (c) => c.toUpperCase());
}

export function normalizeValue(semantic: SemanticType | null | undefined, raw: string): string {
  const v = raw.trim();
  switch (semantic) {
    case 'email':
      return normalizeEmail(v);
    case 'phone':
      return normalizePhone(v);
    case 'date':
    case 'date_of_birth':
      return normalizeDate(v) ?? v;
    case 'pincode':
    case 'aadhaar':
      return /[a-z஀-௿]/i.test(v) ? wordsToDigits(v) : v.replace(/\D/g, '');
    case 'number':
      return /[a-z஀-௿]/i.test(v) ? wordsToDigits(v) : v.replace(/[^\d.-]/g, '');
    case 'gst':
    case 'pan':
      return v.replace(/\s+/g, '').toUpperCase();
    case 'boolean':
      return normalizeBoolean(v) ?? v;
    case 'url':
      return v.toLowerCase().replace(/\s(dot)\s/g, '.').replace(/\s+/g, '');
    case 'full_name':
    case 'first_name':
    case 'last_name':
    case 'city':
    case 'district':
    case 'state':
    case 'country':
    case 'company':
      return titleCaseIfLower(v.replace(/\s+/g, ' '));
    default:
      return v.replace(/\s+/g, ' ');
  }
}

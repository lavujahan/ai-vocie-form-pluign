import type {
  AccountResponse,
  CreateSessionResponse,
  FieldOption,
  ResolveOptionResponse,
  FillReport,
  FormSchemaInput,
  HeldForm,
  PublicUser,
  SessionSnapshot,
} from '@vff/shared';

// ---------- service worker ⇄ content script ----------

/** "https://host:port" of a page. A session only fills the site it was scanned on. */
export function siteOf(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}`;
  } catch {
    return '';
  }
}

/** Skip reason when the session's tab has moved on to a different site. */
export const MOVED_REASON = 'This tab now shows a different site';

/** Skip reason for a value whose field isn't on the page (yet): it is filled when the field appears. */
export const NOT_ON_PAGE = "Waiting: this field isn't on the page yet";

export type ContentRequest =
  | { type: 'PING' }
  | { type: 'SCAN' }
  | {
      type: 'FILL';
      values: Record<string, string | null>;
      highlight?: boolean;
      /** child field_key → parent field_key (District → Taluk), from the Form Analyzer. */
      edges?: Record<string, string>;
      /** The site the form was scanned on; the page refuses to fill if it is now somewhere else. */
      site?: string;
    }
  | { type: 'UNDO' }
  /** Watch the page for fields that appear later (`known` = the session's field keys); `off` stops it. */
  | { type: 'WATCH'; known?: string[]; off?: boolean }
  /** Put a file from the phone into an upload field (base64: messages can't carry Blobs). */
  | { type: 'FILL_FILE'; field_key: string; name: string; mime: string; base64: string; site?: string }
  /** Empty the upload fields filled from the phone (Start over: phone and computer). */
  | { type: 'CLEAR_FILES' };

export type FileFillResult = { ok: true; needsUploadClick: boolean } | { ok: false; error: string };

export type ScanResult = { schema: FormSchemaInput };
export type FillResult = FillReport;
export type UndoResult = { restored: string[] };

// ---------- content script → service worker ----------

/** Ask the AI (via /api/resolve-option) which loaded option the speaker meant. */
export type ResolveOptionMessage = { type: 'RESOLVE_OPTION'; field_key: string; spoken: string; options: FieldOption[] };
export type ResolveOptionResult = ResolveOptionResponse | null;

/** Sent by the content script on every page load, so the worker knows if a form tab moved to another site. */
export type PageLoadedMessage = { type: 'PAGE_LOADED'; site: string };

/**
 * From the page watcher: fields that appeared since the session's scan (`schema.fields`, may be empty),
 * whether they are a new step of the form (`new_step`; else a choice revealed them), and every field
 * key on the page now (`present`): fields of a branch that was not chosen are hidden on the phone.
 */
export type FieldsChangedMessage = { type: 'FIELDS_CHANGED'; schema: FormSchemaInput; present: string[]; new_step?: boolean };

// ---------- popup ⇄ service worker ----------

/** Each tab has its own form session; `tab_id` is the tab the popup was opened on. */
export type PopupRequest = (
  | { type: 'GET_STATE' }
  /** Re-read the plan and voice minutes (the popup's minutes meter). */
  | { type: 'GET_ACCOUNT' }
  | { type: 'LOGIN'; phone: string; pin: string }
  | { type: 'LOGOUT' }
  /** `voice: false`: a typing-only form (the customer types on their phone; no mic, no voice minutes). */
  | { type: 'START_SESSION'; voice?: boolean }
  | { type: 'END_SESSION' }
  /** Turn voice on or off for this tab's form. */
  | { type: 'SET_VOICE'; voice: boolean }
  | { type: 'FILL' }
  | { type: 'UNDO' }
  /** Show the QR code again for this tab's form (the phone page was closed); answers are kept. */
  | { type: 'RECONNECT' }
  /** Carry on a form the customer sent in this tab (its own tab logged out or was closed). */
  | { type: 'RESUME_SESSION'; session_code: string }
  /** Delete a waiting form's answers now. */
  | { type: 'DISCARD_HELD'; session_code: string }
  /** Tamil typing: one piece of speech into text, in `PopupResponse.text` (base64: messages can't carry Blobs). */
  | { type: 'DICTATE'; base64: string; mime: string; duration_ms: number; part: number }
  /** Tamil typing in a window of its own: it stays open when the page is clicked, and Chrome can ask for the mic there. */
  | { type: 'OPEN_TAMIL_WINDOW' }
) & { tab_id?: number };

export type PopupResponse =
  | { ok: true; state: ExtState; text?: string }
  /** `code`: why the server refused, e.g. quota_exceeded. */
  | { ok: false; error: string; code?: string; state: ExtState };

/** chrome.storage.session key of the Tamil typing text: kept in this browser only, until sign out or Chrome closes. */
export const TAMIL_TEXT_KEY = 'vf-tamil-text';

export type ActiveSession = CreateSessionResponse & {
  tab_id: number;
  field_count: number;
  /** siteOf() the scanned page. */
  page_site: string;
  snapshot: SessionSnapshot | null;
  /** The QR code was shown again ("Connect phone again") for a form that already had a phone. */
  reconnect?: boolean;
  /** Carried on from a waiting form ("Use"): the customer may be far from the screen, or gone. */
  resumed?: boolean;
  /** The user allowed this site: the form's later pages (next step, reload) load the detector too. */
  site_access?: boolean;
  /** false: a typing-only form (set when scanning; the snapshot's session has the current value). */
  voice_enabled?: boolean;
};

/** The popup's view: the session of its own tab. */
export type ExtState = {
  auth: { user: PublicUser; expires_at: string } | null;
  /** The signed-in user's plan and voice minutes left; null until loaded. */
  account: AccountResponse | null;
  session: ActiveSession | null;
  /** The last forms customers sent that still wait, newest first. */
  held: HeldForm[];
  /**
   * Answers / uploads from the phone that came after the last "Fill form" (not on the page yet);
   * null before the first one. The page is only ever filled on "Fill form".
   */
  unfilledChanges: number | null;
  live: boolean;
  lastFill: FillReport | null;
  canUndo: boolean;
  /** Forms active in other tabs of this browser. */
  otherSessions: number;
  /** One-off message for this tab, e.g. "Phone started over". */
  notice: string | null;
  /** Upload fields filled from the phone whose page still needs its own "Upload" button clicked. */
  uploadClicks: string[];
};

export type StateMessage = { type: 'STATE'; state: ExtState };

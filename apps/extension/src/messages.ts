import type {
  CreateSessionResponse,
  FieldOption,
  ResolveOptionResponse,
  FillReport,
  FormSchemaInput,
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
  | { type: 'WATCH'; known?: string[]; off?: boolean };

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
 * From the page watcher: fields that appeared since the session's scan (`schema.fields`, may be empty)
 * and every field key on the page now (`present`), so waiting values can be filled.
 */
export type FieldsChangedMessage = { type: 'FIELDS_CHANGED'; schema: FormSchemaInput; present: string[] };

// ---------- popup ⇄ service worker ----------

/** Each tab has its own form session; `tab_id` is the tab the popup was opened on. */
export type PopupRequest = (
  | { type: 'GET_STATE' }
  | { type: 'LOGIN'; phone: string; pin: string }
  | { type: 'LOGOUT' }
  | { type: 'START_SESSION' }
  | { type: 'END_SESSION' }
  | { type: 'FILL' }
  | { type: 'UNDO' }
) & { tab_id?: number };

export type PopupResponse = { ok: true; state: ExtState } | { ok: false; error: string; state: ExtState };

export type ActiveSession = CreateSessionResponse & {
  tab_id: number;
  field_count: number;
  /** siteOf() the scanned page. */
  page_site: string;
  snapshot: SessionSnapshot | null;
};

/** The popup's view: the session of its own tab. */
export type ExtState = {
  auth: { user: PublicUser; expires_at: string } | null;
  session: ActiveSession | null;
  /** After "Fill form", new values are filled into the page as they arrive. */
  autoFill: boolean;
  live: boolean;
  lastFill: FillReport | null;
  canUndo: boolean;
  /** Forms active in other tabs of this browser. */
  otherSessions: number;
  /** One-off message for this tab, e.g. "Phone started over". */
  notice: string | null;
};

export type StateMessage = { type: 'STATE'; state: ExtState };

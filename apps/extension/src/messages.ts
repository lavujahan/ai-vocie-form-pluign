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
  | { type: 'UNDO' };

export type ScanResult = { schema: FormSchemaInput };
export type FillResult = FillReport;
export type UndoResult = { restored: string[] };

// ---------- content script → service worker ----------

/** Ask the AI (via /api/resolve-option) which loaded option the speaker meant. */
export type ResolveOptionMessage = { type: 'RESOLVE_OPTION'; field_key: string; spoken: string; options: FieldOption[] };
export type ResolveOptionResult = ResolveOptionResponse | null;

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
};

export type StateMessage = { type: 'STATE'; state: ExtState };

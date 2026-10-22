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

export type ContentRequest =
  | { type: 'PING' }
  | { type: 'SCAN' }
  | {
      type: 'FILL';
      values: Record<string, string | null>;
      highlight?: boolean;
      /** child field_key → parent field_key (District → Taluk), from the Form Analyzer. */
      edges?: Record<string, string>;
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

export type PopupRequest =
  | { type: 'GET_STATE' }
  | { type: 'LOGIN'; phone: string; pin: string }
  | { type: 'LOGOUT' }
  | { type: 'START_SESSION' }
  | { type: 'END_SESSION' }
  | { type: 'FILL' }
  | { type: 'UNDO' };

export type PopupResponse = { ok: true; state: ExtState } | { ok: false; error: string; state: ExtState };

export type ActiveSession = CreateSessionResponse & {
  tab_id: number;
  field_count: number;
  snapshot: SessionSnapshot | null;
};

export type ExtState = {
  auth: { user: PublicUser; expires_at: string } | null;
  session: ActiveSession | null;
  /** After "Fill form", new values are filled into the page as they arrive. */
  autoFill: boolean;
  live: boolean;
  lastFill: FillReport | null;
  canUndo: boolean;
};

export type StateMessage = { type: 'STATE'; state: ExtState };

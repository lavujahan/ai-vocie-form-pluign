import type {
  CreateSessionResponse,
  FillReport,
  FormSchemaInput,
  PublicUser,
  SessionSnapshot,
} from '@vff/shared';

// ---------- service worker ⇄ content script ----------

export type ContentRequest =
  | { type: 'PING' }
  | { type: 'SCAN' }
  | { type: 'FILL'; values: Record<string, string | null>; highlight?: boolean }
  | { type: 'UNDO' };

export type ScanResult = { schema: FormSchemaInput };
export type FillResult = FillReport;
export type UndoResult = { restored: string[] };

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

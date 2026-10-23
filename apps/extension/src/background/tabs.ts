import type { FillReport, SessionSnapshot } from '@vff/shared';
import type { ActiveSession } from '../messages';

/**
 * One form session per browser tab, so several forms (e.g. CAN registrations) can be filled at the
 * same time, each paired with its own phone. Pure helpers; the service worker persists the result.
 */

/** Active forms per browser at once. Each one keeps a Realtime channel open. */
export const MAX_TABS = 5;

/**
 * The page is filled only when the operator clicks "Fill form" (never by itself). `filledUpTo` is the
 * newest answer / upload time (server clock) at the last Fill form: anything newer is "not filled yet".
 */
export type TabState = {
  session: ActiveSession;
  filledUpTo?: number | null;
  lastFill: FillReport | null;
  canUndo: boolean;
  /** Where the tab is now: on the scanned form's site, or moved to another one (reported to the phone). */
  desktop?: 'open' | 'moved';
  /** One-off message for the popup, e.g. "Phone started over". */
  notice?: string | null;
  /** Upload fields filled from the phone whose page still needs its own "Upload" button clicked. */
  uploadClicks?: string[];
};
/** Keyed by tab id (a string once it has been through chrome.storage). */
export type Tabs = Record<string, TabState>;

/** Throws if a new form can't be started in `tabId` (rescanning a tab that already has one is fine). */
export function assertRoom(tabs: Tabs, tabId: number) {
  if (!tabs[tabId] && Object.keys(tabs).length >= MAX_TABS) {
    throw new Error(`${MAX_TABS} forms are already open in other tabs. Finish or close one first.`);
  }
}

/** Starts (or replaces) the form session of one tab. Other tabs are untouched. */
export function startTab(tabs: Tabs, tabId: number, session: ActiveSession): Tabs {
  assertRoom(tabs, tabId);
  return { ...tabs, [tabId]: { session, filledUpTo: null, lastFill: null, canUndo: false } };
}

export function endTab(tabs: Tabs, tabId: number): Tabs {
  if (!tabs[tabId]) return tabs;
  const { [tabId]: _gone, ...rest } = tabs;
  return rest;
}

/** Updates one tab's state; a no-op if that tab's session has ended meanwhile. */
export function patchTab(tabs: Tabs, tabId: number, patch: Partial<TabState>): Tabs {
  const t = tabs[tabId];
  return t ? { ...tabs, [tabId]: { ...t, ...patch } } : tabs;
}

/**
 * "Connect phone again": the tab's QR code is shown again until `expiresAt` (the phone page was closed),
 * with every answer kept. The popup then shows the QR above the fields instead of the first-scan screen.
 */
export function reopenQr(tabs: Tabs, tabId: number, expiresAt: string): Tabs {
  const t = tabs[tabId];
  if (!t) return tabs;
  const snap = t.session.snapshot;
  return patchTab(tabs, tabId, {
    session: {
      ...t.session,
      expires_at: expiresAt,
      reconnect: true,
      snapshot: snap && { ...snap, session: { ...snap.session, status: 'waiting', paired_at: null } },
    },
  });
}

export function tabOfSession(tabs: Tabs, sessionId: string): number | null {
  const hit = Object.entries(tabs).find(([, t]) => t.session.session_id === sessionId);
  return hit ? Number(hit[0]) : null;
}

export const otherSessions = (tabs: Tabs, tabId: number | undefined) =>
  Object.keys(tabs).filter((k) => tabId === undefined || Number(k) !== tabId).length;

/** Combines a partial re-fill (a few changed fields) with the previous full fill report. */
export function mergeFill(prev: FillReport | null, next: FillReport): FillReport {
  if (!prev) return next;
  const filled = new Set([...prev.filled, ...next.filled]);
  const skipped = [...prev.skipped.filter((s) => !next.filled.includes(s.field_key) && !next.skipped.some((n) => n.field_key === s.field_key)), ...next.skipped];
  return { filled: [...filled].filter((k) => !skipped.some((s) => s.field_key === k)), skipped };
}

const time = (iso: string | null | undefined) => (iso ? Date.parse(iso) || 0 : 0);

/** Newest answer / upload in the snapshot (server clock, ms): the watermark recorded at a Fill form. */
export function watermarkOf(snap: SessionSnapshot | null | undefined): number {
  if (!snap) return 0;
  return Math.max(0, ...snap.values.map((v) => time(v.updated_at)), ...(snap.files ?? []).map((f) => time(f.created_at)));
}

/**
 * Answers and uploads from the phone that arrived after the last Fill form (null before the first one):
 * changed or cleared values, and uploads not yet put into the page.
 */
export function changesSince(snap: SessionSnapshot | null | undefined, filledUpTo: number | null | undefined): number | null {
  if (!snap || !filledUpTo) return null;
  const resetSeq = snap.session.reset_seq ?? 0;
  // Answers emptied by the phone's Start over aren't "new": the page isn't changed for them.
  const values = snap.values.filter((v) => time(v.updated_at) > filledUpTo && !(v.value === null && v.source_seq <= resetSeq)).length;
  const files = (snap.files ?? []).filter((f) => f.status === 'uploaded').length;
  return values + files;
}

type Auth = { token: string; expires_at: string; user: { id: string } };

/**
 * Reads stored state, including older shapes: a single session (`{ session, … }`) and tabs with the
 * old `autoFill` flag (filling is now only ever on "Fill form").
 */
export function migrate<A extends Auth>(stored: unknown): { auth: A | null; tabs: Tabs } {
  const s = (stored ?? {}) as { auth?: A | null; tabs?: Tabs; session?: ActiveSession | null } & Partial<Omit<TabState, 'session'>>;
  const clean = (t: TabState & { autoFill?: unknown }): TabState => {
    const { autoFill: _old, ...rest } = t;
    return { filledUpTo: null, ...rest };
  };
  if (s.tabs) return { auth: s.auth ?? null, tabs: Object.fromEntries(Object.entries(s.tabs).map(([k, t]) => [k, clean(t)])) };
  const tabs: Tabs = {};
  if (s.session) {
    tabs[s.session.tab_id] = { session: s.session, filledUpTo: null, lastFill: s.lastFill ?? null, canUndo: !!s.canUndo };
  }
  return { auth: s.auth ?? null, tabs };
}

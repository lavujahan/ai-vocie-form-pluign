import type { FillReport } from '@vff/shared';
import type { ActiveSession } from '../messages';

/**
 * One form session per browser tab, so several forms (e.g. CAN registrations) can be filled at the
 * same time, each paired with its own phone. Pure helpers; the service worker persists the result.
 */

/** Active forms per browser at once. Each one keeps a Realtime channel open. */
export const MAX_TABS = 5;

export type TabState = {
  session: ActiveSession;
  /** After "Fill form", new values are filled into the page as they arrive. */
  autoFill: boolean;
  lastFill: FillReport | null;
  canUndo: boolean;
  /** Where the tab is now: on the scanned form's site, or moved to another one (reported to the phone). */
  desktop?: 'open' | 'moved';
  /** One-off message for the popup, e.g. "Phone started over". */
  notice?: string | null;
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
  return { ...tabs, [tabId]: { session, autoFill: false, lastFill: null, canUndo: false } };
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

type Auth = { token: string; expires_at: string; user: { id: string } };

/** Reads stored state, including the older single-session shape (`{ session, autoFill, … }`). */
export function migrate<A extends Auth>(stored: unknown): { auth: A | null; tabs: Tabs } {
  const s = (stored ?? {}) as { auth?: A | null; tabs?: Tabs; session?: ActiveSession | null } & Partial<Omit<TabState, 'session'>>;
  if (s.tabs) return { auth: s.auth ?? null, tabs: s.tabs };
  const tabs: Tabs = {};
  if (s.session) {
    tabs[s.session.tab_id] = { session: s.session, autoFill: !!s.autoFill, lastFill: s.lastFill ?? null, canUndo: !!s.canUndo };
  }
  return { auth: s.auth ?? null, tabs };
}

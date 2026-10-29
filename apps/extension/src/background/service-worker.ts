import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';
import type {
  AccountResponse,
  AddFieldsResponse,
  CreateSessionResponse,
  FieldFile,
  DesktopUpdateRequest,
  LoginResponse,
  PublicUser,
  ReconnectResponse,
  ResetScope,
  ResolveOptionResponse,
  UpdateFieldsRequest,
  SessionField,
  SessionInfo,
  SessionSnapshot,
  SessionValue,
  UtteranceRow,
} from '@vff/shared';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '../env';
import {
  MOVED_REASON,
  siteOf,
  type ActiveSession,
  type ContentRequest,
  type ExtState,
  type FieldsChangedMessage,
  type FileFillResult,
  type FillResult,
  type PageLoadedMessage,
  type PopupRequest,
  type PopupResponse,
  type ResolveOptionMessage,
  type ScanResult,
  type StateMessage,
  type UndoResult,
} from '../messages';
import contentScript from '../content/index.ts?script';
import { api, ApiError } from './api';
import {
  assertRoom,
  changesSince,
  endTab,
  hiddenFields,
  mergeFill,
  migrate,
  otherSessions,
  patchTab,
  reopenQr,
  startTab,
  tabOfSession,
  watermarkOf,
  type TabState,
  type Tabs,
} from './tabs';

// ---------- state (mirrored to chrome.storage.session so it survives worker restarts) ----------
// One form session per tab: several forms can be filled at once, each paired with its own phone.

type Auth = { token: string; expires_at: string; user: PublicUser };
type Persisted = { auth: Auth | null; tabs: Tabs };

let state: Persisted = { auth: null, tabs: {} };
/** The signed-in user's plan; fetched when a popup opens, after sign-in and when the server refuses for the plan. */
let account: AccountResponse | null = null;
/** Open popups, and the tab each one was opened on. */
const ports = new Map<chrome.runtime.Port, number | undefined>();

const ready = (async () => {
  state = migrate<Auth>((await chrome.storage.session.get('state')).state);
  if (state.auth && new Date(state.auth.expires_at) <= new Date()) state = { auth: null, tabs: {} };
  // Drop sessions whose tab was closed while the worker was not running.
  for (const id of Object.keys(state.tabs)) {
    const alive = await chrome.tabs.get(Number(id)).then(
      () => true,
      () => false,
    );
    if (!alive) state = { ...state, tabs: endTab(state.tabs, Number(id)) };
  }
  await ensureRealtime();
})();

const tabOf = (tabId: number | undefined): TabState | undefined => (tabId === undefined ? undefined : state.tabs[tabId]);

function publicState(tabId: number | undefined): ExtState {
  const t = tabOf(tabId);
  return {
    auth: state.auth ? { user: state.auth.user, expires_at: state.auth.expires_at } : null,
    account: state.auth ? account : null,
    session: t?.session ?? null,
    unfilledChanges: t ? changesSince(t.session.snapshot, t.filledUpTo) : null,
    live: !!t && !!channels.get(t.session.session_id)?.live,
    lastFill: t?.lastFill ?? null,
    canUndo: t?.canUndo ?? false,
    otherSessions: otherSessions(state.tabs, t ? tabId : undefined),
    notice: t?.notice ?? null,
    uploadClicks: t?.uploadClicks ?? [],
  };
}

async function save(patch: Partial<Persisted> = {}) {
  state = { ...state, ...patch };
  await chrome.storage.session.set({ state });
  broadcast();
  updateBadges();
}

/**
 * The page is only filled on "Fill form". The extension icon shows, per tab, how many answers from the
 * phone are not on the page yet: everything the phone sent before the first Fill form, then whatever
 * changed since the last one.
 */
function pendingCount(t: TabState): number {
  const snap = t.session.snapshot;
  if (!snap) return 0;
  const since = changesSince(snap, t.filledUpTo);
  if (since !== null) return since;
  if (snap.session.status !== 'filled') return 0; // the phone hasn't sent yet
  return Object.values(valuesForFill(snap)).filter(Boolean).length + (snap.files ?? []).filter((f) => f.status === 'uploaded').length;
}

let badgeColorSet = false;
function updateBadges() {
  if (!badgeColorSet) {
    badgeColorSet = true;
    void chrome.action.setBadgeBackgroundColor({ color: '#1e4e9c' }).catch(() => null);
  }
  for (const [id, t] of Object.entries(state.tabs)) {
    const n = pendingCount(t);
    void chrome.action.setBadgeText({ tabId: Number(id), text: n ? String(n) : '' }).catch(() => null);
  }
}

const setTab = (tabId: number, patch: Partial<TabState>) => save({ tabs: patchTab(state.tabs, tabId, patch) });

function broadcast() {
  for (const [port, tabId] of ports) port.postMessage({ type: 'STATE', state: publicState(tabId) } satisfies StateMessage);
}

async function logout() {
  // Phones of these forms stop sending (nothing would be filled any more).
  await Promise.all(Object.values(state.tabs).map((t) => reportDesktop(t.session, { state: 'closed' })));
  stopRealtime();
  account = null;
  await save({ auth: null, tabs: {} });
}

/** Reloads the plan and minutes left shown in the popup. Errors keep the last one. */
async function refreshAccount() {
  const auth = state.auth;
  if (!auth) return;
  try {
    const a = await api<AccountResponse>('/api/account', { token: auth.token });
    if (state.auth?.token !== auth.token) return; // signed out meanwhile
    account = a;
    broadcast();
  } catch {
    // offline, or an older server without /api/account
  }
}

/** Tells the phone where the form tab is ('open' / 'moved' / 'closed') and how the last full fill went. */
async function reportDesktop(s: ActiveSession, body: DesktopUpdateRequest) {
  if (!state.auth) return;
  try {
    await api(`/api/sessions/${s.session_code}/desktop`, { method: 'PATCH', body, token: state.auth.token });
  } catch (e) {
    console.warn('could not report the form tab state', e);
  }
}

/** Ends a tab's form session; its phone is told the tab was closed, so it stops sending. */
async function endTabSession(tabId: number) {
  const t = tabOf(tabId);
  if (!t) return;
  await save({ tabs: endTab(state.tabs, tabId) });
  await ensureRealtime();
  void chrome.tabs.sendMessage(tabId, { type: 'WATCH', off: true } satisfies ContentRequest).catch(() => null);
  await reportDesktop(t.session, { state: 'closed' });
}

/** Watches the form tab for fields that appear later (wizard steps, revealed fields, the form's next page). */
async function watchTab(tabId: number, known?: string[]) {
  const s = tabOf(tabId)?.session;
  if (!s) return;
  const keys = known ?? s.snapshot?.fields.map((f) => f.field_key) ?? [];
  await sendToTab(tabId, { type: 'WATCH', known: keys }).catch((e) => console.warn('could not watch the form tab', e));
}

const byPosition = (a: SessionField, b: SessionField) => a.position - b.position;
const withFields = (snap: SessionSnapshot, fields: SessionField[]): SessionSnapshot => ({
  ...snap,
  fields: [...snap.fields, ...fields.filter((f) => !snap.fields.some((x) => x.id === f.id))].sort(byPosition),
});

/**
 * The page watcher saw a change: new fields are added to the session (the phone shows them), as the
 * next step or, when a choice revealed them, in the step on the page. Then the phone is told which
 * fields a choice hides now (the other branch of the form). Values waiting for their field are filled
 * on the next "Fill form", like everything else.
 */
async function fieldsChanged(tabId: number, change: FieldsChangedMessage) {
  await ready;
  const t = tabOf(tabId);
  if (!t || !state.auth || (t.desktop ?? 'open') !== 'open') return;
  if (change.schema.fields.length) {
    try {
      const step = change.new_step === false ? 'same' : 'next';
      const res = await api<AddFieldsResponse>(`/api/sessions/${t.session.session_code}/fields?step=${step}`, {
        body: change.schema,
        token: state.auth.token,
      });
      if (res.fields.length) {
        patchSnapshot(tabId, (snap) => withFields(snap, res.fields));
        await save();
      }
    } catch (e) {
      console.warn('could not add the new fields', e);
    }
  }
  await reportHidden(tabId, change.present);
}

/** Tells the phone (and the popup) which fields a choice on the page hides now, when that changed. */
async function reportHidden(tabId: number, present: string[]) {
  const s = tabOf(tabId)?.session;
  if (!s?.snapshot || !state.auth) return;
  const hidden = hiddenFields(s.snapshot.fields, present);
  const before = [...(s.snapshot.session.hidden_fields ?? [])].sort();
  if (hidden.join('\u0001') === before.join('\u0001')) return;
  patchSnapshot(tabId, (snap) => ({ ...snap, session: { ...snap.session, hidden_fields: hidden } }));
  await save();
  await reportDesktop(s, { hidden });
}

// ---------- content script ----------

/**
 * The form detector runs on no website by default. When the user scans a form and allows the site (the
 * popup asks Chrome for it), it is registered for that site only, so the form's later pages (next step,
 * reload) load it too. Without that permission it is injected into the scanned tab once (activeTab).
 */
const siteScriptId = (origin: string) => `vff-site:${origin}`;

async function ensureSiteScript(origin: string): Promise<boolean> {
  if (!/^https?:/.test(origin)) return false;
  const allowed = await chrome.permissions.contains({ origins: [`${origin}/*`] }).catch(() => false);
  if (!allowed) return false;
  const id = siteScriptId(origin);
  const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [id] }).catch(() => []);
  if (!existing.length) {
    await chrome.scripting.registerContentScripts([
      { id, matches: [`${origin}/*`], js: [contentScript], runAt: 'document_idle', persistAcrossSessions: true },
    ]);
  }
  return true;
}

// Access to a site removed in Chrome's settings: stop loading the detector there.
chrome.permissions.onRemoved.addListener(({ origins }) => {
  const ids = (origins ?? []).map((o) => siteScriptId(o.replace(/\/\*$/, '')));
  if (ids.length) void chrome.scripting.unregisterContentScripts({ ids }).catch(() => null);
});

async function sendToTab<T>(tabId: number, msg: ContentRequest): Promise<T> {
  try {
    return (await chrome.tabs.sendMessage(tabId, msg)) as T;
  } catch {
    // No detector in the tab yet (first scan, or the page was open before access was allowed): inject it.
    await chrome.scripting.executeScript({ target: { tabId }, files: [contentScript] });
    await new Promise((r) => setTimeout(r, 150));
    return (await chrome.tabs.sendMessage(tabId, msg)) as T;
  }
}

async function activeTabId(): Promise<number | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab?.id;
}

// ---------- snapshot helpers ----------

const fieldKeyById = (snap: SessionSnapshot) => new Map(snap.fields.map((f) => [f.id, f.field_key]));

function valuesForFill(snap: SessionSnapshot, only?: string[]): Record<string, string | null> {
  const keys = fieldKeyById(snap);
  const out: Record<string, string | null> = {};
  const resetSeq = snap.session.reset_seq ?? 0;
  for (const v of snap.values) {
    // Emptied by the phone's Start over: not typed into the page (Start over clears it itself, if asked to).
    if (v.value === null && v.source_seq <= resetSeq) continue;
    const key = keys.get(v.field_id);
    if (key && (!only || only.includes(key))) out[key] = v.value;
  }
  return out;
}

/**
 * After a fill: "choose on your phone" hints for dropdowns the spoken value couldn't be matched to.
 * Options that loaded on the page are not sent: the form's field list stays as it was first saved, so
 * the AI's prompt for this form starts with the same text every time (and is billed at the cached price).
 */
async function reportDropdowns(s: ActiveSession, report: FillResult) {
  if (!s.snapshot || !state.auth) return;
  const byKey = new Map(s.snapshot.fields.map((f) => [f.field_key, f]));
  const updates = new Map<string, UpdateFieldsRequest['fields'][number]>();
  const upd = (k: string) => updates.get(k) ?? updates.set(k, { field_key: k }).get(k)!;
  for (const u of report.unresolved ?? []) upd(u.field_key).choice_hint = { spoken: u.spoken, top: u.top, reason: u.reason };
  for (const k of report.filled) if (byKey.get(k)?.choice_hint) upd(k).choice_hint = null;
  if (!updates.size) return;
  try {
    await api(`/api/sessions/${s.session_code}/fields`, {
      method: 'PATCH',
      body: { fields: [...updates.values()] } satisfies UpdateFieldsRequest,
      token: state.auth.token,
    });
  } catch (e) {
    console.warn('could not report dropdowns', e);
  }
}

async function fillIntoPage(tabId: number, only?: string[]) {
  const s = tabOf(tabId)?.session;
  if (!s?.snapshot) return;
  const values = valuesForFill(s.snapshot, only);
  if (!Object.keys(values).length) return;
  // Parent links from the Form Analyzer (District → Taluk) so dropdowns fill in order.
  const edges = Object.fromEntries(s.snapshot.fields.filter((f) => f.depends_on).map((f) => [f.field_key, f.depends_on!]));
  try {
    const report = await sendToTab<FillResult>(tabId, { type: 'FILL', values, highlight: true, edges, site: s.page_site });
    const moved = !report.filled.length && report.skipped.some((x) => x.reason === MOVED_REASON);
    const lastFill = only ? mergeFill(tabOf(tabId)?.lastFill ?? null, report) : report;
    // Moved to another site: stop auto-filling there until the user scans again.
    await setTab(
      tabId,
      moved ? { lastFill, canUndo: false, desktop: 'moved', notice: null } : { lastFill, canUndo: true, notice: null },
    );
    if (moved) await reportDesktop(s, { state: 'moved' });
    else await reportDropdowns(s, report);
    // A full fill (Send to desktop / Fill form): the phone shows "Filled on computer ✓ 14/16".
    if (!only && !moved) {
      await reportDesktop(s, {
        report: { filled: report.filled.length, skipped: report.skipped.length, total: Object.keys(values).length },
      });
    }
  } catch (e) {
    console.warn('fill failed', e);
    await setTab(tabId, {
      lastFill: { filled: [], skipped: Object.keys(values).map((k) => ({ field_key: k, reason: 'The form tab was closed or reloaded' })) },
    });
    if (!only) await reportDesktop(s, { report: { filled: 0, skipped: Object.keys(values).length, total: Object.keys(values).length } });
  }
}

const filesInFlight = new Set<string>();

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/**
 * Puts photos / PDFs uploaded from the phone into the page's upload fields: a 60-second link from the
 * API, the bytes, then the page. The server deletes its copy once told the result ('filled', or
 * 'rejected' with the website's own message, which the phone shows).
 */
async function fillFiles(tabId: number, only?: string[]) {
  const s = tabOf(tabId)?.session;
  if (!s?.snapshot || !state.auth) return;
  const keyById = fieldKeyById(s.snapshot);
  const pending = (s.snapshot.files ?? []).filter((f) => f.status === 'uploaded' && (!only || only.includes(f.id)) && !filesInFlight.has(f.id));
  for (const f of pending) {
    const key = keyById.get(f.field_id);
    if (!key) continue;
    filesInFlight.add(f.id);
    let result: FileFillResult;
    try {
      const link = await api<{ url: string; file_name: string; mime: string }>(`/api/sessions/${s.session_code}/files/${f.id}`, {
        token: state.auth.token,
      });
      const res = await fetch(link.url);
      if (!res.ok) throw new Error(`download ${res.status}`);
      result = await sendToTab<FileFillResult>(tabId, {
        type: 'FILL_FILE',
        field_key: key,
        name: link.file_name,
        mime: link.mime,
        base64: toBase64(await res.arrayBuffer()),
        site: s.page_site,
      });
    } catch (e) {
      console.warn('file fill failed', e);
      filesInFlight.delete(f.id);
      continue; // tried again on the next fill / refresh
    }
    try {
      await api(`/api/sessions/${s.session_code}/files/${f.id}`, {
        method: 'PATCH',
        body: result.ok ? { status: 'filled', reason: null } : { status: 'rejected', reason: result.error },
        token: state.auth!.token,
      });
    } catch (e) {
      console.warn('could not report the file result', e);
    }
    const t = tabOf(tabId);
    if (t) {
      const clicks = new Set(t.uploadClicks ?? []);
      if (result.ok && result.needsUploadClick) clicks.add(key);
      else clicks.delete(key);
      const lastFill = t.lastFill ?? { filled: [], skipped: [] };
      await setTab(tabId, {
        uploadClicks: [...clicks],
        canUndo: true,
        lastFill: {
          ...lastFill,
          filled: result.ok ? [...new Set([...lastFill.filled, key])] : lastFill.filled.filter((k) => k !== key),
          skipped: [...lastFill.skipped.filter((x) => x.field_key !== key), ...(result.ok ? [] : [{ field_key: key, reason: result.error }])],
        },
      });
    }
    filesInFlight.delete(f.id);
  }
}

/**
 * The phone pressed Start over. Auto-fill stops (the cleared values must not blank the page). For
 * scope 'both' the form on the computer is cleared too: Undo restores the page as it was before the
 * fill; if there is nothing to undo (the page reloaded since), the fields filled earlier are emptied.
 */
async function phoneReset(tabId: number, scope: ResetScope | null, before: SessionSnapshot | null) {
  const t = tabOf(tabId);
  if (!t) return;
  const filledBefore =
    t.lastFill?.filled ??
    (before
      ? Object.entries(valuesForFill(before))
          .filter(([, v]) => v)
          .map(([k]) => k)
      : []);
  await setTab(tabId, {
    lastFill: null,
    canUndo: false,
    notice: scope === 'both' ? 'The phone cleared this form. Ready for the next applicant.' : 'The phone started over. The form here was left as it is.',
  });
  if (scope !== 'both') return;
  await setTab(tabId, { uploadClicks: [] });
  await sendToTab(tabId, { type: 'CLEAR_FILES' }).catch(() => null);
  const undone = await sendToTab<UndoResult>(tabId, { type: 'UNDO' }).catch(() => null);
  if (undone?.restored?.length || !filledBefore.length) return;
  const empty = Object.fromEntries(filledBefore.map((k) => [k, null]));
  await sendToTab(tabId, { type: 'FILL', values: empty, site: t.session.page_site }).catch(() => null);
}

// ---------- Realtime: one socket, one channel per tab session ----------

type Channel = { channel: RealtimeChannel; live: boolean };
let rt: { client: SupabaseClient; token: string; authed: Promise<void> } | null = null;
const channels = new Map<string, Channel>();

async function refreshSnapshot(tabId: number) {
  const s = tabOf(tabId)?.session;
  if (!s || !state.auth) return;
  try {
    const snap = await api<SessionSnapshot>(`/api/sessions/${s.session_code}`, { token: state.auth.token });
    const cur = tabOf(tabId)?.session;
    if (cur?.session_id !== s.session_id) return; // ended or rescanned meanwhile
    const before = cur.snapshot;
    await setTab(tabId, { session: { ...cur, form_name: snap.session.form_name, snapshot: snap } });
    // The phone pressed Start over while we weren't listening.
    if (before && (snap.session.reset_seq ?? 0) > (before.session.reset_seq ?? 0)) {
      await phoneReset(tabId, snap.session.reset_scope, before);
      return;
    }
    // The phone pressed "Send to desktop" while we weren't listening.
    if (snap.session.status === 'filled' && before?.session.status !== 'filled') {
      await sentFromPhone(tabId);
      return;
    }
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) await logout();
    // Purged on the server (sessions live about 40 minutes): this tab has nothing to fill any more.
    else if (e instanceof ApiError && e.status === 404 && tabOf(tabId)?.session.session_id === s.session_id) {
      await save({ tabs: endTab(state.tabs, tabId) });
      await ensureRealtime();
    }
  }
}

/**
 * "Send to desktop" on the phone: the popup shows the answers and asks the operator to fill. The page
 * itself is only ever filled by "Fill form" (the operator decides when the website changes).
 */
async function sentFromPhone(tabId: number) {
  await setTab(tabId, { notice: 'The phone sent the form. Click “Fill form” to fill the page.' });
}

/** "Fill form": everything the phone has sent goes into the page now (answers and uploads). */
async function fillNow(tabId: number) {
  const snap = tabOf(tabId)?.session.snapshot;
  // Anything newer than this arrives after the click and counts as "not filled yet".
  await setTab(tabId, { filledUpTo: watermarkOf(snap) || Date.now(), notice: null });
  await fillIntoPage(tabId);
  await fillFiles(tabId);
}

function patchSnapshot(tabId: number, fn: (snap: SessionSnapshot) => SessionSnapshot) {
  const s = tabOf(tabId)?.session;
  if (!s?.snapshot) return null;
  const snapshot = fn(s.snapshot);
  state = { ...state, tabs: patchTab(state.tabs, tabId, { session: { ...s, snapshot, form_name: snapshot.session.form_name || s.form_name } }) };
  return snapshot;
}

function realtimeClient(token: string) {
  if (rt?.token === token) return rt;
  stopRealtime();
  const client = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
    accessToken: async () => state.auth?.token ?? null,
    // Websocket traffic every 20s keeps the MV3 service worker alive (Chrome 116+).
    realtime: { heartbeatIntervalMs: 20_000 },
  });
  // Put the token on the socket before joining. Otherwise the join races the async accessToken
  // callback, Realtime stores the subscription as `anon`, and RLS silently drops every event.
  const authed = client.realtime.setAuth(token).catch((e) => console.warn('realtime auth failed', e));
  rt = { client, token, authed };
  return rt;
}

/** Subscribes every tab session that has no channel yet, and drops channels of ended sessions. */
async function ensureRealtime() {
  const wanted = new Set(Object.values(state.tabs).map((t) => t.session.session_id));
  if (!state.auth || !SUPABASE_URL || !SUPABASE_ANON_KEY || !wanted.size) return stopRealtime();
  const r = realtimeClient(state.auth.token);
  for (const [id, c] of channels) {
    if (wanted.has(id)) continue;
    channels.delete(id);
    void r.client.removeChannel(c.channel);
  }
  for (const id of wanted) if (!channels.has(id)) subscribe(r, id);
}

function subscribe(r: NonNullable<typeof rt>, sessionId: string) {
  const filter = `session_id=eq.${sessionId}`;
  /** The tab this session belongs to (looked up per event: the tab may have been rescanned). */
  const tab = () => tabOfSession(state.tabs, sessionId);

  const channel = r.client
    .channel(`ext:${sessionId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'field_values', filter }, async (p) => {
      const row = p.new as SessionValue | undefined;
      const tabId = tab();
      if (!row?.field_id || tabId === null) return;
      const snap = patchSnapshot(tabId, (snap) => {
        const cur = snap.values.find((v) => v.field_id === row.field_id);
        if (cur && cur.source_seq > row.source_seq) return snap;
        return { ...snap, values: [...snap.values.filter((v) => v.field_id !== row.field_id), row] };
      });
      // The popup shows it; the page gets it on the next "Fill form".
      if (snap) await save();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'utterances', filter }, async (p) => {
      const row = p.new as UtteranceRow | undefined;
      const tabId = tab();
      if (!row?.seq || tabId === null) return;
      patchSnapshot(tabId, (snap) => ({
        ...snap,
        utterances: [row, ...snap.utterances.filter((u) => u.seq !== row.seq)].sort((a, b) => b.seq - a.seq).slice(0, 50),
      }));
      await save();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'field_files', filter }, async (p) => {
      const tabId = tab();
      if (tabId === null) return;
      const row = p.new as (FieldFile & { path?: string }) | undefined;
      const gone = p.old as { id?: string } | undefined;
      patchSnapshot(tabId, (snap) => {
        const files = (snap.files ?? []).filter((f) => f.id !== (row?.id ?? gone?.id));
        if (row?.id) {
          const { path: _p, ...file } = row;
          files.push(file);
        }
        return { ...snap, files };
      });
      // A new photo / PDF from the phone: shown in the popup, put into the page on the next "Fill form".
      await save();
    })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'form_fields', filter }, async (p) => {
      const row = p.new as SessionField & { clean_label: string | null };
      const tabId = tab();
      if (tabId === null || !row?.id) return;
      const field: SessionField = {
        id: row.id,
        field_key: row.field_key,
        label: row.clean_label || row.label,
        field_type: row.field_type,
        required: row.required,
        options: row.options ?? [],
        multiple: row.multiple,
        semantic_type: row.semantic_type ?? null,
        step_index: row.step_index,
        position: row.position,
        depends_on: row.depends_on ?? null,
        dynamic_options: row.dynamic_options ?? false,
        choice_hint: row.choice_hint ?? null,
      };
      patchSnapshot(tabId, (snap) => withFields(snap, [field]));
      await save();
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'form_fields', filter }, async (p) => {
      const row = p.new as SessionField & { clean_label: string | null; label: string };
      const tabId = tab();
      if (tabId === null) return;
      patchSnapshot(tabId, (snap) => ({
        ...snap,
        fields: snap.fields.map((f) =>
          f.id === row.id ? { ...f, label: row.clean_label || row.label || f.label, required: row.required, semantic_type: row.semantic_type } : f,
        ),
      }));
      await save();
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'form_sessions', filter: `id=eq.${sessionId}` }, async (p) => {
      const row = p.new as SessionInfo;
      const tabId = tab();
      if (tabId === null) return;
      const before = tabOf(tabId)?.session.snapshot ?? null;
      const wasFilled = before?.session.status === 'filled';
      const wasReset = before?.session.reset_seq ?? 0;
      patchSnapshot(tabId, (snap) => ({
        ...snap,
        session: {
          ...snap.session,
          form_name: row.form_name,
          status: row.status,
          reset_seq: row.reset_seq ?? snap.session.reset_seq,
          reset_scope: row.reset_scope ?? snap.session.reset_scope,
          desktop_state: row.desktop_state ?? snap.session.desktop_state,
          desktop_report: row.desktop_report ?? snap.session.desktop_report,
          hidden_fields: row.hidden_fields ?? snap.session.hidden_fields,
          voice_enabled: row.voice_enabled ?? snap.session.voice_enabled,
        },
      }));
      await save();
      // The session update of a Start over arrives before its cleared values (one transaction, in order).
      if ((row.reset_seq ?? 0) > wasReset) await phoneReset(tabId, row.reset_scope, before);
      else if (row.status === 'filled' && !wasFilled) await sentFromPhone(tabId);
    });

  const entry: Channel = { channel, live: false };
  channels.set(sessionId, entry);
  void r.authed.then(() => {
    if (channels.get(sessionId) !== entry) return; // ended or stopped meanwhile
    channel.subscribe(async (status) => {
      entry.live = status === 'SUBSCRIBED';
      broadcast();
      const tabId = tab();
      if (entry.live && tabId !== null) await refreshSnapshot(tabId);
    });
  });
}

function stopRealtime() {
  channels.clear();
  if (!rt) return;
  void rt.client.removeAllChannels();
  rt = null;
}

// ---------- popup requests ----------

async function handle(req: PopupRequest, tabId: number | undefined): Promise<void> {
  switch (req.type) {
    case 'GET_STATE':
      await ensureRealtime();
      // Fallback while Realtime is down: the popup polls and we fetch a fresh snapshot.
      if (tabId !== undefined && tabOf(tabId) && !channels.get(tabOf(tabId)!.session.session_id)?.live) await refreshSnapshot(tabId);
      return;

    case 'GET_ACCOUNT':
      await refreshAccount();
      return;

    case 'LOGIN': {
      const r = await api<LoginResponse>('/api/auth/login', { body: { phone: req.phone, pin: req.pin } });
      account = null;
      await save({ auth: { token: r.token, expires_at: r.expires_at, user: r.user } });
      await ensureRealtime();
      await refreshAccount();
      return;
    }

    case 'LOGOUT':
      await logout();
      return;

    case 'START_SESSION': {
      if (!state.auth) throw new Error('Please sign in');
      const tab = tabId === undefined ? null : await chrome.tabs.get(tabId).catch(() => null);
      if (!tab?.id || !/^(https?|file):/.test(tab.url ?? '')) throw new Error('Open a web page with a form first');
      assertRoom(state.tabs, tab.id);
      const siteAccess = await ensureSiteScript(siteOf(tab.url ?? '')).catch(() => false);
      let scan: ScanResult;
      try {
        scan = await sendToTab<ScanResult>(tab.id, { type: 'SCAN' });
      } catch {
        throw new Error("Can't read this page. Reload it and try again.");
      }
      if (!scan?.schema?.fields?.length) throw new Error('No form fields found on this page');
      // Typing only: the customer's phone shows no mic and the server refuses recordings.
      const voice = req.voice !== false;
      const created = await api<CreateSessionResponse>(`/api/sessions${voice ? '' : '?voice=0'}`, { body: scan.schema, token: state.auth.token });
      // Only this tab's session is replaced (its phone is told it ended); forms in other tabs keep going.
      const previous = tabOf(tab.id)?.session;
      const session: ActiveSession = {
        ...created,
        tab_id: tab.id,
        field_count: scan.schema.fields.length,
        page_site: siteOf(scan.schema.page_url),
        snapshot: null,
        site_access: siteAccess,
        voice_enabled: voice,
      };
      await save({ tabs: startTab(state.tabs, tab.id, session) });
      await ensureRealtime();
      if (previous) void reportDesktop(previous, { state: 'closed' });
      await refreshSnapshot(tab.id);
      void watchTab(tab.id, scan.schema.fields.map((f) => f.field_key));
      return;
    }

    case 'SET_VOICE': {
      const s = tabId === undefined ? null : tabOf(tabId)?.session;
      if (tabId === undefined || !s) return;
      if (!state.auth) throw new Error('Please sign in');
      await api(`/api/sessions/${s.session_code}/desktop`, { method: 'PATCH', body: { voice: req.voice }, token: state.auth.token });
      // The phone gets it through Realtime; the popup shows it now.
      patchSnapshot(tabId, (snap) => ({ ...snap, session: { ...snap.session, voice_enabled: req.voice } }));
      await setTab(tabId, { session: { ...tabOf(tabId)!.session, voice_enabled: req.voice } });
      return;
    }

    case 'END_SESSION':
      if (tabId !== undefined) await endTabSession(tabId);
      await ensureRealtime();
      return;

    case 'FILL':
      if (tabId === undefined || !tabOf(tabId)) return;
      await fillNow(tabId);
      return;

    case 'UNDO': {
      if (tabId === undefined || !tabOf(tabId)) return;
      await sendToTab(tabId, { type: 'UNDO' }).catch(() => null);
      await setTab(tabId, { canUndo: false, lastFill: null });
      return;
    }

    case 'RECONNECT': {
      const s = tabId === undefined ? null : tabOf(tabId)?.session;
      if (tabId === undefined || !s) return;
      if (!state.auth) throw new Error('Please sign in');
      const res = await api<ReconnectResponse>(`/api/sessions/${s.session_code}/reconnect`, { method: 'POST', token: state.auth.token });
      await save({ tabs: reopenQr(state.tabs, tabId, res.expires_at) });
      return;
    }
  }
}

chrome.runtime.onMessage.addListener((req: PopupRequest | ResolveOptionMessage | PageLoadedMessage | FieldsChangedMessage, sender, sendResponse) => {
  if (sender.tab && req.type === 'PAGE_LOADED') {
    if (sender.frameId === 0 && sender.tab.id !== undefined) void pageLoaded(sender.tab.id, req.site);
    return false;
  }
  if (sender.tab && req.type === 'FIELDS_CHANGED') {
    if (sender.tab.id !== undefined) void fieldsChanged(sender.tab.id, req);
    return false;
  }
  // From the content script: which loaded dropdown option did the speaker mean? (AI, server-side)
  if (sender.tab) {
    if (req.type !== 'RESOLVE_OPTION') return false;
    (async () => {
      await ready;
      const s = tabOf(sender.tab?.id)?.session;
      if (!s || !state.auth) return null;
      try {
        return await api<ResolveOptionResponse>('/api/resolve-option', {
          body: { session_code: s.session_code, field_key: req.field_key, spoken: req.spoken, options: req.options },
          token: state.auth.token,
        });
      } catch {
        return null;
      }
    })().then(sendResponse);
    return true;
  }
  if (req.type === 'RESOLVE_OPTION' || req.type === 'PAGE_LOADED' || req.type === 'FIELDS_CHANGED') return false;
  (async () => {
    await ready;
    const tabId = req.tab_id ?? (await activeTabId());
    try {
      await handle(req, tabId);
      return { ok: true, state: publicState(tabId) } satisfies PopupResponse;
    } catch (e) {
      if (e instanceof ApiError && e.status === 401 && req.type !== 'LOGIN') await logout();
      // Plan ended or minutes used up: the popup shows it from the refreshed plan.
      if (e instanceof ApiError && e.status === 402) await refreshAccount();
      const error =
        e instanceof ApiError && e.body.attempts_left !== undefined
          ? `${e.message}. ${e.body.attempts_left} ${e.body.attempts_left === 1 ? 'try' : 'tries'} left.`
          : (e as Error).message;
      return { ok: false, error, state: publicState(tabId) } satisfies PopupResponse;
    }
  })().then(sendResponse);
  return true;
});

chrome.runtime.onConnect.addListener((port) => {
  // Named "popup:<tabId>" by the popup, so each popup gets the state of its own tab.
  if (!port.name.startsWith('popup')) return;
  const id = Number(port.name.split(':')[1]);
  const tabId = Number.isInteger(id) && id > 0 ? id : undefined;
  ports.set(port, tabId);
  port.onDisconnect.addListener(() => ports.delete(port));
  ready.then(async () => {
    await ensureRealtime();
    port.postMessage({ type: 'STATE', state: publicState(tabId) } satisfies StateMessage);
    void refreshAccount();
    // Opening the popup always shows the latest values, even if a live event was missed.
    if (tabId !== undefined) await refreshSnapshot(tabId);
  });
});

/**
 * A page finished loading in a tab. If that tab holds a form session: another site means the phone
 * is told the form tab moved (it stops sending); back on the form's site, it can send again.
 */
async function pageLoaded(tabId: number, site: string) {
  await ready;
  const t = tabOf(tabId);
  if (!t) return;
  const where = site === t.session.page_site ? 'open' : 'moved';
  // Same site (the form's next page, or a postback): watch the new page for its fields.
  if (where === 'open') void watchTab(tabId);
  if (where === (t.desktop ?? 'open')) return;
  await setTab(tabId, where === 'moved' ? { desktop: where, canUndo: false } : { desktop: where });
  await reportDesktop(t.session, { state: where });
}

// A form tab closed: its session can't fill anything any more, and its phone shows "Tab closed".
// Other tabs are unaffected.
chrome.tabs.onRemoved.addListener(async (tabId) => {
  await ready;
  await endTabSession(tabId);
});

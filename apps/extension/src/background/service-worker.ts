import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';
import type {
  CreateSessionResponse,
  FillReport,
  LoginResponse,
  PublicUser,
  SessionField,
  SessionInfo,
  SessionSnapshot,
  SessionValue,
  UtteranceRow,
} from '@vff/shared';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '../env';
import type {
  ActiveSession,
  ContentRequest,
  ExtState,
  FillResult,
  PopupRequest,
  PopupResponse,
  ScanResult,
  StateMessage,
} from '../messages';
import { api, ApiError } from './api';

// ---------- state (mirrored to chrome.storage.session so it survives worker restarts) ----------

type Auth = { token: string; expires_at: string; user: PublicUser };
type Persisted = { auth: Auth | null; session: ActiveSession | null; autoFill: boolean; lastFill: FillReport | null; canUndo: boolean };

let state: Persisted = { auth: null, session: null, autoFill: false, lastFill: null, canUndo: false };
let live = false;
const ports = new Set<chrome.runtime.Port>();

const ready = (async () => {
  const stored = (await chrome.storage.session.get('state')).state as Persisted | undefined;
  if (stored) state = stored;
  if (state.auth && new Date(state.auth.expires_at) <= new Date()) state = { ...state, auth: null, session: null };
  await ensureRealtime();
})();

function publicState(): ExtState {
  return {
    auth: state.auth ? { user: state.auth.user, expires_at: state.auth.expires_at } : null,
    session: state.session,
    autoFill: state.autoFill,
    live,
    lastFill: state.lastFill,
    canUndo: state.canUndo,
  };
}

async function commit(patch: Partial<Persisted> = {}) {
  state = { ...state, ...patch };
  await chrome.storage.session.set({ state });
  broadcast();
}

function broadcast() {
  const msg: StateMessage = { type: 'STATE', state: publicState() };
  for (const p of ports) p.postMessage(msg);
}

// ---------- content script ----------

async function sendToTab<T>(tabId: number, msg: ContentRequest): Promise<T> {
  try {
    return (await chrome.tabs.sendMessage(tabId, msg)) as T;
  } catch {
    // Tab was open before the extension loaded: inject the content script, then retry.
    const file = chrome.runtime.getManifest().content_scripts?.[0]?.js?.[0];
    if (!file) throw new Error('Content script missing from manifest');
    await chrome.scripting.executeScript({ target: { tabId }, files: [file] });
    await new Promise((r) => setTimeout(r, 150));
    return (await chrome.tabs.sendMessage(tabId, msg)) as T;
  }
}

// ---------- snapshot helpers ----------

const fieldKeyById = (snap: SessionSnapshot) => new Map(snap.fields.map((f) => [f.id, f.field_key]));

function valuesForFill(snap: SessionSnapshot, only?: string[]): Record<string, string | null> {
  const keys = fieldKeyById(snap);
  const out: Record<string, string | null> = {};
  for (const v of snap.values) {
    const key = keys.get(v.field_id);
    if (key && (!only || only.includes(key))) out[key] = v.value;
  }
  return out;
}

function mergeFill(prev: FillReport | null, next: FillReport): FillReport {
  if (!prev) return next;
  const filled = new Set([...prev.filled, ...next.filled]);
  const skipped = [...prev.skipped.filter((s) => !next.filled.includes(s.field_key) && !next.skipped.some((n) => n.field_key === s.field_key)), ...next.skipped];
  return { filled: [...filled].filter((k) => !skipped.some((s) => s.field_key === k)), skipped };
}

async function fillIntoPage(only?: string[]) {
  const s = state.session;
  if (!s?.snapshot) return;
  const values = valuesForFill(s.snapshot, only);
  if (!Object.keys(values).length) return;
  try {
    const report = await sendToTab<FillResult>(s.tab_id, { type: 'FILL', values, highlight: true });
    await commit({ lastFill: only ? mergeFill(state.lastFill, report) : report, canUndo: true });
  } catch (e) {
    console.warn('fill failed', e);
    await commit({ lastFill: { filled: [], skipped: Object.keys(values).map((k) => ({ field_key: k, reason: 'The form tab was closed or reloaded' })) } });
  }
}

// ---------- Realtime ----------

let rt: { client: SupabaseClient; channel: RealtimeChannel; sessionId: string } | null = null;

async function refreshSnapshot() {
  const s = state.session;
  if (!s || !state.auth) return;
  try {
    const snap = await api<SessionSnapshot>(`/api/sessions/${s.session_code}`, { token: state.auth.token });
    const before = s.snapshot;
    await commit({ session: { ...s, form_name: snap.session.form_name, snapshot: snap } });
    // Values that changed while we were disconnected.
    if (state.autoFill && before) {
      const old = valuesForFill(before);
      const now = valuesForFill(snap);
      const changed = Object.keys(now).filter((k) => old[k] !== now[k]);
      if (changed.length) await fillIntoPage(changed);
    }
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) await commit({ auth: null, session: null });
  }
}

function patchSnapshot(fn: (snap: SessionSnapshot) => SessionSnapshot) {
  const s = state.session;
  if (!s?.snapshot) return null;
  const snapshot = fn(s.snapshot);
  state = { ...state, session: { ...s, snapshot, form_name: snapshot.session.form_name || s.form_name } };
  return snapshot;
}

async function ensureRealtime() {
  const s = state.session;
  if (!s || !state.auth || !SUPABASE_URL || !SUPABASE_ANON_KEY) return;
  if (rt?.sessionId === s.session_id) return;
  stopRealtime();

  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    accessToken: async () => state.auth?.token ?? null,
    // Websocket traffic every 20s keeps the MV3 service worker alive (Chrome 116+).
    realtime: { heartbeatIntervalMs: 20_000 },
  });
  const filter = `session_id=eq.${s.session_id}`;
  const channel = client
    .channel(`ext:${s.session_id}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'field_values', filter }, async (p) => {
      const row = p.new as SessionValue | undefined;
      if (!row?.field_id) return;
      const snap = patchSnapshot((snap) => {
        const cur = snap.values.find((v) => v.field_id === row.field_id);
        if (cur && cur.source_seq > row.source_seq) return snap;
        return { ...snap, values: [...snap.values.filter((v) => v.field_id !== row.field_id), row] };
      });
      await commit();
      // Latest wins on the page too: re-fill a field when a newer value arrives.
      const key = snap && fieldKeyById(snap).get(row.field_id);
      if (state.autoFill && key) await fillIntoPage([key]);
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'utterances', filter }, async (p) => {
      const row = p.new as UtteranceRow | undefined;
      if (!row?.seq) return;
      patchSnapshot((snap) => ({
        ...snap,
        utterances: [row, ...snap.utterances.filter((u) => u.seq !== row.seq)].sort((a, b) => b.seq - a.seq).slice(0, 50),
      }));
      await commit();
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'form_fields', filter }, async (p) => {
      const row = p.new as SessionField & { clean_label: string | null; label: string };
      patchSnapshot((snap) => ({
        ...snap,
        fields: snap.fields.map((f) =>
          f.id === row.id ? { ...f, label: row.clean_label || row.label || f.label, required: row.required, semantic_type: row.semantic_type } : f,
        ),
      }));
      await commit();
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'form_sessions', filter: `id=eq.${s.session_id}` }, async (p) => {
      const row = p.new as SessionInfo;
      patchSnapshot((snap) => ({ ...snap, session: { ...snap.session, form_name: row.form_name, status: row.status } }));
      await commit();
    });

  rt = { client, channel, sessionId: s.session_id };
  // Put the token on the socket before joining. Otherwise the join races the async accessToken
  // callback, Realtime stores the subscription as `anon`, and RLS silently drops every event.
  await client.realtime.setAuth(state.auth.token);
  if (rt?.channel !== channel) return; // stopped or replaced meanwhile
  channel.subscribe(async (status) => {
    live = status === 'SUBSCRIBED';
    broadcast();
    if (live) await refreshSnapshot();
  });
}

function stopRealtime() {
  if (!rt) return;
  rt.client.removeAllChannels();
  rt = null;
  live = false;
}

// ---------- popup requests ----------

async function handle(req: PopupRequest): Promise<void> {
  switch (req.type) {
    case 'GET_STATE':
      await ensureRealtime();
      // Fallback while Realtime is down: the popup polls and we fetch a fresh snapshot.
      if (!live) await refreshSnapshot();
      return;

    case 'LOGIN': {
      const r = await api<LoginResponse>('/api/auth/login', { body: { phone: req.phone, pin: req.pin } });
      await commit({ auth: { token: r.token, expires_at: r.expires_at, user: r.user } });
      return;
    }

    case 'LOGOUT':
      stopRealtime();
      await commit({ auth: null, session: null, autoFill: false, lastFill: null, canUndo: false });
      return;

    case 'START_SESSION': {
      if (!state.auth) throw new Error('Please sign in');
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (!tab?.id || !/^(https?|file):/.test(tab.url ?? '')) throw new Error('Open a web page with a form first');
      let scan: ScanResult;
      try {
        scan = await sendToTab<ScanResult>(tab.id, { type: 'SCAN' });
      } catch {
        throw new Error("Can't read this page. Reload it and try again.");
      }
      if (!scan?.schema?.fields?.length) throw new Error('No form fields found on this page');
      const created = await api<CreateSessionResponse>('/api/sessions', { body: scan.schema, token: state.auth.token });
      stopRealtime();
      await commit({
        session: { ...created, tab_id: tab.id, field_count: scan.schema.fields.length, snapshot: null },
        autoFill: false,
        lastFill: null,
        canUndo: false,
      });
      await refreshSnapshot();
      await ensureRealtime();
      return;
    }

    case 'END_SESSION':
      stopRealtime();
      await commit({ session: null, autoFill: false, lastFill: null, canUndo: false });
      return;

    case 'FILL':
      await commit({ autoFill: true });
      await fillIntoPage();
      return;

    case 'UNDO': {
      const s = state.session;
      if (s) await sendToTab(s.tab_id, { type: 'UNDO' }).catch(() => null);
      await commit({ autoFill: false, canUndo: false, lastFill: null });
      return;
    }
  }
}

chrome.runtime.onMessage.addListener((req: PopupRequest, sender, sendResponse) => {
  if (sender.tab) return false; // only the popup talks to the worker
  (async () => {
    await ready;
    try {
      await handle(req);
      return { ok: true, state: publicState() } satisfies PopupResponse;
    } catch (e) {
      if (e instanceof ApiError && e.status === 401 && req.type !== 'LOGIN') {
        stopRealtime();
        await commit({ auth: null, session: null });
      }
      const error =
        e instanceof ApiError && e.body.attempts_left !== undefined
          ? `${e.message}. ${e.body.attempts_left} ${e.body.attempts_left === 1 ? 'try' : 'tries'} left.`
          : (e as Error).message;
      return { ok: false, error, state: publicState() } satisfies PopupResponse;
    }
  })().then(sendResponse);
  return true;
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'popup') return;
  ports.add(port);
  port.onDisconnect.addListener(() => ports.delete(port));
  ready.then(async () => {
    await ensureRealtime();
    port.postMessage({ type: 'STATE', state: publicState() } satisfies StateMessage);
  });
});

// The form tab closed: the session can't fill anything any more.
chrome.tabs.onRemoved.addListener(async (tabId) => {
  await ready;
  if (state.session?.tab_id === tabId) await commit({ autoFill: false });
});

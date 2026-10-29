'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type {
  ApiError,
  FieldFile,
  FileUploadUrlResponse,
  PairResponse,
  ResetScope,
  SessionField,
  SessionInfo,
  SessionSnapshot,
  SessionValue,
  TranslateRequest,
  TranslateResponse,
  UtteranceResponse,
  UtteranceRow,
} from '@vff/shared';

export type LocalUtterance = {
  seq: number;
  target_field_key: string | null;
  status: 'processing' | 'done' | 'error';
  transcript: string | null;
  error: string | null;
  /** Kept for errored utterances so "tap to retry" can resend without re-recording. */
  blob?: Blob;
  /** How long the piece is (the server logs it for billing); resent with a retry. */
  durationMs?: number;
  /** Which long recording this piece belongs to, and its number (0, 1, 2…). */
  recording?: RecordingPiece;
};

/** `last`: the piece that ended the recording; the server maps the whole recording then. */
export type RecordingPiece = { recordingId: string; part: number; last: boolean };

type Stored = { token: string; expires_at: string; seq: number };
const storeKey = (code: string) => `vff:${code}`;

function readStored(code: string): Stored | null {
  try {
    const s = JSON.parse(sessionStorage.getItem(storeKey(code)) ?? 'null') as Stored | null;
    return s && new Date(s.expires_at) > new Date() ? s : null;
  } catch {
    return null;
  }
}
function writeStored(code: string, s: Stored) {
  try {
    sessionStorage.setItem(storeKey(code), JSON.stringify(s));
  } catch {
    /* private mode: reload will need a new QR */
  }
}

type FieldRowPayload = SessionField & { clean_label?: string | null; label: string };
const rowToField = (r: FieldRowPayload, prev?: SessionField): SessionField => ({
  id: r.id,
  field_key: r.field_key,
  label: r.clean_label || r.label || prev?.label || r.field_key,
  field_type: r.field_type,
  required: r.required,
  options: r.options ?? [],
  multiple: r.multiple,
  semantic_type: r.semantic_type,
  step_index: r.step_index,
  position: r.position,
  depends_on: r.depends_on ?? null,
  dynamic_options: r.dynamic_options ?? false,
  choice_hint: r.choice_hint ?? null,
  label_ta: r.label_ta ?? prev?.label_ta ?? null,
  accept: r.accept ?? prev?.accept ?? null,
  file_rules: r.file_rules ?? prev?.file_rules ?? null,
});

export type Phase = 'pairing' | 'ready' | 'error';

export function useVoiceSession(code: string) {
  const [phase, setPhase] = useState<Phase>('pairing');
  const [fatal, setFatal] = useState<string | null>(null);
  /** "Connect phone again" was used on the computer: another phone (or this one, rescanned) took over. */
  const [replaced, setReplaced] = useState(false);
  /** The computer user's plan ended or its voice minutes ran out (server message): speech is refused. */
  const [planBlocked, setPlanBlocked] = useState<string | null>(null);
  /** When this phone paired, to notice a newer pairing. */
  const pairedAtRef = useRef<string | null>(null);
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [fields, setFields] = useState<SessionField[]>([]);
  const [values, setValues] = useState<Map<string, SessionValue>>(new Map());
  /** Uploaded photos / PDFs, by field id. */
  const [files, setFiles] = useState<Map<string, FieldFile>>(new Map());
  const [utterances, setUtterances] = useState<Map<number, LocalUtterance>>(new Map());
  const [live, setLive] = useState(false);

  const [online, setOnline] = useState(true);

  const tokenRef = useRef<Stored | null>(null);
  const seqRef = useRef(1);
  /** Seqs replaced by a retry; late Realtime events for them are ignored. */
  const dismissedRef = useRef(new Set<number>());
  /** Seq of the last Start over: anything spoken before it is gone (late responses are ignored). */
  const resetSeqRef = useRef(0);
  const hidden = (seq: number) => seq <= resetSeqRef.current || dismissedRef.current.has(seq);

  /** A Start over happened (here, or seen in the session row): drop everything spoken before it. */
  const applyReset = useCallback((resetSeq: number) => {
    if (resetSeq <= resetSeqRef.current) return;
    resetSeqRef.current = resetSeq;
    seqRef.current = Math.max(seqRef.current, resetSeq + 1);
    setUtterances((prev) => new Map([...prev].filter(([seq]) => seq > resetSeq)));
    setValues((prev) => new Map([...prev].filter(([, v]) => v.source_seq >= resetSeq)));
  }, []);

  const applySnapshot = useCallback(
    (snap: SessionSnapshot) => {
      applyReset(snap.session.reset_seq ?? 0);
      setSession(snap.session);
      setFields(snap.fields);
      setFiles(new Map((snap.files ?? []).map((f) => [f.field_id, f])));
      setValues(new Map(snap.values.map((v) => [v.field_id, v])));
      setUtterances((prev) => {
        const next = new Map(prev);
        for (const u of snap.utterances) {
          if (!hidden(u.seq)) next.set(u.seq, { ...next.get(u.seq), ...pickUtt(u) });
        }
        return next;
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [applyReset],
  );

  const authFetch = useCallback(
    async (url: string, init: RequestInit = {}) => {
      const res = await fetch(url, {
        ...init,
        headers: { ...(init.headers ?? {}), authorization: `Bearer ${tokenRef.current?.token}` },
      });
      if (res.status === 401 || res.status === 410) {
        const body = (await res.json().catch(() => ({}))) as ApiError;
        setFatal(body.error || 'This session has ended. Scan a new QR code.');
        setPhase('error');
      } else if (res.status === 403) {
        const body = (await res.clone().json().catch(() => ({}))) as ApiError;
        if (body.code === 'phone_replaced') setReplaced(true);
      } else if (res.status === 402) {
        const body = (await res.clone().json().catch(() => ({}))) as ApiError;
        setPlanBlocked(body.error || null);
      } else if (res.status === 409) {
        // The desktop form tab was closed or moved meanwhile: show it even if the Realtime event was missed.
        const body = (await res.clone().json().catch(() => ({}))) as ApiError;
        if (body.code === 'tab_closed') setSession((s) => (s ? { ...s, desktop_state: 'closed' } : s));
        if (body.code === 'tab_moved') setSession((s) => (s ? { ...s, desktop_state: 'moved' } : s));
      }
      return res;
    },
    [],
  );

  // ---------- pairing (or resuming after a reload) ----------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const stored = readStored(code);
      try {
        if (stored) {
          tokenRef.current = stored;
          const res = await fetch(`/api/sessions/${code}`, { headers: { authorization: `Bearer ${stored.token}` } });
          if (res.ok) {
            const snap = (await res.json()) as SessionSnapshot & { next_seq: number };
            if (cancelled) return;
            seqRef.current = Math.max(stored.seq, snap.next_seq);
            pairedAtRef.current = snap.session.paired_at ?? null;
            applySnapshot(snap);
            setPhase('ready');
            return;
          }
        }
        const res = await fetch(`/api/sessions/${code}/pair`, { method: 'POST' });
        const body = (await res.json()) as PairResponse | ApiError;
        if (cancelled) return;
        if (!res.ok) throw new Error((body as ApiError).error);
        const pair = body as PairResponse;
        tokenRef.current = { token: pair.token, expires_at: pair.token_expires_at, seq: pair.next_seq };
        seqRef.current = pair.next_seq;
        pairedAtRef.current = pair.session.paired_at ?? null;
        writeStored(code, tokenRef.current);
        applySnapshot(pair);
        setPhase('ready');
      } catch (e) {
        if (cancelled) return;
        setFatal((e as Error).message || 'Could not connect. Check your network and scan again.');
        setPhase('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code, applySnapshot]);

  /** Re-reads the whole session; used after each utterance and after reconnects so nothing is missed. */
  const refresh = useCallback(async () => {
    const res = await authFetch(`/api/sessions/${code}`);
    if (res.ok) applySnapshot((await res.json()) as SessionSnapshot);
  }, [authFetch, applySnapshot, code]);

  // ---------- Realtime ----------
  const sessionId = session?.id;
  useEffect(() => {
    if (phase !== 'ready' || !sessionId) return;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anon) return;

    const client: SupabaseClient = createClient(url, anon, {
      accessToken: async () => tokenRef.current?.token ?? null,
    });
    let subscribedOnce = false;
    let cancelled = false;
    const filter = `session_id=eq.${sessionId}`;
    const channel = client
      .channel(`phone:${sessionId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'field_values', filter }, (p) => {
        const row = p.new as SessionValue | undefined;
        if (!row?.field_id) return;
        setValues((prev) => {
          const cur = prev.get(row.field_id);
          if (cur && cur.source_seq > row.source_seq) return prev;
          return new Map(prev).set(row.field_id, row);
        });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'utterances', filter }, (p) => {
        const row = p.new as UtteranceRow | undefined;
        if (!row?.seq || hidden(row.seq)) return;
        setUtterances((prev) => new Map(prev).set(row.seq, { ...prev.get(row.seq), ...pickUtt(row) }));
      })
      // Fields that appeared on the computer later (a wizard's next step, a field shown by an answer).
      // Uploaded files: the computer marks them filled (or refused by the website).
      .on('postgres_changes', { event: '*', schema: 'public', table: 'field_files', filter }, (p) => {
        const row = p.new as (FieldFile & { path?: string }) | undefined;
        const gone = p.old as { id?: string } | undefined;
        if (row?.field_id) {
          const { path: _path, ...file } = row;
          setFiles((prev) => new Map(prev).set(row.field_id, file));
        } else if (gone?.id) {
          setFiles((prev) => new Map([...prev].filter(([, f]) => f.id !== gone.id)));
        }
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'form_fields', filter }, (p) => {
        const row = p.new as FieldRowPayload;
        if (!row?.id) return;
        setFields((prev) => (prev.some((f) => f.id === row.id) ? prev : [...prev, rowToField(row)].sort((a, b) => a.position - b.position)));
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'form_fields', filter }, (p) => {
        const row = p.new as FieldRowPayload;
        setFields((prev) => prev.map((f) => (f.id === row.id ? rowToField(row, f) : f)));
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'form_sessions', filter: `id=eq.${sessionId}` }, (p) => {
        const row = p.new as SessionInfo;
        // The QR was shown again on the computer (back to waiting), or another phone paired since.
        const mine = pairedAtRef.current;
        if (row.status === 'waiting' || (mine && row.paired_at && Date.parse(row.paired_at) !== Date.parse(mine))) setReplaced(true);
        applyReset(row.reset_seq ?? 0);
        setSession((s) =>
          s
            ? {
                ...s,
                form_name: row.form_name,
                status: row.status,
                reset_seq: row.reset_seq ?? s.reset_seq,
                reset_scope: row.reset_scope ?? s.reset_scope,
                desktop_state: row.desktop_state ?? s.desktop_state,
                desktop_report: row.desktop_report ?? s.desktop_report,
                hidden_fields: row.hidden_fields ?? s.hidden_fields,
                voice_enabled: row.voice_enabled ?? s.voice_enabled,
              }
            : s,
        );
      })
    // The token must be on the socket *before* joining: Realtime records the subscription's role at
    // join time, and a join that races the async accessToken callback is stored as `anon`, which
    // RLS then filters out (subscribed, but no events ever arrive).
    client.realtime.setAuth(tokenRef.current?.token ?? null).then(() => {
      if (cancelled) return;
      channel.subscribe(async (status) => {
        setLive(status === 'SUBSCRIBED');
        if (status === 'SUBSCRIBED') {
          // After a reconnect, catch up on anything missed.
          if (subscribedOnce) await refresh();
          subscribedOnce = true;
        }
      });
    });
    return () => {
      cancelled = true;
      client.removeChannel(channel);
    };
  }, [phase, sessionId, refresh, applyReset]);

  // ---------- actions ----------
  const takeSeq = useCallback(() => {
    const seq = seqRef.current++;
    if (tokenRef.current) {
      tokenRef.current.seq = seqRef.current;
      writeStored(code, tokenRef.current);
    }
    return seq;
  }, [code]);

  const setUtt = (seq: number, patch: Partial<LocalUtterance>) =>
    setUtterances((prev) => {
      if (hidden(seq)) return prev; // spoken before a Start over, or replaced by a retry
      const cur = prev.get(seq) ?? { seq, target_field_key: null, status: 'processing', transcript: null, error: null };
      return new Map(prev).set(seq, { ...cur, ...patch });
    });

  /** Fire-and-forget: several utterances can be in flight; `seq` decides who wins. */
  const sendUtterance = useCallback(
    async (blob: Blob, target: string | null, seq = takeSeq(), recording?: RecordingPiece, durationMs?: number) => {
      setUtt(seq, { seq, target_field_key: target, status: 'processing', error: null, blob, recording, durationMs });
      const form = new FormData();
      const ext = blob.type.includes('mp4') ? 'mp4' : blob.type.includes('ogg') ? 'ogg' : 'webm';
      form.append('audio', blob, `utterance.${ext}`);
      form.append('seq', String(seq));
      if (target) form.append('target_field_key', target);
      if (durationMs) form.append('duration_ms', String(Math.round(durationMs)));
      if (recording) {
        form.append('recording_id', recording.recordingId);
        form.append('part', String(recording.part));
        form.append('last', recording.last ? '1' : '0');
      }
      try {
        const res = await authFetch('/api/utterances', { method: 'POST', body: form });
        const body = (await res.json()) as UtteranceResponse | ApiError;
        if ('status' in body) {
          setUtt(seq, {
            status: body.status,
            transcript: body.transcript,
            error: body.error ?? null,
            blob: body.status === 'error' ? blob : undefined,
          });
          // Values normally arrive over Realtime; re-read once so a missed event can't leave rows empty.
          if (body.status === 'done') void refresh();
        } else {
          setUtt(seq, { status: 'error', error: body.error, blob });
        }
      } catch {
        setUtt(seq, { status: 'error', error: NETWORK_ERROR, blob });
      }
    },
    [authFetch, takeSeq, refresh],
  );

  /** Retry with a new seq: the retry is "newer speech" than anything said in between. */
  const retry = useCallback(
    (u: LocalUtterance) => {
      if (!u.blob) return;
      dismissedRef.current.add(u.seq);
      setUtterances((prev) => {
        const next = new Map(prev);
        next.delete(u.seq);
        return next;
      });
      // Same recording and piece number, new seq, marked last: the server maps the whole recording again.
      sendUtterance(u.blob, u.target_field_key, undefined, u.recording && { ...u.recording, last: true }, u.durationMs);
    },
    [sendUtterance],
  );

  const editValue = useCallback(
    async (fieldKey: string, value: string | null): Promise<string | null> => {
      const res = await authFetch(`/api/sessions/${code}/values`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ seq: takeSeq(), values: [{ field_key: fieldKey, value }] }),
      });
      const body = (await res.json()) as { errors?: Record<string, string> } & ApiError;
      if (res.ok) void refresh();
      return body.errors?.[fieldKey] ?? (res.ok ? null : body.error);
    },
    [authFetch, code, takeSeq, refresh],
  );

  /** Tamil helper: English form text into Tamil. Aborted when the user types on (`signal`). */
  const translate = useCallback(
    async (text: string, signal?: AbortSignal): Promise<{ tamil: string } | { error: string }> => {
      try {
        const res = await authFetch('/api/translate', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ text } satisfies TranslateRequest),
          signal,
        });
        const body = (await res.json().catch(() => ({}))) as Partial<TranslateResponse> & ApiError;
        return res.ok && body.tamil ? { tamil: body.tamil } : { error: body.error || "Couldn't translate. Try again." };
      } catch (e) {
        if ((e as Error).name === 'AbortError') throw e;
        return { error: NETWORK_ERROR };
      }
    },
    [authFetch],
  );

  /** "Send to desktop". Resolves to an error message, or null when sent. */
  const complete = useCallback(async (): Promise<string | null> => {
    try {
      const res = await authFetch(`/api/sessions/${code}/complete`, { method: 'POST' });
      if (res.ok) {
        setSession((s) => (s ? { ...s, status: 'filled' } : s));
        return null;
      }
      return ((await res.json().catch(() => ({}))) as ApiError).error || 'Could not send. Try again.';
    } catch {
      return NETWORK_ERROR;
    }
  }, [authFetch, code]);

  /** Start over: clears every answer (and, for 'both', the form on the computer). Resolves to an error or null. */
  const reset = useCallback(
    async (scope: ResetScope): Promise<string | null> => {
      const seq = takeSeq();
      try {
        const res = await authFetch(`/api/sessions/${code}/reset`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ seq, scope }),
        });
        if (!res.ok) return ((await res.json().catch(() => ({}))) as ApiError).error || 'Could not clear. Try again.';
        applyReset(seq);
        setValues(new Map());
        setFiles(new Map());
        setFields((prev) => prev.map((f) => ({ ...f, choice_hint: null })));
        setSession((s) => (s ? { ...s, status: 'paired', reset_seq: seq, reset_scope: scope } : s));
        void refresh();
        return null;
      } catch {
        return NETWORK_ERROR;
      }
    },
    [authFetch, code, takeSeq, applyReset, refresh],
  );

  /**
   * Uploads a prepared photo / PDF for an upload field: the server checks it against the field's rules
   * and hands out a one-time upload URL; the file goes straight to storage; then the server checks what
   * arrived and the computer gets it. Resolves to an error message or null.
   */
  const uploadFile = useCallback(
    async (fieldKey: string, file: File, pages: number | null): Promise<string | null> => {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!url || !anon) return 'Uploads are not set up on this server.';
      const json = { 'content-type': 'application/json' };
      try {
        const res = await authFetch(`/api/sessions/${code}/files/upload-url`, {
          method: 'POST',
          headers: json,
          body: JSON.stringify({ field_key: fieldKey, mime: file.type, bytes: file.size, pages }),
        });
        if (!res.ok) return ((await res.json().catch(() => ({}))) as ApiError).error || 'Could not upload. Try again.';
        const target = (await res.json()) as FileUploadUrlResponse;
        const storage = createClient(url, anon, { auth: { persistSession: false } }).storage.from('form-files');
        const up = await storage.uploadToSignedUrl(target.path, target.token, file, { contentType: file.type });
        if (up.error) return 'Could not upload. Try again.';
        const done = await authFetch(`/api/sessions/${code}/files`, {
          method: 'POST',
          headers: json,
          body: JSON.stringify({ field_key: fieldKey, path: target.path, file_name: file.name, pages }),
        });
        const body = (await done.json().catch(() => ({}))) as FieldFile & ApiError;
        if (!done.ok) return body.error || 'Could not upload. Try again.';
        setFiles((prev) => new Map(prev).set(body.field_id, body));
        return null;
      } catch {
        return NETWORK_ERROR;
      }
    },
    [authFetch, code],
  );

  // ---------- offline: banner, and resend recordings that failed for lack of network ----------
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  const utterancesRef = useRef(utterances);
  utterancesRef.current = utterances;
  useEffect(() => {
    if (!online || phase !== 'ready') return;
    for (const u of utterancesRef.current.values()) {
      if (u.status === 'error' && u.blob && u.error === NETWORK_ERROR) retry(u);
    }
  }, [online, phase, retry]);

  const valueByKey = useMemo(() => {
    const m = new Map<string, SessionValue>();
    for (const f of fields) {
      const v = values.get(f.id);
      if (v) m.set(f.field_key, v);
    }
    return m;
  }, [fields, values]);

  return {
    phase,
    fatal,
    replaced,
    planBlocked,
    session,
    fields,
    valueByKey,
    utterances,
    live,
    takeSeq,
    sendUtterance,
    retry,
    editValue,
    translate,
    complete,
    reset,
    online,
    files,
    uploadFile,
  };
}

const NETWORK_ERROR = 'Network error. Tap to retry.';

function pickUtt(u: UtteranceRow): Omit<LocalUtterance, 'blob'> {
  return { seq: u.seq, target_field_key: u.target_field_key, status: u.status, transcript: u.transcript, error: u.error };
}

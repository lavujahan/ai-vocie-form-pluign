'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type {
  ApiError,
  PairResponse,
  SessionField,
  SessionInfo,
  SessionSnapshot,
  SessionValue,
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
  /** Which long recording this piece belongs to, and its number (0, 1, 2…). */
  recording?: RecordingPiece;
};

export type RecordingPiece = { recordingId: string; part: number };

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
});

export type Phase = 'pairing' | 'ready' | 'error';

export function useVoiceSession(code: string) {
  const [phase, setPhase] = useState<Phase>('pairing');
  const [fatal, setFatal] = useState<string | null>(null);
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [fields, setFields] = useState<SessionField[]>([]);
  const [values, setValues] = useState<Map<string, SessionValue>>(new Map());
  const [utterances, setUtterances] = useState<Map<number, LocalUtterance>>(new Map());
  const [live, setLive] = useState(false);

  const tokenRef = useRef<Stored | null>(null);
  const seqRef = useRef(1);
  /** Seqs replaced by a retry; late Realtime events for them are ignored. */
  const dismissedRef = useRef(new Set<number>());

  const applySnapshot = useCallback((snap: SessionSnapshot) => {
    setSession(snap.session);
    setFields(snap.fields);
    setValues(new Map(snap.values.map((v) => [v.field_id, v])));
    setUtterances((prev) => {
      const next = new Map(prev);
      for (const u of snap.utterances) {
        if (!dismissedRef.current.has(u.seq)) next.set(u.seq, { ...next.get(u.seq), ...pickUtt(u) });
      }
      return next;
    });
  }, []);

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
        if (!row?.seq || dismissedRef.current.has(row.seq)) return;
        setUtterances((prev) => new Map(prev).set(row.seq, { ...prev.get(row.seq), ...pickUtt(row) }));
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'form_fields', filter }, (p) => {
        const row = p.new as FieldRowPayload;
        setFields((prev) => prev.map((f) => (f.id === row.id ? rowToField(row, f) : f)));
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'form_sessions', filter: `id=eq.${sessionId}` }, (p) => {
        const row = p.new as SessionInfo;
        setSession((s) => (s ? { ...s, form_name: row.form_name, status: row.status } : s));
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
  }, [phase, sessionId, refresh]);

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
      const cur = prev.get(seq) ?? { seq, target_field_key: null, status: 'processing', transcript: null, error: null };
      return new Map(prev).set(seq, { ...cur, ...patch });
    });

  /** Fire-and-forget: several utterances can be in flight; `seq` decides who wins. */
  const sendUtterance = useCallback(
    async (blob: Blob, target: string | null, seq = takeSeq(), recording?: RecordingPiece) => {
      setUtt(seq, { seq, target_field_key: target, status: 'processing', error: null, blob, recording });
      const form = new FormData();
      const ext = blob.type.includes('mp4') ? 'mp4' : blob.type.includes('ogg') ? 'ogg' : 'webm';
      form.append('audio', blob, `utterance.${ext}`);
      form.append('seq', String(seq));
      if (target) form.append('target_field_key', target);
      if (recording) {
        form.append('recording_id', recording.recordingId);
        form.append('part', String(recording.part));
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
        setUtt(seq, { status: 'error', error: 'Network error. Tap to retry.', blob });
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
      // Same recording and piece number, new seq: the server joins it with the earlier pieces again.
      sendUtterance(u.blob, u.target_field_key, undefined, u.recording);
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

  const complete = useCallback(async () => {
    const res = await authFetch(`/api/sessions/${code}/complete`, { method: 'POST' });
    if (res.ok) setSession((s) => (s ? { ...s, status: 'filled' } : s));
    return res.ok;
  }, [authFetch, code]);

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
    session,
    fields,
    valueByKey,
    utterances,
    live,
    takeSeq,
    sendUtterance,
    retry,
    editValue,
    complete,
  };
}

function pickUtt(u: UtteranceRow): Omit<LocalUtterance, 'blob'> {
  return { seq: u.seq, target_field_key: u.target_field_key, status: u.status, transcript: u.transcript, error: u.error };
}

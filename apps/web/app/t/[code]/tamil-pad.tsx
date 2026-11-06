'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Loader2, Mic, Pencil, Square, Trash2 } from 'lucide-react';
import {
  AUTO_STOP_SECONDS,
  type ApiError,
  type TamilPadDictateResponse,
  type TamilPadInfo,
  type TamilPadPairResponse,
  type TamilPadPiece,
} from '@vff/shared';
import { useRecorder } from '@vff/shared/ui/use-recorder';
import { TA_FONT } from '@vff/shared/ui/voice-tips';
import { Button, cx } from '@/components/ui';

/**
 * Tamil typing on the phone (the popup's த bubble → Speak on phone): one big mic, and every sentence
 * spoken goes to the computer, which adds it to its Tamil text. Each sentence can be edited (typed, or
 * Speak again) or deleted here; the computer's text follows. No form and no QR counter: speaking uses
 * the voice minutes of the computer's plan.
 */

class PadError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

async function call<T>(path: string, { method, token, json, form }: { method?: string; token?: string | null; json?: unknown; form?: FormData } = {}): Promise<T> {
  const res = await fetch(path, {
    method: method ?? (json !== undefined || form ? 'POST' : 'GET'),
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(json !== undefined ? { 'content-type': 'application/json' } : {}) },
    body: form ?? (json !== undefined ? JSON.stringify(json) : undefined),
  }).catch(() => null);
  if (!res) throw new PadError(0, 'No internet. Check the connection and try again.');
  const body = (await res.json().catch(() => ({}))) as Partial<ApiError>;
  if (!res.ok) throw new PadError(res.status, body.error ?? 'Something went wrong. Try again.', body.code);
  return body as T;
}

type Stored = { token: string; expires_at: string };
const storeKey = (code: string) => `vff-pad:${code}`;
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
    /* private mode: a reload needs a new QR */
  }
}

/** One recording: a new sentence, or Speak again on `replace`. `seq` is learned from its first piece. */
type Rec = { replace: number | null; seq: number | null; parts: number };
type Part = { blob: Blob; durationMs: number; part: number; rec: Rec };
type Phase = { kind: 'pairing' } | { kind: 'ready' } | { kind: 'ended' } | { kind: 'error'; message: string };

const UNDO_MS = 5000;
const POLL_MS = 5000;

export function TamilPad({ code }: { code: string }) {
  const [phase, setPhase] = useState<Phase>({ kind: 'pairing' });
  const [pieces, setPieces] = useState<TamilPadPiece[]>([]);
  const [planOff, setPlanOff] = useState(false);
  const [sending, setSending] = useState(0);
  const [failed, setFailed] = useState<Part[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ seq: number; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [asking, setAsking] = useState<number | null>(null);
  /** Deleted here, with Undo for a few seconds before the computer is told. */
  const [undoable, setUndoable] = useState<number[]>([]);
  /** Speak again is recording for this sentence. */
  const [again, setAgain] = useState<number | null>(null);
  const token = useRef<string | null>(null);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const listEnd = useRef<HTMLDivElement>(null);

  const upsert = useCallback((p: TamilPadPiece) => setPieces((all) => [...all.filter((x) => x.seq !== p.seq), p].sort((a, b) => a.seq - b.seq)), []);

  /** Ended by the computer (Disconnect), by Done, or the link is gone. */
  const stopped = useCallback((e: unknown) => {
    if (!(e instanceof PadError)) return false;
    if (e.status === 410 || e.code === 'pad_ended') setPhase({ kind: 'ended' });
    else if (e.status === 401 || e.status === 403 || e.status === 404) setPhase({ kind: 'error', message: e.message });
    else return false;
    return true;
  }, []);

  // Pair once; a reload on this phone carries on with the saved token.
  useEffect(() => {
    let off = false;
    (async () => {
      try {
        const saved = readStored(code);
        if (saved) {
          token.current = saved.token;
          const info = await call<TamilPadInfo>(`/api/tamil-pads/${code}`, { token: saved.token });
          if (off) return;
          setPieces(info.pieces);
          setPhase(info.ended_at ? { kind: 'ended' } : { kind: 'ready' });
          return;
        }
        const r = await call<TamilPadPairResponse>(`/api/tamil-pads/${code}/pair`, { method: 'POST' });
        if (off) return;
        token.current = r.token;
        writeStored(code, { token: r.token, expires_at: r.token_expires_at });
        setPieces(r.pieces);
        setPhase({ kind: 'ready' });
      } catch (e) {
        if (!off) setPhase({ kind: 'error', message: (e as Error).message });
      }
    })();
    return () => {
      off = true;
    };
  }, [code]);

  // The computer may press Disconnect: look every few seconds while the page is in view.
  const ready = phase.kind === 'ready';
  useEffect(() => {
    if (!ready) return;
    const t = setInterval(async () => {
      if (document.hidden || !token.current) return;
      try {
        const info = await call<TamilPadInfo>(`/api/tamil-pads/${code}`, { token: token.current });
        if (info.ended_at) setPhase({ kind: 'ended' });
      } catch (e) {
        stopped(e);
      }
    }, POLL_MS);
    return () => clearInterval(t);
  }, [ready, code, stopped]);

  // ---------- speaking: pieces are written one at a time, so sentences stay in spoken order ----------

  const queue = useRef<Promise<void>>(Promise.resolve());
  const held = useRef<Part[]>([]);

  const write = useCallback(
    async (p: Part) => {
      if (held.current.length) {
        held.current = [...held.current, p];
        setFailed(held.current);
        return;
      }
      const form = new FormData();
      form.append('audio', p.blob, 'speech');
      form.append('duration_ms', String(p.durationMs));
      form.append('part', String(p.part));
      if (p.rec.seq) form.append('seq', String(p.rec.seq));
      else if (p.rec.replace) form.append('replace', String(p.rec.replace));
      setSending((n) => n + 1);
      try {
        const r = await call<TamilPadDictateResponse>(`/api/tamil-pads/${code}/dictate`, { token: token.current, form });
        if (r.piece) {
          p.rec.seq = r.piece.seq;
          upsert(r.piece);
        } else if (p.part === 0) setError("Didn't catch any speech. Tap and try again.");
      } catch (e) {
        if (stopped(e)) return;
        if (e instanceof PadError && e.status === 402) {
          setPlanOff(true);
          return;
        }
        setError((e as Error).message);
        held.current = [p];
        setFailed(held.current);
      } finally {
        setSending((n) => n - 1);
      }
    },
    [code, upsert, stopped],
  );
  const enqueue = useCallback((p: Part) => {
    queue.current = queue.current.then(() => write(p));
  }, [write]);
  const retry = () => {
    const parts = held.current;
    held.current = [];
    setFailed([]);
    setError(null);
    parts.forEach(enqueue);
  };

  const recorder = useRecorder((blob, { tag, durationMs }) => {
    const rec = tag as Rec;
    // Stop landed just after a 28 s cut: this sliver holds no speech.
    if (rec.parts > 0 && durationMs < 1000) return;
    enqueue({ blob, durationMs, part: rec.parts++, rec });
  });
  const recording = recorder.state === 'recording';
  useEffect(() => {
    if (!recording) setAgain(null);
  }, [recording]);

  const speak = async (replace: number | null = null) => {
    setError(null);
    setAgain(replace);
    await recorder.start({ replace, seq: null, parts: 0 } satisfies Rec);
  };

  // New sentences are at the end: keep them in view.
  useEffect(() => {
    listEnd.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [pieces.length]);

  // ---------- edit and delete ----------

  async function save() {
    if (!editing) return;
    const text = editing.text.trim();
    if (!text) return void ask(editing.seq);
    setSaving(true);
    try {
      upsert(await call<TamilPadPiece>(`/api/tamil-pads/${code}/pieces/${editing.seq}`, { method: 'PATCH', token: token.current, json: { text } }));
      setEditing(null);
    } catch (e) {
      if (!stopped(e)) setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const ask = (seq: number) => {
    setEditing(null);
    setAsking(seq);
  };

  const sendDelete = useCallback(
    async (seq: number) => {
      timers.current.delete(seq);
      setUndoable((u) => u.filter((s) => s !== seq));
      try {
        upsert(await call<TamilPadPiece>(`/api/tamil-pads/${code}/pieces/${seq}`, { method: 'PATCH', token: token.current, json: { deleted: true } }));
      } catch (e) {
        if (!stopped(e)) setError((e as Error).message);
      }
    },
    [code, upsert, stopped],
  );

  const remove = (seq: number) => {
    setAsking(null);
    setUndoable((u) => [...u, seq]);
    timers.current.set(seq, setTimeout(() => void sendDelete(seq), UNDO_MS));
  };
  const undo = (seq: number) => {
    clearTimeout(timers.current.get(seq));
    timers.current.delete(seq);
    setUndoable((u) => u.filter((s) => s !== seq));
  };

  async function done() {
    if (recording) recorder.stop();
    // Deletes still waiting for their Undo go now.
    await Promise.all([...timers.current.keys()].map((seq) => (clearTimeout(timers.current.get(seq)), sendDelete(seq))));
    await queue.current;
    try {
      await call(`/api/tamil-pads/${code}`, { method: 'DELETE', token: token.current });
    } catch (e) {
      if (!stopped(e)) return setError((e as Error).message);
    }
    setPhase({ kind: 'ended' });
  }

  // ---------- screens ----------

  const shown = pieces.filter((p) => !p.deleted);
  const sentCount = shown.filter((p) => !undoable.includes(p.seq)).length;

  if (phase.kind === 'pairing') {
    return (
      <Shell>
        <div className="grid flex-1 place-items-center">
          <Loader2 size={28} className="animate-spin text-muted" aria-label="Opening" />
        </div>
      </Shell>
    );
  }
  if (phase.kind === 'error' || phase.kind === 'ended') {
    const ended = phase.kind === 'ended';
    return (
      <Shell>
        <div className="grid flex-1 content-center justify-items-center gap-3 px-6 text-center">
          <span className={cx('grid size-20 place-items-center rounded-full', ended ? 'bg-live-bg text-live-ink' : 'bg-warn-bg text-warn-ink')}>
            {ended ? <Check size={40} strokeWidth={2.6} /> : <Mic size={36} />}
          </span>
          {ended ? (
            <>
              <h1 className="text-xl font-bold" style={{ fontFamily: TA_FONT }}>
                முடிந்தது
              </h1>
              <p className="text-base font-semibold">Finished. The text is on the computer.</p>
              <p className="text-sm text-muted">
                {sentCount === 1 ? '1 sentence sent.' : `${sentCount} sentences sent.`} You can close this page.
              </p>
            </>
          ) : (
            <>
              <h1 className="text-lg font-bold">Can&rsquo;t open Tamil typing</h1>
              <p className="text-sm text-muted">{phase.message}</p>
            </>
          )}
        </div>
      </Shell>
    );
  }

  const denied = recorder.state === 'denied';
  const unsupported = recorder.state === 'unsupported';
  let title = 'Tap and speak in Tamil';
  let tamil = 'தட்டி தமிழில் பேசுங்கள்';
  let hint = 'Each sentence goes to the computer.';
  if (planOff) {
    title = 'Speaking is off';
    tamil = 'பேசும் வசதி இப்போது இல்லை';
    hint = 'Ask at the counter. You can still edit what was sent.';
  } else if (recording) {
    title = `${again ? 'Saying it again' : 'Listening'} ${Math.floor(recorder.elapsed / 60)}:${String(recorder.elapsed % 60).padStart(2, '0')}`;
    tamil = 'பேசுங்கள்… முடிந்ததும் தட்டுங்கள்';
    hint = recorder.stopsIn ? `Stops in ${recorder.stopsIn} s` : `Tap to stop. It stops by itself after ${AUTO_STOP_SECONDS} seconds of silence.`;
  } else if (sending) {
    title = 'Writing your Tamil…';
    tamil = 'எழுதுகிறது…';
    hint = 'Takes a few seconds';
  } else if (denied) {
    title = 'The microphone is blocked';
    tamil = 'மைக் அனுமதி தேவை';
    hint = 'Allow the microphone for this page in the browser settings, then tap again.';
  } else if (unsupported) {
    title = 'This browser can’t record';
    tamil = '';
    hint = 'Open this page in Chrome or Safari.';
  } else if (recorder.notice === 'too_short') {
    hint = 'That was too short. Tap and speak.';
  } else if (recorder.notice === 'interrupted') {
    hint = 'The recording stopped early. What you said is kept.';
  }

  return (
    <Shell>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-3.5">
        <span className="inline-flex items-center gap-1.5 self-center rounded-full bg-live-bg px-3 py-1 text-xs font-semibold text-live-ink">
          <span className="size-2 rounded-full bg-live-ink" /> Connected to the computer
        </span>

        <div className="grid justify-items-center gap-2 rounded-2xl border border-line bg-card px-3 pt-5 pb-4 text-center">
          <button
            type="button"
            aria-label={recording ? 'Stop' : 'Start speaking'}
            disabled={(planOff && !recording) || unsupported || (!!editing && !recording)}
            onClick={() => (recording ? recorder.stop() : void speak())}
            className="relative grid size-24 place-items-center rounded-full bg-danger text-white shadow-[0_8px_22px_rgba(212,67,61,0.38)] transition-transform active:scale-95 disabled:opacity-40 disabled:shadow-none"
          >
            {recording && <span className="absolute -inset-[9px] animate-[vf-pulse_1.5s_ease-out_infinite] rounded-full border-4 border-danger/35 motion-reduce:animate-none" />}
            {recording ? <Square size={34} fill="currentColor" /> : sending && !planOff ? <Loader2 size={36} className="animate-spin" /> : <Mic size={40} />}
          </button>
          <p className="text-base font-bold tabular-nums">{title}</p>
          {tamil && (
            <p className="text-sm" style={{ fontFamily: TA_FONT }}>
              {tamil}
            </p>
          )}
          <p className="text-xs text-muted">{hint}</p>
        </div>

        {error && (
          <div role="status" className="rounded-lg border border-danger-ink/25 bg-danger-bg px-3 py-2 text-sm text-danger-ink">
            {error}{' '}
            {failed.length > 0 && (
              <button type="button" onClick={retry} className="font-semibold underline underline-offset-2">
                Retry
              </button>
            )}
          </div>
        )}

        {shown.length > 0 && (
          <section className="grid gap-2" aria-label="Sent to the computer">
            <h2 className="text-[11px] font-bold tracking-wider text-muted uppercase">Sent to the computer · {sentCount}</h2>
            {shown.map((p, i) =>
              undoable.includes(p.seq) ? (
                <div key={p.seq} className="flex items-center justify-between gap-2 rounded-xl border border-dashed border-line bg-subtle px-3 py-2.5 text-sm text-muted">
                  <span className="min-w-0 truncate line-through" style={{ fontFamily: TA_FONT }}>
                    {p.text}
                  </span>
                  <button type="button" onClick={() => undo(p.seq)} className="shrink-0 font-semibold text-accent-ink underline underline-offset-2">
                    Undo
                  </button>
                </div>
              ) : editing?.seq === p.seq ? (
                <div key={p.seq} className="grid gap-2 rounded-xl border-2 border-brand bg-card p-2.5 shadow-[0_0_0_3px_rgba(30,78,156,0.12)]">
                  <label htmlFor={`edit-${p.seq}`} className="text-[11.5px] font-bold text-accent-ink">
                    EDIT SENTENCE {i + 1} · <span style={{ fontFamily: TA_FONT }}>திருத்தவும்</span>
                  </label>
                  <textarea
                    id={`edit-${p.seq}`}
                    value={editing.text}
                    onChange={(e) => setEditing({ seq: p.seq, text: e.target.value })}
                    rows={3}
                    className="w-full resize-none rounded-lg border border-line bg-card px-2.5 py-2 text-base leading-relaxed text-ink focus:border-accent-ink focus:outline-none"
                    style={{ fontFamily: TA_FONT }}
                  />
                  <div className="flex gap-1.5">
                    <Button
                      className="min-h-10 px-3 text-danger-ink"
                      disabled={planOff || saving}
                      onClick={() => {
                        setEditing(null);
                        void speak(p.seq);
                      }}
                    >
                      <Mic size={15} /> Speak again
                    </Button>
                    <Button className="min-h-10 px-3" disabled={saving} onClick={() => setEditing(null)}>
                      Cancel
                    </Button>
                    <Button variant="primary" className="min-h-10 flex-1" loading={saving} disabled={!editing.text.trim()} onClick={save}>
                      Save
                    </Button>
                  </div>
                </div>
              ) : (
                <div key={p.seq} className={cx('grid gap-1.5 rounded-xl border border-line bg-card px-3 py-2.5', (!!editing || again === p.seq) && 'opacity-50')}>
                  <p className="text-[15px] leading-relaxed" style={{ fontFamily: TA_FONT }}>
                    {p.text}
                  </p>
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1 text-xs font-semibold text-live-ink">
                      <Check size={12} strokeWidth={2.8} /> {again === p.seq ? 'Saying it again…' : 'Sent to computer'}
                    </span>
                    <span className="flex gap-1">
                      <button
                        type="button"
                        disabled={recording || !!editing}
                        onClick={() => setEditing({ seq: p.seq, text: p.text })}
                        className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-line bg-page px-2.5 text-xs font-medium disabled:opacity-40"
                      >
                        <Pencil size={12} /> Edit
                      </button>
                      <button
                        type="button"
                        disabled={recording || !!editing}
                        onClick={() => ask(p.seq)}
                        className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-line bg-page px-2.5 text-xs font-medium text-danger-ink disabled:opacity-40"
                      >
                        <Trash2 size={12} /> Delete
                      </button>
                    </span>
                  </div>
                </div>
              ),
            )}
            <div ref={listEnd} />
          </section>
        )}
      </div>

      <footer className="border-t border-line bg-card px-4 pt-2.5 pb-[calc(14px+env(safe-area-inset-bottom,0px))]">
        <Button className="min-h-11 w-full" disabled={sending > 0 || failed.length > 0 || !!editing} onClick={done}>
          Done
        </Button>
      </footer>

      {asking !== null && (
        <div className="fixed inset-0 z-30 flex items-end bg-ink/45" role="dialog" aria-modal="true" aria-label="Delete this sentence?">
          <div className="grid w-full gap-2.5 rounded-t-2xl bg-card px-4 pt-4 pb-[calc(18px+env(safe-area-inset-bottom,0px))]">
            <b className="text-base">
              Delete this sentence? · <span style={{ fontFamily: TA_FONT }}>நீக்கவா?</span>
            </b>
            <p className="rounded-lg bg-subtle px-3 py-2 text-sm leading-relaxed" style={{ fontFamily: TA_FONT }}>
              {pieces.find((p) => p.seq === asking)?.text}
            </p>
            <p className="text-xs text-muted">It is removed from the computer&rsquo;s text too.</p>
            <div className="grid grid-cols-2 gap-2">
              <Button className="min-h-11" onClick={() => setAsking(null)}>
                Keep
              </Button>
              <Button className="min-h-11 border-transparent! bg-danger-bg! text-danger-ink!" onClick={() => remove(asking)}>
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}
    </Shell>
  );
}

/** The gold header and a full-height column, as on the form's phone page. */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex h-dvh flex-col bg-page text-ink">
      <header className="border-b border-gold-line bg-gold px-4 pt-[calc(10px+env(safe-area-inset-top,0px))] pb-2.5 text-gold-ink">
        <p className="flex items-center gap-2 text-[15px] font-bold">
          <span className="grid size-6 place-items-center rounded-md bg-brand text-sm font-semibold text-brand-ink" style={{ fontFamily: TA_FONT }}>
            த
          </span>
          <span style={{ fontFamily: TA_FONT }}>தமிழ் டைப்பிங்</span> · Tamil typing
        </p>
        <p className="mt-0.5 text-xs opacity-80">Speak here. The text goes to the computer.</p>
      </header>
      {children}
    </main>
  );
}

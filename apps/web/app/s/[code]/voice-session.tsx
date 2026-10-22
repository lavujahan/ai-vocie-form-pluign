'use client';

import { useMemo, useState } from 'react';
import { AlertCircle, ArrowLeft, Check, ChevronRight, Loader2, Mic, Send, Square } from 'lucide-react';
import { LOW_CONFIDENCE, type ChoiceHint, type ChoiceReason, type SessionField, type SessionValue } from '@vff/shared';
import { Button, Card, FieldRow, Pill, cx } from '@/components/ui';
import { useRecorder } from './use-recorder';
import { useVoiceSession, type LocalUtterance } from './use-voice-session';

type Mode = 'full' | 'field';
type PieceTag = { seq: number; target: string | null; recordingId: string; part: number };
type View = 'record' | 'review';

type FieldStatus =
  | { kind: 'recording' }
  | { kind: 'processing' }
  | { kind: 'error'; utt: LocalUtterance }
  | { kind: 'low'; value: SessionValue }
  | { kind: 'filled'; value: SessionValue }
  | { kind: 'missing' }
  | { kind: 'empty' }
  /** The computer couldn't match the spoken value to the dropdown's loaded options: pick one. */
  | { kind: 'pick'; hint: ChoiceHint; value?: SessionValue };

export function displayValue(f: SessionField, v: string | null | undefined): string {
  if (!v) return '';
  if (f.field_type === 'checkbox' && !f.multiple) return v === 'true' ? 'Yes' : v === 'false' ? 'No' : v;
  return v;
}

const HINT_TEXT: Record<ChoiceReason, string> = {
  ambiguous: 'Which one did you mean?',
  no_match: "That isn't in the list. Pick the right one, or say it again.",
  parent_changed: "That doesn't fit the new choice above. Pick again, or say it again.",
  not_loaded: "The list didn't load on the computer. Pick from the list, or say it again.",
};

function fmtTime(s: number) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function VoiceSession({ code }: { code: string }) {
  const s = useVoiceSession(code);
  const [mode, setMode] = useState<Mode>('full');
  const [view, setView] = useState<View>('record');
  const [target, setTarget] = useState<string | null>(null);
  const [recordingTarget, setRecordingTarget] = useState<string | null>(null);

  /**
   * Tags for one recording: the first piece gets `seq`; each extra piece (long recordings are cut
   * for Sarvam's 30 s limit) takes the next seq, the same recordingId and the next part number.
   */
  const pieceTags = (seq: number, target: string | null): [PieceTag, { nextTag: () => PieceTag }] => {
    const recordingId = crypto.randomUUID();
    let part = 0;
    return [
      { seq, target, recordingId, part },
      { nextTag: () => ({ seq: s.takeSeq(), target, recordingId, part: ++part }) },
    ];
  };

  const recorder = useRecorder((blob, { tag }) => {
    const { seq, target, recordingId, part } = tag as PieceTag;
    s.sendUtterance(blob, target, seq, { recordingId, part });
  });

  // Latest utterance per targeted field.
  const latestByField = useMemo(() => {
    const m = new Map<string, LocalUtterance>();
    for (const u of s.utterances.values()) {
      if (!u.target_field_key) continue;
      const cur = m.get(u.target_field_key);
      if (!cur || u.seq > cur.seq) m.set(u.target_field_key, u);
    }
    return m;
  }, [s.utterances]);

  const statusOf = (f: SessionField): FieldStatus => {
    if (recorder.state === 'recording' && recordingTarget === f.field_key) return { kind: 'recording' };
    const value = s.valueByKey.get(f.field_key);
    const u = latestByField.get(f.field_key);
    if (u && (!value || u.seq > value.source_seq)) {
      if (u.status === 'processing') return { kind: 'processing' };
      if (u.status === 'error') return { kind: 'error', utt: u };
    }
    if (f.choice_hint) return { kind: 'pick', hint: f.choice_hint, value };
    if (value?.value) {
      return (value.confidence ?? 1) < LOW_CONFIDENCE ? { kind: 'low', value } : { kind: 'filled', value };
    }
    return f.required ? { kind: 'missing' } : { kind: 'empty' };
  };

  const processing = [...s.utterances.values()].filter((u) => u.status === 'processing').length;
  const fullModeErrors = [...s.utterances.values()]
    .filter((u) => u.status === 'error' && !u.target_field_key)
    .sort((a, b) => b.seq - a.seq)
    .slice(0, 3);
  const latestTranscript = [...s.utterances.values()]
    .filter((u) => u.transcript)
    .sort((a, b) => b.seq - a.seq)[0]?.transcript;
  const filledCount = s.fields.filter((f) => s.valueByKey.get(f.field_key)?.value).length;

  /** Next field (in form order) that still needs a value, after `from`. */
  const nextEmpty = (from: string | null) => {
    const i = from ? s.fields.findIndex((f) => f.field_key === from) : -1;
    const rest = [...s.fields.slice(i + 1), ...s.fields.slice(0, Math.max(i, 0))];
    return rest.find((f) => !s.valueByKey.get(f.field_key)?.value && !latestByField.has(f.field_key))?.field_key ?? null;
  };

  async function toggleMic() {
    if (recorder.state === 'recording') {
      recorder.stop();
      setRecordingTarget(null);
      // Field-by-field: move straight on to the next field; the last one keeps processing.
      if (mode === 'field' && target) setTarget(nextEmpty(target));
      return;
    }
    const t = mode === 'field' ? target ?? nextEmpty(null) : null;
    if (mode === 'field' && !t) return;
    if (t !== target) setTarget(t);
    const seq = s.takeSeq(); // seq = when the user spoke, not when processing finishes
    // Long recordings are sent in ~28 s pieces, each with the next seq.
    if (await recorder.start(...pieceTags(seq, t))) setRecordingTarget(t);
  }

  /** Mic inside the review list: records straight into one field without leaving the page. */
  async function micFor(fieldKey: string) {
    if (recorder.state === 'recording') {
      recorder.stop();
      setRecordingTarget(null);
      return;
    }
    const seq = s.takeSeq();
    if (await recorder.start(...pieceTags(seq, fieldKey))) {
      setRecordingTarget(fieldKey);
    }
  }

  function showView(v: View) {
    if (recorder.state === 'recording') {
      recorder.stop();
      setRecordingTarget(null);
    }
    setView(v);
    window.scrollTo(0, 0);
  }

  if (s.phase === 'pairing') {
    return (
      <Shell>
        <Card className="flex items-center gap-3 text-sm text-muted">
          <Loader2 size={18} className="animate-spin" /> Connecting to your computer…
        </Card>
      </Shell>
    );
  }
  if (s.phase === 'error') {
    return (
      <Shell>
        <Card>
          <h1 className="flex items-center gap-2 text-base font-semibold">
            <AlertCircle size={18} className="text-danger" /> Can&apos;t continue
          </h1>
          <p className="mt-2 text-sm text-muted">{s.fatal}</p>
        </Card>
      </Shell>
    );
  }

  const recording = recorder.state === 'recording';
  const targetField = s.fields.find((f) => f.field_key === target);

  if (view === 'review') {
    return (
      <Shell>
        <ReviewView
          fields={s.fields}
          statusOf={statusOf}
          sent={s.session?.status === 'filled'}
          onBack={() => showView('record')}
          onEdit={s.editValue}
          onMic={micFor}
          recordingKey={recording ? recordingTarget : null}
          elapsed={recorder.elapsed}
          onRetry={s.retry}
          onSend={s.complete}
        />
      </Shell>
    );
  }

  return (
    <Shell>
      <Card>
        <div className="flex items-start justify-between gap-2">
          <h1 className="text-base font-semibold">{s.session?.form_name || 'Form'}</h1>
          {processing > 0 && (
            <Pill tone="neutral">
              <Loader2 size={12} className="mr-1 animate-spin" /> {processing} processing
            </Pill>
          )}
        </div>

        <div className="mt-3 flex gap-2" role="tablist">
          {(['full', 'field'] as const).map((m) => (
            <button
              key={m}
              role="tab"
              aria-selected={mode === m}
              disabled={recording}
              onClick={() => {
                setMode(m);
                if (m === 'field' && !target) setTarget(nextEmpty(null));
              }}
              className={cx(
                'min-h-9 rounded-lg border px-3 text-sm',
                mode === m ? 'border-transparent bg-accent-bg font-medium text-accent-ink' : 'border-line bg-card text-ink',
              )}
            >
              {m === 'full' ? 'Full form' : 'Field by field'}
            </button>
          ))}
        </div>

        <div className="mt-6 flex flex-col items-center">
          <button
            onClick={toggleMic}
            disabled={recorder.state === 'unsupported' || (mode === 'field' && !target && !recording)}
            aria-label={recording ? 'Stop recording' : 'Start recording'}
            className={cx(
              'relative grid size-24 place-items-center rounded-full bg-danger text-white shadow-sm transition-transform active:scale-95 disabled:opacity-40',
              recording && 'ring-8 ring-danger/20',
            )}
          >
            {recording ? <Square size={30} fill="currentColor" /> : <Mic size={36} />}
            {recording && <span className="absolute inset-0 animate-ping rounded-full bg-danger/25" />}
          </button>
          <p className={cx('mt-3 text-sm', recording ? 'font-medium text-danger-ink' : 'text-muted')}>
            {recorder.state === 'unsupported'
              ? 'This browser can’t record audio. Open the link in Chrome or Safari over HTTPS.'
              : recorder.state === 'denied'
                ? 'Microphone access was blocked. Allow it in your browser settings.'
                : recording
                  ? `Listening… ${fmtTime(recorder.elapsed)}`
                  : mode === 'field'
                    ? targetField
                      ? `Tap to speak: ${targetField.label}`
                      : 'All fields have values'
                    : 'Tap to speak'}
          </p>
        </div>

        {latestTranscript && (
          <blockquote className="mt-4 rounded-lg bg-subtle px-3 py-2 text-sm text-ink/90">“{latestTranscript}”</blockquote>
        )}

        {mode === 'full' &&
          fullModeErrors.map((u) => (
            <button
              key={u.seq}
              onClick={() => s.retry(u)}
              disabled={!u.blob}
              className="mt-2 flex w-full items-center gap-2 rounded-lg bg-danger-bg px-3 py-2 text-left text-sm text-danger-ink"
            >
              <AlertCircle size={16} /> {u.error ?? 'Failed'}
            </button>
          ))}
      </Card>

      {mode === 'field' && (
        <Card className="mt-3 py-1">
          {s.fields.map((f) => (
            <FieldRow
              key={f.id}
              label={f.label}
              active={f.field_key === target}
              onClick={() => {
                const st = statusOf(f);
                if (st.kind === 'error' && st.utt.blob) s.retry(st.utt);
                else if (!recording) setTarget(f.field_key);
              }}
            >
              <StatusMarker field={f} status={statusOf(f)} />
            </FieldRow>
          ))}
        </Card>
      )}

      <Button className="mt-3 w-full" onClick={() => showView('review')}>
        Check before sending · {filledCount}/{s.fields.length}
        <ChevronRight size={16} />
      </Button>
      {!s.live && <p className="mt-2 text-center text-xs text-muted">Reconnecting…</p>}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto min-h-dvh max-w-md px-4 py-4">{children}</main>;
}

function StatusMarker({ field, status }: { field: SessionField; status: FieldStatus }) {
  switch (status.kind) {
    case 'recording':
      return (
        <span className="inline-flex items-center gap-1.5 text-danger-ink">
          <span className="size-2 animate-pulse rounded-full bg-danger" /> Recording
        </span>
      );
    case 'processing':
      return <Loader2 size={16} className="inline animate-spin text-muted" aria-label="Processing" />;
    case 'error':
      return <Pill tone="danger">Tap to retry</Pill>;
    case 'low':
      return (
        <span className="inline-flex items-center gap-2">
          {displayValue(field, status.value.value)} <Pill tone="warn">Check this</Pill>
        </span>
      );
    case 'filled':
      return (
        <span className="inline-flex items-center gap-1.5">
          <Check size={14} className="text-live-ink" /> {displayValue(field, status.value.value)}
        </span>
      );
    case 'missing':
      return <Pill tone="warn">Say it</Pill>;
    case 'pick':
      return <Pill tone="warn">Pick one</Pill>;
    default:
      return <span className="text-muted">—</span>;
  }
}

function ReviewView({
  fields,
  statusOf,
  sent,
  onBack,
  onEdit,
  onMic,
  recordingKey,
  elapsed,
  onRetry,
  onSend,
}: {
  fields: SessionField[];
  statusOf: (f: SessionField) => FieldStatus;
  sent: boolean;
  onBack: () => void;
  onEdit: (key: string, value: string | null) => Promise<string | null>;
  onMic: (key: string) => void;
  recordingKey: string | null;
  elapsed: number;
  onRetry: (u: LocalUtterance) => void;
  onSend: () => Promise<boolean>;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  return (
    <Card>
      <div className="flex items-center gap-2">
        <button onClick={onBack} aria-label="Back to recording" className="-ml-1 grid size-9 place-items-center rounded-lg hover:bg-subtle">
          <ArrowLeft size={18} />
        </button>
        <h1 className="text-base font-semibold">Check before sending</h1>
      </div>
      <div className="mt-2">
        {fields.map((f) => {
          const st = statusOf(f);
          return (
            <div key={f.id} className="border-b border-line last:border-b-0">
              <FieldRow
                label={f.label}
                sub={st.kind === 'pick' ? `You said “${st.hint.spoken}”` : 'value' in st ? st.value?.source_phrase : undefined}
                onClick={() => {
                  if (st.kind === 'error' && st.utt.blob) onRetry(st.utt);
                  else setEditing(editing === f.field_key ? null : f.field_key);
                }}
              >
                <StatusMarker field={f} status={st} />
              </FieldRow>
              {editing === f.field_key && (
                <ValueEditor
                  field={f}
                  initial={'value' in st ? (st.value?.value ?? null) : null}
                  onCancel={() => setEditing(null)}
                  onSave={async (v) => {
                    const err = await onEdit(f.field_key, v);
                    if (!err) setEditing(null);
                    return err;
                  }}
                  recording={recordingKey === f.field_key}
                  elapsed={elapsed}
                  onMic={() => {
                    const stopping = recordingKey === f.field_key;
                    onMic(f.field_key);
                    // After speaking, close the editor: the row shows a spinner, then the new value.
                    if (stopping) setEditing(null);
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-muted">Tap any value to edit or re-speak it.</p>
      <Button
        className="mt-3 w-full"
        loading={sending}
        disabled={sent}
        onClick={async () => {
          setSending(true);
          await onSend();
          setSending(false);
        }}
      >
        {sent ? (
          <>
            <Check size={16} /> Sent to desktop
          </>
        ) : (
          <>
            <Send size={16} /> Send to desktop
          </>
        )}
      </Button>
    </Card>
  );
}

function ValueEditor({
  field,
  initial,
  onSave,
  onCancel,
  onMic,
  recording,
  elapsed,
}: {
  field: SessionField;
  initial: string | null;
  onSave: (v: string | null) => Promise<string | null>;
  onCancel: () => void;
  onMic: () => void;
  recording: boolean;
  elapsed: number;
}) {
  const [value, setValue] = useState(initial ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputCls = 'min-h-11 w-full rounded-lg border border-line bg-card px-3 text-base focus:border-accent-ink focus:outline-none';

  let input: React.ReactNode;
  if (field.field_type === 'checkbox' && !field.multiple) {
    input = (
      <select className={inputCls} value={value} onChange={(e) => setValue(e.target.value)}>
        <option value="">—</option>
        <option value="true">Yes</option>
        <option value="false">No</option>
      </select>
    );
  } else if (field.field_type === 'checkbox' && field.multiple) {
    const picked = new Set(value.split(/\s*,\s*/).filter(Boolean));
    input = (
      <div className="space-y-1">
        {field.options.map((o) => (
          <label key={o.value} className="flex min-h-9 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={picked.has(o.label)}
              onChange={(e) => {
                const next = new Set(picked);
                if (e.target.checked) next.add(o.label);
                else next.delete(o.label);
                setValue([...next].join(', '));
              }}
            />
            {o.label}
          </label>
        ))}
      </div>
    );
  } else if (field.options.length) {
    input = (
      <select className={inputCls} value={value} onChange={(e) => setValue(e.target.value)}>
        <option value="">—</option>
        {field.options.map((o) => (
          <option key={o.value} value={o.label}>
            {o.label}
          </option>
        ))}
      </select>
    );
  } else if (field.field_type === 'textarea') {
    input = <textarea className={cx(inputCls, 'py-2')} rows={3} value={value} onChange={(e) => setValue(e.target.value)} />;
  } else {
    const type = field.field_type === 'date' ? 'date' : field.field_type === 'email' ? 'email' : field.field_type === 'tel' ? 'tel' : 'text';
    input = <input className={inputCls} type={type} value={value} onChange={(e) => setValue(e.target.value)} autoFocus />;
  }

  return (
    <div className="space-y-2 pb-3">
      {field.choice_hint && (
        <div className="rounded-lg bg-warn-bg/60 px-3 py-2 text-sm">
          <p className="text-warn-ink">
            You said “{field.choice_hint.spoken}”. {HINT_TEXT[field.choice_hint.reason]}
          </p>
          {field.choice_hint.top.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {field.choice_hint.top.map((label) => (
                <button
                  key={label}
                  type="button"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    setError(await onSave(label));
                    setBusy(false);
                  }}
                  className="min-h-10 rounded-lg border border-line bg-card px-3 font-medium text-ink"
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {input}
      {error && <p className="text-xs text-danger-ink">{error}</p>}
      {recording && <p className="text-xs font-medium text-danger-ink">Listening… tap the stop button when done.</p>}
      <div className="flex gap-2">
        <Button
          className="flex-1"
          loading={busy}
          onClick={async () => {
            setBusy(true);
            setError(await onSave(value.trim() ? value : null));
            setBusy(false);
          }}
        >
          Save
        </Button>
        <Button
          onClick={onMic}
          aria-label={recording ? 'Stop recording' : `Speak ${field.label}`}
          className={recording ? 'border-danger text-danger-ink' : ''}
        >
          {recording ? (
            <>
              <Square size={13} fill="currentColor" /> {fmtTime(elapsed)}
            </>
          ) : (
            <Mic size={16} />
          )}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

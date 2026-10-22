'use client';

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, ArrowLeft, Check, ChevronRight, Copy, Loader2, Mic, MonitorX, RotateCcw, Send, Square, WifiOff } from 'lucide-react';
import {
  LOW_CONFIDENCE,
  type ChoiceHint,
  type ChoiceReason,
  type DesktopReport,
  type DesktopState,
  type ResetScope,
  type SessionField,
  type SessionValue,
} from '@vff/shared';
import { MSG } from '@/lib/session-rules';
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
  const [resetOpen, setResetOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

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
  const recordingNow = recorder.state === 'recording';
  const steps = useMemo(() => stepStarts(s.fields), [s.fields]);

  // Fields that appeared on the computer later (the form's next step, or shown by an answer).
  const fieldCount = useRef(0);
  useEffect(() => {
    const added = s.fields.length - fieldCount.current;
    if (fieldCount.current > 0 && added > 0) {
      const step = steps.get(s.fields[s.fields.length - 1].id);
      setNotice(`${added} new ${added === 1 ? 'field' : 'fields'} on the computer${step ? ` (step ${step})` : ''}.`);
    }
    fieldCount.current = s.fields.length;
  }, [s.fields, steps]);

  // Reloading or leaving now would lose the recording, or pieces that are still uploading.
  useEffect(() => {
    if (!recordingNow && processing === 0) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = 'Recording in progress. Leave anyway?';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [recordingNow, processing]);

  async function startOver(scope: ResetScope) {
    if (recorder.state === 'recording') recorder.stop();
    setRecordingTarget(null);
    const err = await s.reset(scope);
    if (err) return err;
    setResetOpen(false);
    setTarget(null);
    setView('record');
    setNotice(scope === 'both' ? 'Cleared here and on the computer. Ready for the next applicant.' : 'Answers cleared. Ready for the next applicant.');
    window.scrollTo(0, 0);
    return null;
  }

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

  // The form tab on the computer was closed: this QR code is finished, nothing can be sent.
  if (s.session?.desktop_state === 'closed') {
    return (
      <Shell>
        <Card>
          <h1 className="flex items-center gap-2 text-base font-semibold text-danger-ink">
            <MonitorX size={18} /> Tab closed
          </h1>
          <p className="mt-2 text-sm text-muted">{MSG.tabClosed.replace(/^Tab closed\. /, '')}</p>
        </Card>
      </Shell>
    );
  }

  const recording = recorder.state === 'recording';
  const targetField = s.fields.find((f) => f.field_key === target);
  const desktop = s.session?.desktop_state ?? 'open';

  const banners = (
    <>
      <DesktopBanner state={desktop} />
      {!s.online && (
        <p className="mb-3 flex items-center gap-2 rounded-lg bg-warn-bg px-3 py-2 text-sm text-warn-ink">
          <WifiOff size={16} className="shrink-0" /> You&apos;re offline. Recordings are sent when you&apos;re back online.
        </p>
      )}
      {notice && (
        <button
          onClick={() => setNotice(null)}
          className="mb-3 flex w-full items-center gap-2 rounded-lg bg-live-bg px-3 py-2 text-left text-sm text-live-ink"
        >
          <Check size={16} className="shrink-0" /> {notice}
        </button>
      )}
    </>
  );

  const startOverSheet = resetOpen && (
    <StartOverSheet count={filledCount} onCancel={() => setResetOpen(false)} onConfirm={startOver} />
  );

  if (view === 'review') {
    return (
      <Shell>
        {banners}
        {startOverSheet}
        <ReviewView
          fields={s.fields}
          statusOf={statusOf}
          sent={s.session?.status === 'filled'}
          desktop={desktop}
          report={s.session?.desktop_report ?? null}
          onBack={() => showView('record')}
          onEdit={s.editValue}
          onMic={micFor}
          recordingKey={recording ? recordingTarget : null}
          elapsed={recorder.elapsed}
          onRetry={s.retry}
          onSend={s.complete}
        />
        {!resetOpen && <StartOverButton onClick={() => setResetOpen(true)} />}
      </Shell>
    );
  }

  return (
    <Shell>
      {banners}
      {startOverSheet}
      <Card>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-base font-semibold">{s.session?.form_name || 'Form'}</h1>
            {/* With several forms open on the computer, the site helps check this is the right QR. */}
            {hostOf(s.session?.page_url) && <p className="truncate text-xs text-muted">{hostOf(s.session?.page_url)}</p>}
          </div>
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
          <p className={cx('mt-3 text-center text-sm', recording ? 'font-medium text-danger-ink' : 'text-muted')}>
            {recorder.state === 'unsupported'
              ? 'This browser can’t record audio. Open the link in Chrome (Android) or Safari (iPhone).'
              : recorder.state === 'denied'
                ? 'Microphone access was blocked.'
                : recording
                  ? `Listening… ${fmtTime(recorder.elapsed)}`
                  : mode === 'field'
                    ? targetField
                      ? `Tap to speak: ${targetField.label}`
                      : 'All fields have values'
                    : 'Tap to speak'}
          </p>
          {recorder.state === 'unsupported' && <CopyLinkButton />}
          {recorder.state === 'denied' && <MicHelp onRetry={toggleMic} />}
          {!recording && recorder.notice && (
            <p className="mt-2 rounded-lg bg-warn-bg px-3 py-2 text-center text-sm text-warn-ink">
              {recorder.notice === 'interrupted'
                ? 'Recording stopped (screen locked, call or app switch). What you said was sent. Tap the mic to continue.'
                : 'Tap, speak, then tap again to stop.'}
            </p>
          )}
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
            <Fragment key={f.id}>
              <StepDivider step={steps.get(f.id)} />
              <FieldRow
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
            </Fragment>
          ))}
        </Card>
      )}

      <Button className="mt-3 w-full" onClick={() => showView('review')}>
        Check before sending · {filledCount}/{s.fields.length}
        <ChevronRight size={16} />
      </Button>
      {!s.live && <p className="mt-2 text-center text-xs text-muted">Reconnecting…</p>}
      {!resetOpen && <StartOverButton onClick={() => setResetOpen(true)} />}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto min-h-dvh max-w-md px-4 py-4">{children}</main>;
}

/**
 * Where each step starts: field id → step number (1, 2, …), only when the form has several steps
 * (fields added later, e.g. a wizard's next page, form the next step).
 */
function stepStarts(fields: SessionField[]): Map<string, number> {
  const out = new Map<string, number>();
  const distinct = [...new Set(fields.map((f) => f.step_index ?? 0))].sort((a, b) => a - b);
  if (distinct.length < 2) return out;
  fields.forEach((f, i) => {
    if (i === 0 || (fields[i - 1].step_index ?? 0) !== (f.step_index ?? 0)) out.set(f.id, distinct.indexOf(f.step_index ?? 0) + 1);
  });
  return out;
}

function StepDivider({ step }: { step: number | undefined }) {
  if (!step) return null;
  return <p className="pt-3 pb-1 text-xs font-semibold tracking-wide text-muted uppercase">Step {step}</p>;
}

function hostOf(url: string | undefined): string {
  try {
    return url ? new URL(url).host : '';
  } catch {
    return '';
  }
}

/** The form tab on the computer moved to another site: speaking is fine, sending isn't. */
function DesktopBanner({ state }: { state: DesktopState }) {
  if (state !== 'moved') return null;
  return (
    <p className="mb-3 flex items-start gap-2 rounded-lg bg-warn-bg px-3 py-2 text-sm text-warn-ink">
      <MonitorX size={16} className="mt-0.5 shrink-0" /> {MSG.tabMoved}
    </p>
  );
}

function StartOverButton({ onClick }: { onClick: () => void }) {
  return (
    <div className="mt-4 text-center">
      <button onClick={onClick} className="inline-flex min-h-10 items-center gap-1.5 px-3 text-sm text-muted hover:text-ink">
        <RotateCcw size={14} /> Start over
      </button>
    </div>
  );
}

/** Start over: the sheet itself is the confirmation (it says it can't be undone). */
function StartOverSheet({
  count,
  onCancel,
  onConfirm,
}: {
  count: number;
  onCancel: () => void;
  onConfirm: (scope: ResetScope) => Promise<string | null>;
}) {
  const [busy, setBusy] = useState<ResetScope | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = async (scope: ResetScope) => {
    setBusy(scope);
    setError(await onConfirm(scope));
    setBusy(null);
  };
  return (
    <Card className="mb-3 border-danger/40">
      <h2 className="flex items-center gap-2 text-base font-semibold">
        <RotateCcw size={16} /> Start over
      </h2>
      <p className="mt-1 text-sm text-muted">
        Clear all {count} {count === 1 ? 'answer' : 'answers'}? This can&apos;t be undone.
      </p>
      <div className="mt-3 space-y-2">
        <Button className="w-full" loading={busy === 'phone'} disabled={!!busy} onClick={() => run('phone')}>
          Clear phone answers
        </Button>
        <Button className="w-full" loading={busy === 'both'} disabled={!!busy} onClick={() => run('both')}>
          Clear phone and computer form
        </Button>
        <Button variant="ghost" className="w-full" disabled={!!busy} onClick={onCancel}>
          Cancel
        </Button>
      </div>
      {error && <p className="mt-2 text-xs text-danger-ink">{error}</p>}
    </Card>
  );
}

/** In-app browsers (WhatsApp, Lens…) can't record: copy the link to open it in Chrome or Safari. */
function CopyLinkButton() {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      className="mt-3"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(window.location.href);
          setCopied(true);
        } catch {
          window.prompt('Copy this link and open it in Chrome:', window.location.href);
        }
      }}
    >
      <Copy size={14} /> {copied ? 'Link copied. Paste it in Chrome' : 'Copy link'}
    </Button>
  );
}

function MicHelp({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="mt-2 w-full rounded-lg bg-subtle px-3 py-2 text-sm text-ink/90">
      <p className="font-medium">To allow the microphone:</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted">
        <li>Chrome (Android): tap the icon left of the address, then Permissions → Microphone → Allow.</li>
        <li>Safari (iPhone): tap “aA” in the address bar, then Website Settings → Microphone → Allow.</li>
      </ul>
      <Button className="mt-2 w-full" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
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
  desktop,
  report,
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
  desktop: DesktopState;
  report: DesktopReport | null;
  onBack: () => void;
  onEdit: (key: string, value: string | null) => Promise<string | null>;
  onMic: (key: string) => void;
  recordingKey: string | null;
  elapsed: number;
  onRetry: (u: LocalUtterance) => void;
  onSend: () => Promise<string | null>;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [confirmMissing, setConfirmMissing] = useState(false);
  const [sends, setSends] = useState(0);
  const ack = useDesktopAck(sent, report, sends);
  const steps = useMemo(() => stepStarts(fields), [fields]);

  const missing = fields.filter((f) => ['missing', 'pick'].includes(statusOf(f).kind)).length;
  // Sent, but the computer didn't fill (asleep, or the form page changed): allow sending again.
  const canResend = ack.kind === 'timeout' || ack.kind === 'nothing';
  const send = async () => {
    setConfirmMissing(false);
    setSending(true);
    const err = await onSend();
    setSendError(err);
    if (!err) setSends((n) => n + 1);
    setSending(false);
  };

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
              <StepDivider step={steps.get(f.id)} />
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
      <p className="mt-3 text-xs text-muted">Tap any value to edit or re-speak it. Captcha and OTP: type them on the computer.</p>
      {confirmMissing ? (
        <div className="mt-3 rounded-lg bg-warn-bg px-3 py-2">
          <p className="text-sm text-warn-ink">
            {missing} required {missing === 1 ? 'field is' : 'fields are'} empty. Send anyway?
          </p>
          <div className="mt-2 flex gap-2">
            <Button className="flex-1" onClick={send}>
              Send anyway
            </Button>
            <Button variant="ghost" onClick={() => setConfirmMissing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button
          className="mt-3 w-full"
          loading={sending}
          disabled={desktop !== 'open' || (sent && !canResend)}
          onClick={() => (missing && !sent ? setConfirmMissing(true) : send())}
        >
          {sent && !canResend ? (
            <>
              <Check size={16} /> Sent to desktop
            </>
          ) : (
            <>
              <Send size={16} /> {sent ? 'Send again' : 'Send to desktop'}
            </>
          )}
        </Button>
      )}
      {desktop === 'moved' && <p className="mt-2 text-xs text-warn-ink">{MSG.tabMoved}</p>}
      {sendError && <p className="mt-2 text-xs text-danger-ink">{sendError}</p>}
      {sent && !sendError && <AckLine ack={ack} />}
    </Card>
  );
}

type Ack =
  | { kind: 'none' }
  | { kind: 'waiting' }
  | { kind: 'timeout' }
  | { kind: 'filled'; report: DesktopReport }
  | { kind: 'nothing'; report: DesktopReport };

const ACK_TIMEOUT_MS = 15_000;

/**
 * After "Send to desktop": the extension reports each full fill (desktop_report). A new report means the
 * computer filled the form; none within 15 s means the browser is asleep, closed, or the extension is off.
 */
function useDesktopAck(sent: boolean, report: DesktopReport | null, sends: number): Ack {
  /** The report that was current when Send was pressed (undefined = not tracking, e.g. after a reload). */
  const sentWith = useRef<string | null | undefined>(undefined);
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    setTimedOut(false);
    if (!sent) {
      sentWith.current = undefined;
      return;
    }
    // Each press (first send or Send again) waits for a report newer than the one shown now. Already
    // sent before this page loaded: any report counts.
    if (sends > 0) sentWith.current = report?.at ?? null;
    else if (sentWith.current === undefined) sentWith.current = null;
    const t = setTimeout(() => setTimedOut(true), ACK_TIMEOUT_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sent, sends]);

  if (!sent) return { kind: 'none' };
  if (report && report.at !== sentWith.current) {
    return report.filled === 0 && report.total > 0 ? { kind: 'nothing', report } : { kind: 'filled', report };
  }
  return timedOut ? { kind: 'timeout' } : { kind: 'waiting' };
}

function AckLine({ ack }: { ack: Ack }) {
  switch (ack.kind) {
    case 'waiting':
      return (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
          <Loader2 size={12} className="animate-spin" /> Filling on the computer…
        </p>
      );
    case 'filled':
      return (
        <p className="mt-2 text-xs text-live-ink">
          Filled on computer ✓ {ack.report.filled}/{ack.report.total}
          {ack.report.skipped > 0 && <span className="text-warn-ink"> · {ack.report.skipped} not filled, check them there</span>}
        </p>
      );
    case 'nothing':
      return (
        <p className="mt-2 text-xs text-danger-ink">
          Nothing could be filled on the computer. The form page may have changed. Open it again on the computer, then Send again.
        </p>
      );
    case 'timeout':
      return (
        <p className="mt-2 text-xs text-danger-ink">
          The computer hasn&apos;t responded. Is the browser open with the form tab? Then Send again.
        </p>
      );
    default:
      return null;
  }
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

'use client';

import { Fragment, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, ArrowLeft, Check, ChevronRight, Copy, Loader2, Mic, MonitorX, RotateCcw, Send, Square, WifiOff } from 'lucide-react';
import {
  effectiveFileRules,
  LOW_CONFIDENCE,
  type ChoiceHint,
  type FieldFile,
  type DesktopReport,
  type DesktopState,
  type ResetScope,
  type SessionField,
  type SessionValue,
} from '@vff/shared';
import { initialLang, saveLang, translate, type Lang } from '@/lib/i18n';
import { Button, Card, FieldRow, Pill, cx } from '@/components/ui';
import { FileSheet, FileStatusMarker } from './file-upload';
import { LangCtx, useI18n, type T } from './lang';
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
  | { kind: 'pick'; hint: ChoiceHint; value?: SessionValue }
  /** Upload field (photo / PDF): filled from the phone's camera or files, not by voice. */
  | { kind: 'file'; file?: FieldFile };

const isFile = (f: SessionField) => f.field_type === 'file';
/** Needs the user's attention before sending: required and empty, a dropdown to pick, a refused upload. */
const needsInput = (f: SessionField, st: FieldStatus) =>
  st.kind === 'missing' || st.kind === 'pick' || (st.kind === 'file' && ((!st.file && f.required) || st.file?.status === 'rejected'));

function displayValue(f: SessionField, v: string | null | undefined, t: T): string {
  if (!v) return '';
  if (f.field_type === 'checkbox' && !f.multiple) return v === 'true' ? t('yes') : v === 'false' ? t('no') : v;
  return v;
}

function fmtTime(s: number) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function VoiceSession({ code }: { code: string }) {
  const [lang, setLangState] = useState<Lang>('en');
  // Read after mount (localStorage / phone language) so server and client render the same first.
  useEffect(() => setLangState(initialLang()), []);
  const setLang = (l: Lang) => {
    setLangState(l);
    saveLang(l);
  };
  return (
    <LangCtx.Provider value={{ lang, setLang }}>
      <SessionScreen code={code} />
    </LangCtx.Provider>
  );
}

function SessionScreen({ code }: { code: string }) {
  const s = useVoiceSession(code);
  const { t, label, srv } = useI18n();
  const [mode, setMode] = useState<Mode>('full');
  const [view, setView] = useState<View>('record');
  const [target, setTarget] = useState<string | null>(null);
  const [recordingTarget, setRecordingTarget] = useState<string | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  /** Bumped when the user says "send it": the review page asks before sending. */
  const [askSend, setAskSend] = useState(0);
  /** Upload field whose photo / file sheet is open. */
  const [fileSheet, setFileSheet] = useState<string | null>(null);

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
    if (isFile(f)) return { kind: 'file', file: s.files.get(f.id) };
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
  const filledCount = s.fields.filter((f) =>
    isFile(f) ? ['uploaded', 'filled'].includes(s.files.get(f.id)?.status ?? '') : !!s.valueByKey.get(f.field_key)?.value,
  ).length;
  const fileFields = s.fields.filter(isFile);
  const voiceFields = s.fields.filter((f) => !isFile(f));
  const recordingNow = recorder.state === 'recording';
  const steps = useMemo(() => stepStarts(s.fields), [s.fields]);

  // Fields that appeared on the computer later (the form's next step, or shown by an answer).
  const fieldCount = useRef(0);
  useEffect(() => {
    const added = s.fields.length - fieldCount.current;
    if (fieldCount.current > 0 && added > 0) {
      const step = steps.get(s.fields[s.fields.length - 1].id);
      setNotice(t(added === 1 ? 'newFieldsOne' : 'newFieldsMany', { n: added, step: step ? t('stepSuffix', { n: step }) : '' }));
    }
    fieldCount.current = s.fields.length;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.fields, steps]);

  // Reloading or leaving now would lose the recording, or pieces that are still uploading.
  useEffect(() => {
    if (!recordingNow && processing === 0) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = t('beforeUnload');
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordingNow, processing]);

  // A spoken command never acts by itself: it opens the same confirmation a tap would.
  useEffect(() => {
    const c = s.command;
    if (!c) return;
    s.clearCommand();
    if (c.command === 'start_over') {
      setResetOpen(true);
      window.scrollTo(0, 0);
    } else if (c.command === 'send') {
      showView('review');
      setAskSend((n) => n + 1);
    } else {
      const left = s.fields.filter((f) => needsInput(f, statusOf(f))).map(label);
      setNotice(left.length ? t('whatsLeftSome', { list: left.join(', ') }) : t('whatsLeftNone'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.command]);

  async function startOver(scope: ResetScope) {
    if (recorder.state === 'recording') recorder.stop();
    setRecordingTarget(null);
    const err = await s.reset(scope);
    if (err) return srv(err);
    setResetOpen(false);
    setTarget(null);
    setView('record');
    setNotice(t(scope === 'both' ? 'clearedBoth' : 'clearedPhone'));
    window.scrollTo(0, 0);
    return null;
  }

  /** Next field (in form order) that still needs a value, after `from`. */
  const nextEmpty = (from: string | null) => {
    // Upload fields are filled from the camera, never spoken: field-by-field skips them.
    const i = from ? voiceFields.findIndex((f) => f.field_key === from) : -1;
    const rest = [...voiceFields.slice(i + 1), ...voiceFields.slice(0, Math.max(i, 0))];
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
    const tgt = mode === 'field' ? target ?? nextEmpty(null) : null;
    if (mode === 'field' && !tgt) return;
    if (tgt !== target) setTarget(tgt);
    const seq = s.takeSeq(); // seq = when the user spoke, not when processing finishes
    // Long recordings are sent in ~28 s pieces, each with the next seq.
    if (await recorder.start(...pieceTags(seq, tgt))) setRecordingTarget(tgt);
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
          <Loader2 size={18} className="animate-spin" /> {t('connecting')}
        </Card>
      </Shell>
    );
  }
  if (s.phase === 'error') {
    return (
      <Shell>
        <Card>
          <h1 className="flex items-center gap-2 text-base font-semibold">
            <AlertCircle size={18} className="text-danger" /> {t('cantContinue')}
          </h1>
          <p className="mt-2 text-sm text-muted">{srv(s.fatal)}</p>
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
            <MonitorX size={18} /> {t('tabClosedTitle')}
          </h1>
          <p className="mt-2 text-sm text-muted">{t('tabClosedBody')}</p>
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
          <WifiOff size={16} className="shrink-0" /> {t('offline')}
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

  const sheetField = fileSheet ? s.fields.find((f) => f.field_key === fileSheet) : undefined;
  const startOverSheet = (
    <>
      {resetOpen && <StartOverSheet count={filledCount} onCancel={() => setResetOpen(false)} onConfirm={startOver} />}
      {sheetField && (
        <FileSheet
          key={sheetField.id}
          field={sheetField}
          rules={effectiveFileRules(sheetField)}
          file={s.files.get(sheetField.id)}
          onUpload={(file, pages) => s.uploadFile(sheetField.field_key, file, pages)}
          onClose={() => setFileSheet(null)}
        />
      )}
    </>
  );
  const openFile = (f: SessionField) => {
    if (recorder.state === 'recording') recorder.stop();
    setFileSheet(f.field_key);
    window.scrollTo(0, 0);
  };

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
          askSend={askSend}
          onFile={openFile}
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
            <h1 className="text-base font-semibold">{s.session?.form_name || t('form')}</h1>
            {/* With several forms open on the computer, the site helps check this is the right QR. */}
            {hostOf(s.session?.page_url) && <p className="truncate text-xs text-muted">{hostOf(s.session?.page_url)}</p>}
          </div>
          {processing > 0 && (
            <Pill tone="neutral">
              <Loader2 size={12} className="mr-1 animate-spin" /> {t('processing', { n: processing })}
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
              {t(m === 'full' ? 'modeFull' : 'modeField')}
            </button>
          ))}
        </div>

        <div className="mt-6 flex flex-col items-center">
          <button
            onClick={toggleMic}
            disabled={recorder.state === 'unsupported' || (mode === 'field' && !target && !recording)}
            aria-label={t(recording ? 'stopRec' : 'startRec')}
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
              ? t('unsupported')
              : recorder.state === 'denied'
                ? t('micBlocked')
                : recording
                  ? t('listening', { time: fmtTime(recorder.elapsed) })
                  : mode === 'field'
                    ? targetField
                      ? t('tapToSpeakField', { label: label(targetField) })
                      : t('allFilled')
                    : t('tapToSpeak')}
          </p>
          {recorder.state === 'unsupported' && <CopyLinkButton />}
          {recorder.state === 'denied' && <MicHelp onRetry={toggleMic} />}
          {!recording && recorder.notice && (
            <p className="mt-2 rounded-lg bg-warn-bg px-3 py-2 text-center text-sm text-warn-ink">
              {t(recorder.notice === 'interrupted' ? 'interrupted' : 'tooShort')}
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
              <AlertCircle size={16} /> {u.error ? srv(u.error) : t('failed')}
            </button>
          ))}
      </Card>

      {fileFields.length > 0 && (
        <Card className="mt-3 py-1">
          <p className="pt-3 pb-1 text-xs font-semibold tracking-wide text-muted uppercase">{t('files')}</p>
          {fileFields.map((f) => (
            <FieldRow key={f.id} label={label(f)} onClick={() => openFile(f)}>
              <FileStatusMarker field={f} file={s.files.get(f.id)} />
            </FieldRow>
          ))}
        </Card>
      )}

      {mode === 'field' && (
        <Card className="mt-3 py-1">
          {voiceFields.map((f) => (
            <Fragment key={f.id}>
              <StepDivider step={steps.get(f.id)} />
              <FieldRow
                label={label(f)}
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
        {t('checkBeforeSending')} · {filledCount}/{s.fields.length}
        <ChevronRight size={16} />
      </Button>
      {!s.live && <p className="mt-2 text-center text-xs text-muted">{t('reconnecting')}</p>}
      {!resetOpen && <StartOverButton onClick={() => setResetOpen(true)} />}
    </Shell>
  );
}

/** Page frame, with the தமிழ் / English switch. */
function Shell({ children }: { children: React.ReactNode }) {
  const { lang, setLang } = useContext(LangCtx);
  return (
    <main className="mx-auto min-h-dvh max-w-md px-4 py-4">
      <div className="mb-2 flex justify-end">
        <button
          onClick={() => setLang(lang === 'ta' ? 'en' : 'ta')}
          className="min-h-8 rounded-md border border-line px-2.5 text-xs text-muted hover:text-ink"
          lang={lang === 'ta' ? 'en' : 'ta'}
        >
          {translate(lang, 'switchLang')}
        </button>
      </div>
      {children}
    </main>
  );
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
  const { t } = useI18n();
  if (!step) return null;
  return <p className="pt-3 pb-1 text-xs font-semibold tracking-wide text-muted uppercase">{t('step', { n: step })}</p>;
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
  const { t } = useI18n();
  if (state !== 'moved') return null;
  return (
    <p className="mb-3 flex items-start gap-2 rounded-lg bg-warn-bg px-3 py-2 text-sm text-warn-ink">
      <MonitorX size={16} className="mt-0.5 shrink-0" /> {t('srvTabMoved')}
    </p>
  );
}

function StartOverButton({ onClick }: { onClick: () => void }) {
  const { t } = useI18n();
  return (
    <div className="mt-4 text-center">
      <button onClick={onClick} className="inline-flex min-h-10 items-center gap-1.5 px-3 text-sm text-muted hover:text-ink">
        <RotateCcw size={14} /> {t('startOver')}
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
  const { t } = useI18n();
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
        <RotateCcw size={16} /> {t('startOver')}
      </h2>
      <p className="mt-1 text-sm text-muted">{t(count === 1 ? 'clearOne' : 'clearMany', { n: count })}</p>
      <div className="mt-3 space-y-2">
        <Button className="w-full" loading={busy === 'phone'} disabled={!!busy} onClick={() => run('phone')}>
          {t('clearPhone')}
        </Button>
        <Button className="w-full" loading={busy === 'both'} disabled={!!busy} onClick={() => run('both')}>
          {t('clearBoth')}
        </Button>
        <Button variant="ghost" className="w-full" disabled={!!busy} onClick={onCancel}>
          {t('cancel')}
        </Button>
      </div>
      {error && <p className="mt-2 text-xs text-danger-ink">{error}</p>}
    </Card>
  );
}

/** In-app browsers (WhatsApp, Lens…) can't record: copy the link to open it in Chrome or Safari. */
function CopyLinkButton() {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  return (
    <Button
      className="mt-3"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(window.location.href);
          setCopied(true);
        } catch {
          window.prompt(t('copyPrompt'), window.location.href);
        }
      }}
    >
      <Copy size={14} /> {t(copied ? 'linkCopied' : 'copyLink')}
    </Button>
  );
}

function MicHelp({ onRetry }: { onRetry: () => void }) {
  const { t } = useI18n();
  return (
    <div className="mt-2 w-full rounded-lg bg-subtle px-3 py-2 text-sm text-ink/90">
      <p className="font-medium">{t('micHelpTitle')}</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted">
        <li>{t('micHelpChrome')}</li>
        <li>{t('micHelpSafari')}</li>
      </ul>
      <Button className="mt-2 w-full" onClick={onRetry}>
        {t('tryAgain')}
      </Button>
    </div>
  );
}

function StatusMarker({ field, status }: { field: SessionField; status: FieldStatus }) {
  const { t } = useI18n();
  switch (status.kind) {
    case 'recording':
      return (
        <span className="inline-flex items-center gap-1.5 text-danger-ink">
          <span className="size-2 animate-pulse rounded-full bg-danger" /> {t('recordingPill')}
        </span>
      );
    case 'processing':
      return <Loader2 size={16} className="inline animate-spin text-muted" aria-label={t('processingLabel')} />;
    case 'error':
      return <Pill tone="danger">{t('tapToRetry')}</Pill>;
    case 'low':
      return (
        <span className="inline-flex items-center gap-2">
          {displayValue(field, status.value.value, t)} <Pill tone="warn">{t('checkThis')}</Pill>
        </span>
      );
    case 'filled':
      return (
        <span className="inline-flex items-center gap-1.5">
          <Check size={14} className="text-live-ink" /> {displayValue(field, status.value.value, t)}
        </span>
      );
    case 'missing':
      return <Pill tone="warn">{t('sayIt')}</Pill>;
    case 'pick':
      return <Pill tone="warn">{t('pickOne')}</Pill>;
    case 'file':
      return <FileStatusMarker field={field} file={status.file} />;
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
  askSend,
  onFile,
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
  /** Bumped when the user said "send it": ask before sending. */
  askSend: number;
  /** Opens the photo / file sheet of an upload field. */
  onFile: (f: SessionField) => void;
  onBack: () => void;
  onEdit: (key: string, value: string | null) => Promise<string | null>;
  onMic: (key: string) => void;
  recordingKey: string | null;
  elapsed: number;
  onRetry: (u: LocalUtterance) => void;
  onSend: () => Promise<string | null>;
}) {
  const { t, label, srv } = useI18n();
  const [editing, setEditing] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  /** Asking before sending: required fields are empty, or the send was spoken. */
  const [confirm, setConfirm] = useState<'missing' | 'voice' | null>(null);
  const [sends, setSends] = useState(0);
  const ack = useDesktopAck(sent, report, sends);
  const steps = useMemo(() => stepStarts(fields), [fields]);

  const missing = fields.filter((f) => needsInput(f, statusOf(f))).length;
  // Sent, but the computer didn't fill (asleep, or the form page changed): allow sending again.
  const canResend = ack.kind === 'timeout' || ack.kind === 'nothing';
  const canSend = desktop === 'open' && (!sent || canResend);
  const send = async () => {
    setConfirm(null);
    setSending(true);
    const err = await onSend();
    setSendError(err ? srv(err) : null);
    if (!err) setSends((n) => n + 1);
    setSending(false);
  };

  useEffect(() => {
    if (askSend > 0 && canSend) setConfirm('voice');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [askSend]);

  return (
    <Card>
      <div className="flex items-center gap-2">
        <button onClick={onBack} aria-label={t('backToRecording')} className="-ml-1 grid size-9 place-items-center rounded-lg hover:bg-subtle">
          <ArrowLeft size={18} />
        </button>
        <h1 className="text-base font-semibold">{t('checkBeforeSending')}</h1>
      </div>
      <div className="mt-2">
        {fields.map((f) => {
          const st = statusOf(f);
          return (
            <div key={f.id} className="border-b border-line last:border-b-0">
              <StepDivider step={steps.get(f.id)} />
              <FieldRow
                label={label(f)}
                sub={st.kind === 'pick' ? t('youSaid', { text: st.hint.spoken }) : 'value' in st ? st.value?.source_phrase : undefined}
                onClick={() => {
                  if (isFile(f)) onFile(f);
                  else if (st.kind === 'error' && st.utt.blob) onRetry(st.utt);
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
                    return err ? srv(err) : null;
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
      <p className="mt-3 text-xs text-muted">{t('tapToEdit')}</p>
      {confirm ? (
        <div className="mt-3 rounded-lg bg-warn-bg px-3 py-2">
          <p className="text-sm text-warn-ink">
            {missing ? t(missing === 1 ? 'missingOne' : 'missingMany', { n: missing }) : t('voiceSendConfirm')}
          </p>
          <div className="mt-2 flex gap-2">
            <Button className="flex-1" onClick={send}>
              {t(missing ? 'sendAnyway' : 'sendNow')}
            </Button>
            <Button variant="ghost" onClick={() => setConfirm(null)}>
              {t('cancel')}
            </Button>
          </div>
        </div>
      ) : (
        <Button
          className="mt-3 w-full"
          loading={sending}
          disabled={!canSend}
          onClick={() => (missing && !sent ? setConfirm('missing') : send())}
        >
          {sent && !canResend ? (
            <>
              <Check size={16} /> {t('sentToDesktop')}
            </>
          ) : (
            <>
              <Send size={16} /> {t(sent ? 'sendAgain' : 'sendToDesktop')}
            </>
          )}
        </Button>
      )}
      {desktop === 'moved' && <p className="mt-2 text-xs text-warn-ink">{t('srvTabMoved')}</p>}
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
    const timer = setTimeout(() => setTimedOut(true), ACK_TIMEOUT_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sent, sends]);

  if (!sent) return { kind: 'none' };
  if (report && report.at !== sentWith.current) {
    return report.filled === 0 && report.total > 0 ? { kind: 'nothing', report } : { kind: 'filled', report };
  }
  return timedOut ? { kind: 'timeout' } : { kind: 'waiting' };
}

function AckLine({ ack }: { ack: Ack }) {
  const { t } = useI18n();
  switch (ack.kind) {
    case 'waiting':
      return (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
          <Loader2 size={12} className="animate-spin" /> {t('ackWaiting')}
        </p>
      );
    case 'filled':
      return (
        <p className="mt-2 text-xs text-live-ink">
          {t('ackFilled', { filled: ack.report.filled, total: ack.report.total })}
          {ack.report.skipped > 0 && <span className="text-warn-ink">{t('ackSkipped', { n: ack.report.skipped })}</span>}
        </p>
      );
    case 'nothing':
      return <p className="mt-2 text-xs text-danger-ink">{t('ackNothing')}</p>;
    case 'timeout':
      return <p className="mt-2 text-xs text-danger-ink">{t('ackTimeout')}</p>;
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
  const { t, label } = useI18n();
  const [value, setValue] = useState(initial ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputCls = 'min-h-11 w-full rounded-lg border border-line bg-card px-3 text-base focus:border-accent-ink focus:outline-none';

  let input: React.ReactNode;
  if (field.field_type === 'checkbox' && !field.multiple) {
    input = (
      <select className={inputCls} value={value} onChange={(e) => setValue(e.target.value)}>
        <option value="">—</option>
        <option value="true">{t('yes')}</option>
        <option value="false">{t('no')}</option>
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
            {t('youSaid', { text: field.choice_hint.spoken })}. {t(`hint_${field.choice_hint.reason}`)}
          </p>
          {field.choice_hint.top.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {field.choice_hint.top.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    setError(await onSave(opt));
                    setBusy(false);
                  }}
                  className="min-h-10 rounded-lg border border-line bg-card px-3 font-medium text-ink"
                >
                  {opt}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {input}
      {error && <p className="text-xs text-danger-ink">{error}</p>}
      {recording && <p className="text-xs font-medium text-danger-ink">{t('listeningStop')}</p>}
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
          {t('save')}
        </Button>
        <Button
          onClick={onMic}
          aria-label={recording ? t('stopRec') : t('speakField', { label: label(field) })}
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
          {t('cancel')}
        </Button>
      </div>
    </div>
  );
}

'use client';

import { Fragment, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Camera,
  Check,
  Copy,
  Globe,
  Loader2,
  Mic,
  MonitorX,
  MoreHorizontal,
  Paperclip,
  Pencil,
  RotateCcw,
  Send,
  Square,
  WifiOff,
} from 'lucide-react';
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
import { Button, Card, Pill, cx } from '@/components/ui';
import { FileSheet, FileStatusMarker } from './file-upload';
import { LangCtx, useI18n, type T } from './lang';
import { sendWatermark, unsentChanges } from './send-state';
import { useRecorder } from './use-recorder';
import { useVoiceSession, type LocalUtterance } from './use-voice-session';

/**
 * The phone page: one page shows every field live while the user speaks. The big mic at the bottom
 * takes speech for any fields, each row's mic takes speech for that field only, and its pen types it.
 * Send to desktop sits next to the big mic.
 */

type PieceTag = { seq: number; target: string | null; recordingId: string; part: number };

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
/** Required and still empty, a dropdown to pick, a refused upload: sending would leave a gap. */
const needsInput = (f: SessionField, st: FieldStatus) =>
  st.kind === 'missing' || st.kind === 'pick' || (st.kind === 'file' && ((!st.file && f.required) || st.file?.status === 'rejected'));
/** Worth a look before sending: the gaps above, plus doubtful values and recordings that failed. */
const needsAttention = (f: SessionField, st: FieldStatus) => needsInput(f, st) || st.kind === 'low' || st.kind === 'error';

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
  /** The field a row mic is recording into (null: the big mic, speech for any fields). */
  const [recordingTarget, setRecordingTarget] = useState<string | null>(null);
  /** Field whose typing box (pen) is open. */
  const [editing, setEditing] = useState<string | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  /** Bumped when the user says "send it": the bottom bar asks before sending. */
  const [askSend, setAskSend] = useState(0);
  /** Which "needs you" field the chip goes to next (each tap goes to the next one). */
  const nextAttention = useRef(0);
  /** Upload field whose photo / file sheet is open. */
  const [fileSheet, setFileSheet] = useState<string | null>(null);
  /** Newest answer / upload time at the last Send (server clock): anything newer is "not sent yet". */
  const [sentUpTo, setSentUpToState] = useState<number | null>(null);
  const sentKey = `vff:sent:${code}`;
  useEffect(() => {
    try {
      const v = Number(sessionStorage.getItem(sentKey));
      if (v) setSentUpToState(v);
    } catch {
      /* storage blocked: the computer's last fill time is used instead */
    }
  }, [sentKey]);
  const setSentUpTo = (v: number | null) => {
    setSentUpToState(v);
    try {
      if (v) sessionStorage.setItem(sentKey, String(v));
      else sessionStorage.removeItem(sentKey);
    } catch {
      /* storage blocked */
    }
  };

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

  const recorder = useRecorder((blob, { tag, durationMs }) => {
    const { seq, target, recordingId, part } = tag as PieceTag;
    s.sendUtterance(blob, target, seq, { recordingId, part }, durationMs);
  });
  const recording = recorder.state === 'recording';

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
    if (recording && recordingTarget === f.field_key) return { kind: 'recording' };
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
  /** Whole-form recordings the server couldn't use (no field of their own to show the error on). */
  const failedSpeech = [...s.utterances.values()].filter((u) => u.status === 'error' && !u.target_field_key).sort((a, b) => b.seq - a.seq);
  const latestTranscript = [...s.utterances.values()]
    .filter((u) => u.transcript)
    .sort((a, b) => b.seq - a.seq)[0]?.transcript;
  const filledCount = s.fields.filter((f) =>
    isFile(f) ? ['uploaded', 'filled'].includes(s.files.get(f.id)?.status ?? '') : !!s.valueByKey.get(f.field_key)?.value,
  ).length;
  const steps = useMemo(() => stepStarts(s.fields), [s.fields]);

  const desktop = s.session?.desktop_state ?? 'open';
  const sent = s.session?.status === 'filled';
  const resetSeq = s.session?.reset_seq ?? 0;
  const values = [...s.valueByKey.values()];
  const files = [...s.files.values()];
  /** After a Send: answers / uploads changed since then (they can be sent again). */
  const unsent = sent ? unsentChanges(values, files, resetSeq, sentUpTo, s.session?.desktop_report?.at) : 0;
  const send = useSend({
    fields: s.fields,
    statusOf,
    sent,
    unsent,
    desktop,
    report: s.session?.desktop_report ?? null,
    askSend,
    onSend: async () => {
      // What this Send covers: anything newer afterwards counts as "not sent yet".
      const mark = sendWatermark(values, files, resetSeq);
      const err = await s.complete();
      if (!err) setSentUpTo(mark || Date.now());
      return err;
    },
  });

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
    if (!recording && processing === 0) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = t('beforeUnload');
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording, processing]);

  // A spoken command never acts by itself: it opens the same confirmation a tap would.
  useEffect(() => {
    const c = s.command;
    if (!c) return;
    s.clearCommand();
    if (c.command === 'start_over') {
      setResetOpen(true);
      window.scrollTo(0, 0);
    } else if (c.command === 'send') {
      setAskSend((n) => n + 1);
    } else {
      const left = s.fields.filter((f) => needsInput(f, statusOf(f))).map(label);
      setNotice(left.length ? t('whatsLeftSome', { list: left.join(', ') }) : t('whatsLeftNone'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.command]);

  async function startOver(scope: ResetScope) {
    if (recording) recorder.stop();
    setRecordingTarget(null);
    setEditing(null);
    const err = await s.reset(scope);
    if (err) return srv(err);
    setSentUpTo(null);
    setResetOpen(false);
    setNotice(t(scope === 'both' ? 'clearedBoth' : 'clearedPhone'));
    window.scrollTo(0, 0);
    return null;
  }

  /** Big mic: speech for any fields. A second tap (or any mic while recording) stops. */
  async function toggleMic() {
    if (recording) {
      recorder.stop();
      setRecordingTarget(null);
      return;
    }
    setEditing(null);
    const seq = s.takeSeq(); // seq = when the user spoke, not when processing finishes
    // Long recordings are sent in ~28 s pieces, each with the next seq.
    if (await recorder.start(...pieceTags(seq, null))) setRecordingTarget(null);
  }

  /** A row's mic: speech for that one field. */
  async function micFor(fieldKey: string) {
    if (recording) {
      recorder.stop();
      setRecordingTarget(null);
      return;
    }
    setEditing(null);
    const seq = s.takeSeq();
    if (await recorder.start(...pieceTags(seq, fieldKey))) setRecordingTarget(fieldKey);
  }

  const openFile = (f: SessionField) => {
    if (recording) recorder.stop();
    setEditing(null);
    setFileSheet(f.field_key);
    window.scrollTo(0, 0);
  };

  // Back button: closes what is open; otherwise warns once (the next back leaves the page).
  const [leaveWarn, setLeaveWarn] = useState(false);
  useBackGuard(s.phase === 'ready' && !s.replaced, () => {
    if (fileSheet) setFileSheet(null);
    else if (editing) setEditing(null);
    else if (resetOpen) setResetOpen(false);
    else {
      setLeaveWarn(true);
      return false;
    }
    return true;
  });
  useEffect(() => {
    if (!leaveWarn) return;
    const off = () => setLeaveWarn(false);
    window.addEventListener('pointerdown', off, { once: true });
    return () => window.removeEventListener('pointerdown', off);
  }, [leaveWarn]);

  // Another phone took over ("Connect phone again" on the computer): stop listening here.
  useEffect(() => {
    if (s.replaced && recorder.state === 'recording') recorder.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.replaced]);

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
  if (s.replaced) {
    return (
      <Shell>
        <Card>
          <h1 className="flex items-center gap-2 text-base font-semibold">
            <MonitorX size={18} /> {t('replacedTitle')}
          </h1>
          <p className="mt-2 text-sm text-muted">{t('replacedBody')}</p>
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

  const sheetField = fileSheet ? s.fields.find((f) => f.field_key === fileSheet) : undefined;
  const attention = s.fields.filter((f) => needsAttention(f, statusOf(f)));

  /** Banners and sheets shown above the fields. */
  const top = (
    <>
      <DesktopBanner state={desktop} />
      {!s.online && (
        <p className="flex items-center gap-2 rounded-lg bg-warn-bg px-3 py-2 text-sm text-warn-ink">
          <WifiOff size={16} className="shrink-0" /> {t('offline')}
        </p>
      )}
      {notice && (
        <button onClick={() => setNotice(null)} className="flex w-full items-center gap-2 rounded-lg bg-live-bg px-3 py-2 text-left text-sm text-live-ink">
          <Check size={16} className="shrink-0" /> {notice}
        </button>
      )}
      {recorder.state === 'unsupported' && (
        <div className="rounded-lg bg-warn-bg px-3 py-2 text-sm text-warn-ink">
          {t('unsupported')}
          <CopyLinkButton />
        </div>
      )}
      {recorder.state === 'denied' && <MicHelp onRetry={toggleMic} />}
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

  const item = (f: SessionField) => {
    const st = statusOf(f);
    return (
      <FieldItem
        key={f.id}
        field={f}
        status={st}
        elapsed={recorder.elapsed}
        editing={editing === f.field_key}
        onMic={() => micFor(f.field_key)}
        onPen={() => setEditing(editing === f.field_key ? null : f.field_key)}
        onFile={() => openFile(f)}
        onRetry={() => st.kind === 'error' && st.utt.blob && s.retry(st.utt)}
        onSave={async (v) => {
          const err = await s.editValue(f.field_key, v);
          if (!err) setEditing(null);
          return err ? srv(err) : null;
        }}
        onCancel={() => setEditing(null)}
      />
    );
  };

  const menu = <PageMenu onStartOver={() => (setResetOpen(true), window.scrollTo(0, 0))} />;

  return (
    <Page>
      <Header
        title={s.session?.form_name || t('form')}
        subtitle={hostOf(s.session?.page_url)}
        live={s.live}
        menu={menu}
      />
      <div className="flex flex-1 flex-col gap-3 px-4 pt-3 pb-6">
        {top}
        <div>
          {s.fields.map((f, i) => (
            <Fragment key={f.id}>
              <StepDivider step={steps.get(f.id)} />
              {/* Upload fields are listed together under their own heading. */}
              {isFile(f) && (i === 0 || !isFile(s.fields[i - 1])) && <GroupLabel>{t('files')}</GroupLabel>}
              {item(f)}
            </Fragment>
          ))}
        </div>
      </div>
      <BottomBar
        heard={recording && !recordingTarget ? t('listenAll') : latestTranscript ?? null}
        filled={filledCount}
        total={s.fields.length}
        processing={processing}
        attention={attention.length}
        unsent={unsent}
        failed={failedSpeech}
        onRetryFailed={() => failedSpeech.forEach((u) => u.blob && s.retry(u))}
        onAttention={() => {
          if (!attention.length) return;
          const f = attention[nextAttention.current++ % attention.length];
          document.getElementById(`field-${f.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }}
        recording={recording}
        elapsed={recorder.elapsed}
        micDisabled={recorder.state === 'unsupported'}
        notice={
          leaveWarn ? t('backAgainToLeave') : !recording && recorder.notice ? t(recorder.notice === 'interrupted' ? 'interrupted' : 'tooShort') : null
        }
        onMic={toggleMic}
        send={send}
      />
    </Page>
  );
}

/**
 * The phone's back button. The page opens from a QR scan in a fresh tab with no history, so back would
 * close it. After the first tap an extra history entry is added (Android Chrome skips entries added
 * without a tap); back then lands on the page itself and `onBack` decides: true = something was closed,
 * stay (guarded again); false = the user was warned, so the next back really leaves.
 */
function useBackGuard(active: boolean, onBack: () => boolean) {
  const handler = useRef(onBack);
  handler.current = onBack;
  useEffect(() => {
    if (!active) return;
    let armed = false;
    const arm = () => {
      if (armed) return;
      history.pushState({ vffGuard: true }, '');
      armed = true;
    };
    const onPop = () => {
      armed = false;
      if (handler.current()) arm();
    };
    window.addEventListener('pointerdown', arm, true);
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('pointerdown', arm, true);
      window.removeEventListener('popstate', onPop);
    };
  }, [active]);
}

// ---------- layout ----------

/** Full-height page: sticky header, scrolling content, a bar fixed at the bottom. */
function Page({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto flex min-h-dvh max-w-md flex-col">{children}</main>;
}

/** Simple screens (connecting, errors) with the language switch. */
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

function Header({ title, subtitle, live, menu }: { title: string; subtitle?: string; live?: boolean; menu: React.ReactNode }) {
  const { t } = useI18n();
  return (
    <header className="sticky top-0 z-20 flex items-start gap-2 border-b border-line bg-page px-4 pt-3 pb-2">
      <div className="min-w-0 flex-1 pt-1">
        <h1 className="text-[17px] leading-tight font-semibold text-balance">{title}</h1>
        {subtitle && (
          <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-muted">
            {/* With several forms open on the computer, the site helps check this is the right QR. */}
            {subtitle}
            {live === false ? (
              <span>· {t('reconnecting')}</span>
            ) : (
              <span className="size-1.5 shrink-0 rounded-full bg-live-ink" aria-hidden />
            )}
          </p>
        )}
      </div>
      {menu}
    </header>
  );
}

/** ⋯ menu: language and Start over, so the bottom bar keeps just the mic and Send. */
function PageMenu({ onStartOver }: { onStartOver: () => void }) {
  const { lang, setLang } = useContext(LangCtx);
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} aria-label={t('more')} aria-expanded={open} className="grid size-10 place-items-center rounded-lg hover:bg-subtle">
        <MoreHorizontal size={20} />
      </button>
      {open && (
        <div className="absolute top-11 right-0 z-30 flex min-w-52 flex-col rounded-xl border border-line bg-card p-1.5 shadow-lg">
          <button
            onClick={() => (setLang(lang === 'ta' ? 'en' : 'ta'), setOpen(false))}
            className="flex min-h-11 items-center gap-2.5 rounded-lg px-3 text-left text-sm hover:bg-subtle"
          >
            <Globe size={17} /> {translate(lang, 'switchLang')}
          </button>
          <button onClick={() => (onStartOver(), setOpen(false))} className="flex min-h-11 items-center gap-2.5 rounded-lg px-3 text-left text-sm hover:bg-subtle">
            <RotateCcw size={17} /> {t('startOver')}
          </button>
        </div>
      )}
    </div>
  );
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return <p className="pt-4 pb-1 text-[11.5px] font-bold tracking-wider text-muted uppercase">{children}</p>;
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
  return <GroupLabel>{t('step', { n: step })}</GroupLabel>;
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
    <p className="flex items-start gap-2 rounded-lg bg-warn-bg px-3 py-2 text-sm text-warn-ink">
      <MonitorX size={16} className="mt-0.5 shrink-0" /> {t('srvTabMoved')}
    </p>
  );
}

// ---------- field rows ----------

/** One field: label, live value / status, and its own Speak + Type buttons (or Add for uploads). */
function FieldItem({
  field,
  status,
  elapsed,
  editing,
  onMic,
  onPen,
  onFile,
  onRetry,
  onSave,
  onCancel,
}: {
  field: SessionField;
  status: FieldStatus;
  elapsed: number;
  editing: boolean;
  onMic: () => void;
  onPen: () => void;
  onFile: () => void;
  onRetry: () => void;
  onSave: (v: string | null) => Promise<string | null>;
  onCancel: () => void;
}) {
  const { t, label } = useI18n();
  const rec = status.kind === 'recording';
  const file = isFile(field);
  // What was said, when it differs from the value ("nine eight seven…" → 9876…): to check a wrong value.
  const said = 'value' in status ? status.value?.source_phrase?.trim() : null;
  const shown = 'value' in status ? displayValue(field, status.value?.value, t) : '';
  const source = said && said.toLowerCase() !== shown.toLowerCase() ? said : null;
  const actBase = 'flex w-[52px] min-h-[52px] flex-col items-center justify-center gap-0.5 rounded-xl text-[10.5px] font-semibold leading-tight';

  return (
    <div
      id={`field-${field.id}`}
      className={cx('scroll-mt-20 scroll-mb-64 border-b border-line', rec && '-mx-2.5 rounded-xl border-transparent bg-accent-bg px-2.5')}
    >
      <div className="flex items-center gap-2 py-2.5">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1 text-[13px] leading-snug text-muted">
            {file && <Paperclip size={13} className="shrink-0" />}
            <span>
              {label(field)}
              {field.required ? ' *' : ''}
            </span>
          </p>
          <div className="mt-0.5 text-[15.5px] leading-snug font-semibold break-words">
            {rec ? (
              <span className="inline-flex items-center gap-1.5 text-danger-ink">
                <span className="size-2 animate-pulse rounded-full bg-danger" /> {t('listening', { time: fmtTime(elapsed) })}
              </span>
            ) : status.kind === 'error' ? (
              <button onClick={onRetry} className="text-left">
                <Pill tone="danger">{t('tapToRetry')}</Pill>
              </button>
            ) : (
              <StatusMarker field={field} status={status} />
            )}
          </div>
          {status.kind === 'pick' && !editing && <p className="mt-0.5 text-xs text-muted">{t('youSaid', { text: status.hint.spoken })}</p>}
          {source && !rec && <p className="mt-0.5 text-xs text-muted">{t('heard')}: “{source}”</p>}
        </div>
        <div className="flex flex-none gap-1.5">
          {file ? (
            <button onClick={onFile} aria-label={`${t('fileTakePhoto')} · ${label(field)}`} className={cx(actBase, 'bg-accent-bg text-accent-ink')}>
              <Camera size={20} />
              {status.kind === 'file' && status.file ? t('fileReplace') : t('fileAdd')}
            </button>
          ) : (
            <>
              <button
                onClick={onMic}
                aria-label={rec ? t('stopRec') : t('speakField', { label: label(field) })}
                className={cx(actBase, rec ? 'bg-danger text-white' : 'bg-accent-bg text-accent-ink')}
              >
                {rec ? <Square size={18} fill="currentColor" /> : <Mic size={20} />}
                {rec ? t('stop') : t('speak')}
              </button>
              <button
                onClick={onPen}
                aria-label={`${t('type')} · ${label(field)}`}
                aria-expanded={editing}
                className={cx(actBase, 'border-[1.5px] border-accent-ink text-accent-ink', editing ? 'bg-accent-bg' : 'bg-card')}
              >
                <Pencil size={18} />
                {t('type')}
              </button>
            </>
          )}
        </div>
      </div>
      {editing && !file && (
        <ValueEditor field={field} initial={'value' in status ? (status.value?.value ?? null) : null} onSave={onSave} onCancel={onCancel} />
      )}
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
        <span className="inline-flex flex-wrap items-center gap-2">
          {displayValue(field, status.value.value, t)} <Pill tone="warn">{t('checkThis')}</Pill>
        </span>
      );
    case 'filled':
      return (
        <span className="inline-flex items-center gap-1.5">
          <Check size={15} className="shrink-0 text-live-ink" /> {displayValue(field, status.value.value, t)}
        </span>
      );
    case 'missing':
      return <Pill tone="warn">{t('sayIt')}</Pill>;
    case 'pick':
      return <Pill tone="warn">{t('pickOne')}</Pill>;
    case 'file':
      return <FileStatusMarker field={field} file={status.file} />;
    default:
      return <span className="font-normal text-muted">—</span>;
  }
}

// ---------- main page bottom bar ----------

/**
 * Fixed at the bottom: what was heard; filled · processing · needs you · not sent yet; the big mic and
 * Send to desktop, with its confirmation and the computer's reply.
 */
function BottomBar({
  heard,
  filled,
  total,
  processing,
  attention,
  unsent,
  failed,
  onRetryFailed,
  onAttention,
  recording,
  elapsed,
  micDisabled,
  notice,
  onMic,
  send,
}: {
  heard: string | null;
  filled: number;
  total: number;
  processing: number;
  attention: number;
  /** After a Send: changes not sent yet. */
  unsent: number;
  failed: LocalUtterance[];
  onRetryFailed: () => void;
  onAttention: () => void;
  recording: boolean;
  elapsed: number;
  micDisabled: boolean;
  notice: string | null;
  onMic: () => void;
  send: SendState;
}) {
  const { t, srv } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <div className="sticky bottom-0 z-20 flex flex-col gap-2 border-t border-line bg-card px-4 pt-2.5 pb-[calc(12px+env(safe-area-inset-bottom,0px))] shadow-[0_-8px_24px_rgba(0,0,0,0.08)]">
      {heard && (
        <button onClick={() => setOpen((o) => !o)} className={cx('text-left text-[13px] text-muted italic', !open && 'truncate')}>
          {recording ? heard : `${t('heard')}: “${heard}”`}
        </button>
      )}
      {notice && <p className="rounded-lg bg-warn-bg px-3 py-1.5 text-[13px] text-warn-ink">{notice}</p>}
      {failed.length > 0 && (
        <button onClick={onRetryFailed} className="flex items-center gap-1.5 rounded-lg bg-danger-bg px-3 py-1.5 text-left text-[13px] text-danger-ink">
          <AlertCircle size={15} className="shrink-0" />
          {failed.length === 1 && failed[0].error ? srv(failed[0].error) : t('failedRetry', { n: failed.length })}
        </button>
      )}
      <div className="flex flex-wrap items-center gap-2 text-[13.5px]">
        <span className="font-bold tabular-nums">{t('filledCount', { n: filled, total })}</span>
        {processing > 0 && (
          <span className="inline-flex items-center gap-1.5 text-muted">
            · <Loader2 size={14} className="animate-spin" /> {t('processing', { n: processing })}
          </span>
        )}
        {attention > 0 && (
          <button onClick={onAttention} className="rounded-full bg-warn-bg px-2.5 py-0.5 font-semibold text-warn-ink">
            {t('needYou', { n: attention })}
          </button>
        )}
        {unsent > 0 && <span className="rounded-full bg-accent-bg px-2.5 py-0.5 font-semibold text-accent-ink">{t('notSentYet', { n: unsent })}</span>}
      </div>
      {send.confirm && (
        <div className="rounded-xl bg-warn-bg px-3 py-2">
          <p className="text-sm text-warn-ink">
            {send.missing ? t(send.missing === 1 ? 'missingOne' : 'missingMany', { n: send.missing }) : t('voiceSendConfirm')}
          </p>
          <div className="mt-2 flex gap-2">
            <Button className="flex-1" variant="primary" onClick={send.send}>
              {t(send.missing ? 'sendAnyway' : 'sendNow')}
            </Button>
            <Button variant="ghost" onClick={send.cancel}>
              {t('cancel')}
            </Button>
          </div>
        </div>
      )}
      <div className="flex items-center gap-3">
        <div className="flex flex-col items-center gap-0.5">
          <button
            onClick={onMic}
            disabled={micDisabled}
            aria-label={t(recording ? 'stopRec' : 'startRec')}
            className={cx(
              'relative grid size-[72px] place-items-center rounded-full bg-danger text-white shadow-[0_6px_18px_rgba(212,67,61,0.35)] transition-transform active:scale-95 disabled:opacity-40',
              recording && 'ring-8 ring-danger/20',
            )}
          >
            {recording ? <Square size={28} fill="currentColor" /> : <Mic size={32} />}
            {recording && <span className="absolute inset-0 animate-ping rounded-full bg-danger/25" />}
          </button>
          <span className="text-[11.5px] text-muted tabular-nums">{recording ? fmtTime(elapsed) : t('tapToSpeak')}</span>
        </div>
        {/* While speech is still being turned into answers, Send waits (else they'd miss this Send). */}
        <SendButton send={send} waiting={recording || processing > 0} />
      </div>
      {send.error ? <p className="text-xs text-danger-ink">{send.error}</p> : <AckLine ack={send.ack} />}
    </div>
  );
}

// ---------- Send to desktop ----------

type SendState = ReturnType<typeof useSend>;

/**
 * Send to desktop: whether it can be pressed, the confirmation before sending (required fields are
 * empty, or the send was spoken), and the computer's reply after it.
 */
function useSend({
  fields,
  statusOf,
  sent,
  unsent,
  desktop,
  report,
  askSend,
  onSend,
}: {
  fields: SessionField[];
  statusOf: (f: SessionField) => FieldStatus;
  sent: boolean;
  /** Answers / uploads changed since the last Send. */
  unsent: number;
  desktop: DesktopState;
  report: DesktopReport | null;
  /** Bumped when the user said "send it": ask before sending. */
  askSend: number;
  onSend: () => Promise<string | null>;
}) {
  const { srv } = useI18n();
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<'missing' | 'voice' | null>(null);
  const [sends, setSends] = useState(0);
  const ack = useDesktopAck(sent, report, sends);

  const missing = fields.filter((f) => needsInput(f, statusOf(f))).length;
  // Send again whenever something changed since the last Send (or the computer filled nothing).
  const canResend = unsent > 0 || ack.kind === 'nothing';
  const canSend = desktop === 'open' && (!sent || canResend);
  const send = async () => {
    setConfirm(null);
    setSending(true);
    const err = await onSend();
    setError(err ? srv(err) : null);
    if (!err) setSends((n) => n + 1);
    setSending(false);
  };

  useEffect(() => {
    if (askSend > 0 && canSend) setConfirm('voice');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [askSend]);

  return {
    sent,
    unsent,
    sending,
    error,
    confirm,
    missing,
    ack,
    canSend,
    canResend,
    send,
    cancel: () => setConfirm(null),
    /** Required fields still empty on the first Send: ask first. */
    press: () => (missing && !sent ? setConfirm('missing') : send()),
  };
}

function SendButton({ send: s, waiting }: { send: SendState; waiting: boolean }) {
  const { t } = useI18n();
  return (
    <button
      disabled={!s.canSend || s.sending || waiting || !!s.confirm}
      onClick={s.press}
      className="flex min-h-14 flex-1 items-center justify-center gap-2 rounded-2xl bg-ink px-3 text-center text-base leading-tight font-bold text-page disabled:opacity-50"
    >
      {s.sending ? (
        <Loader2 size={18} className="animate-spin" />
      ) : s.sent && !s.canResend ? (
        <>
          <Check size={18} className="shrink-0" /> {t('sentShort')}
        </>
      ) : (
        <>
          <Send size={18} className="shrink-0" />
          {!s.sent ? t('sendToDesktop') : s.unsent === 1 ? t('sendOneChange') : s.unsent > 1 ? t('sendChanges', { n: s.unsent }) : t('sendAgain')}
        </>
      )}
    </button>
  );
}

type Ack =
  | { kind: 'none' }
  | { kind: 'waiting' }
  | { kind: 'filled'; report: DesktopReport }
  | { kind: 'nothing'; report: DesktopReport };

/**
 * After "Send to desktop" the computer fills the page when the operator clicks "Fill form" (never by
 * itself), so the phone waits without a time limit. Each fill sends a report (desktop_report): a newer
 * one than at the Send means the page was filled.
 */
function useDesktopAck(sent: boolean, report: DesktopReport | null, sends: number): Ack {
  /** The report that was current when Send was pressed (undefined = not tracking, e.g. after a reload). */
  const sentWith = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (!sent) {
      sentWith.current = undefined;
      return;
    }
    // Each press (first send or Send again) waits for a report newer than the one shown now. Already
    // sent before this page loaded: any report counts.
    if (sends > 0) sentWith.current = report?.at ?? null;
    else if (sentWith.current === undefined) sentWith.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sent, sends]);

  if (!sent) return { kind: 'none' };
  if (report && report.at !== sentWith.current) {
    return report.filled === 0 && report.total > 0 ? { kind: 'nothing', report } : { kind: 'filled', report };
  }
  return { kind: 'waiting' };
}

function AckLine({ ack }: { ack: Ack }) {
  const { t } = useI18n();
  switch (ack.kind) {
    case 'waiting':
      return (
        <p className="text-xs text-accent-ink">
          {t('ackWaitingFill')} {t('captchaNote')}
        </p>
      );
    case 'filled':
      return (
        <p className="text-xs text-live-ink">
          {t('ackFilled', { filled: ack.report.filled, total: ack.report.total })}
          {ack.report.skipped > 0 && <span className="text-warn-ink">{t('ackSkipped', { n: ack.report.skipped })}</span>}
        </p>
      );
    case 'nothing':
      return <p className="text-xs text-danger-ink">{t('ackNothing')}</p>;
    default:
      return null;
  }
}

// ---------- sheets and helpers ----------

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
    <Card className="border-danger/40">
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
      className="mt-2"
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
    <div className="w-full rounded-lg bg-subtle px-3 py-2 text-sm text-ink/90">
      <p className="font-medium">
        {t('micBlocked')} {t('micHelpTitle')}
      </p>
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

/** The pen: type a value (or pick one of the dropdown's choices) in place under the row. */
function ValueEditor({
  field,
  initial,
  onSave,
  onCancel,
}: {
  field: SessionField;
  initial: string | null;
  onSave: (v: string | null) => Promise<string | null>;
  onCancel: () => void;
}) {
  const { t } = useI18n();
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
      <div className="flex gap-2">
        <Button
          className="flex-1"
          variant="primary"
          loading={busy}
          onClick={async () => {
            setBusy(true);
            setError(await onSave(value.trim() ? value : null));
            setBusy(false);
          }}
        >
          {t('save')}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          {t('cancel')}
        </Button>
      </div>
    </div>
  );
}

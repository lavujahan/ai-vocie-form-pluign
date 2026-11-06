import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppWindow, Check, Copy, Loader2, Mic, Monitor, Pencil, RefreshCw, Smartphone, Square, X } from 'lucide-react';
import { AUTO_STOP_SECONDS } from '@vff/shared';
import { useRecorder } from '@vff/shared/ui/use-recorder';
import { TA_FONT } from '@vff/shared/ui/voice-tips';
import { TAMIL_MARKS_KEY, TAMIL_MODE_KEY, TAMIL_TEXT_KEY, type PopupRequest, type PopupResponse, type TamilPadView } from '../messages';
import { clearedMarks, type PadMarks } from '../background/tamil-pad';
import { QrBlock } from './qr';
import { Banner, Button, cx } from './ui';

type Send = (req: PopupRequest) => Promise<PopupResponse>;
/** One piece of a recording (long speech is cut every 28 s), waiting to be written or to be retried. */
type Piece = { blob: Blob; durationMs: number; part: number };
type MicAccess = 'granted' | 'prompt' | 'denied';
/** How the operator speaks: on a phone (QR) or this computer's mic. undefined: not read yet; null: not chosen yet. */
type Mode = 'phone' | 'computer';

const PLAN_REFUSED = ['quota_exceeded', 'plan_expired'];

function toBase64(bytes: Uint8Array) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** "Allowed for this extension?", kept current while the panel is open. */
function useMicAccess() {
  const [access, setAccess] = useState<MicAccess | null>(null);
  useEffect(() => {
    let status: PermissionStatus | null = null;
    const read = () => status && setAccess(status.state);
    navigator.permissions
      .query({ name: 'microphone' as PermissionName })
      .then((s) => {
        status = s;
        s.addEventListener('change', read);
        read();
      })
      .catch(() => setAccess('prompt'));
    return () => status?.removeEventListener('change', read);
  }, []);
  return access;
}

/** The operator's choice, remembered on this computer; the chooser shows only until one is picked. */
function useMode() {
  const [mode, setMode] = useState<Mode | null | undefined>(undefined);
  useEffect(() => {
    chrome.storage.local.get(TAMIL_MODE_KEY).then(
      (r) => setMode(r[TAMIL_MODE_KEY] === 'phone' || r[TAMIL_MODE_KEY] === 'computer' ? r[TAMIL_MODE_KEY] : null),
      () => setMode(null),
    );
  }, []);
  const choose = useCallback((m: Mode) => {
    setMode(m);
    void chrome.storage.local.set({ [TAMIL_MODE_KEY]: m });
  }, []);
  return [mode, choose] as const;
}

/**
 * Speak Tamil and copy the text anywhere; no form is involved. Two ways to speak: on a phone (a QR opens
 * /t/<code>; each sentence spoken there is added here by the service worker, and edits or deletes on the
 * phone follow), or into this computer's mic (pieces of speech are written one at a time, so the text
 * stays in spoken order). Either way the seconds count in the plan's voice minutes on the server.
 * `own`: open in a window of its own (Chrome can only ask for the mic there, and clicking the page
 * doesn't close it). `chip`: the minutes left. `planNote`: why the plan refuses speech, if it does.
 */
export function TamilTyping({
  hidden,
  own,
  chip,
  planNote,
  pad,
  send,
  onClose,
}: {
  hidden: boolean;
  own: boolean;
  chip: ReactNode;
  planNote: ReactNode;
  pad: TamilPadView | null;
  send: Send;
  onClose: () => void;
}) {
  const [mode, choose] = useMode();
  const [text, setText] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [sending, setSending] = useState(0);
  const [failed, setFailed] = useState<Piece[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [lastSeconds, setLastSeconds] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  /** "This computer" was picked while a phone is connected: ask first. */
  const [leaving, setLeaving] = useState(false);
  const access = useMicAccess();
  const box = useRef<HTMLTextAreaElement>(null);
  const textRef = useRef(text);
  textRef.current = text;

  // The text waits in this browser while the popup is closed.
  useEffect(() => {
    chrome.storage.session.get(TAMIL_TEXT_KEY).then((r) => {
      setText(typeof r[TAMIL_TEXT_KEY] === 'string' ? r[TAMIL_TEXT_KEY] : '');
      setLoaded(true);
    }, () => setLoaded(true));
  }, []);
  useEffect(() => {
    if (loaded) void chrome.storage.session.set({ [TAMIL_TEXT_KEY]: text });
  }, [text, loaded]);
  // Sentences from the phone: the service worker adds them to the same text.
  useEffect(() => {
    const onChange = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      const v = area === 'session' ? changes[TAMIL_TEXT_KEY]?.newValue : undefined;
      if (typeof v === 'string' && v !== textRef.current) {
        setText(v);
        setCopied(false);
      }
    };
    chrome.storage.onChanged.addListener(onChange);
    return () => chrome.storage.onChanged.removeListener(onChange);
  }, []);

  const queue = useRef<Promise<void>>(Promise.resolve());
  const held = useRef<Piece[]>([]);
  const parts = useRef(0);

  const write = useCallback(
    async (piece: Piece) => {
      // A piece failed: later ones wait with it, so Retry keeps the spoken order.
      if (held.current.length) {
        held.current = [...held.current, piece];
        setFailed(held.current);
        return;
      }
      setSending((n) => n + 1);
      const bytes = new Uint8Array(await piece.blob.arrayBuffer());
      const res = await send({ type: 'DICTATE', base64: toBase64(bytes), mime: piece.blob.type, duration_ms: piece.durationMs, part: piece.part }).catch(
        (): PopupResponse => ({ ok: false, error: "Couldn't reach Voice2Fill. Try again.", state: null as never }),
      );
      setSending((n) => n - 1);
      if (res.ok) {
        const added = res.text?.trim();
        if (added) setText((t) => (t && !/\s$/.test(t) ? `${t} ${added}` : t + added));
        else if (piece.part === 0) setError("Didn't catch any speech. Try again.");
        setLastSeconds((s) => (piece.part === 0 ? 0 : (s ?? 0)) + Math.round(piece.durationMs / 1000));
      } else if (res.code && PLAN_REFUSED.includes(res.code)) {
        // The plan note says what to do; there is nothing to retry until then.
        setError(null);
      } else {
        setError(res.error);
        held.current = [piece];
        setFailed(held.current);
      }
    },
    [send],
  );
  const enqueue = useCallback((piece: Piece) => {
    queue.current = queue.current.then(() => write(piece));
  }, [write]);

  const retry = () => {
    const pieces = held.current;
    held.current = [];
    setFailed([]);
    setError(null);
    pieces.forEach(enqueue);
  };

  const recorder = useRecorder(
    (blob, { durationMs }) => {
      // Stop landed just after a 28 s cut: this sliver holds no speech.
      if (parts.current > 0 && durationMs < 1000) return;
      enqueue({ blob, durationMs, part: parts.current++ });
    },
    { releaseMic: true },
  );
  const recording = recorder.state === 'recording';

  const start = async () => {
    setError(null);
    setCopied(false);
    parts.current = 0;
    await recorder.start(null);
  };
  const close = () => {
    if (recording) recorder.stop();
    onClose();
  };

  // ---------- the phone ----------

  const [padBusy, setPadBusy] = useState(false);
  const [padError, setPadError] = useState<string | null>(null);
  const startPad = useCallback(async () => {
    setPadBusy(true);
    setPadError(null);
    const res = await send({ type: 'TAMIL_PAD_START' }).catch((): PopupResponse => ({ ok: false, error: "Couldn't reach Voice2Fill. Try again.", state: null as never }));
    setPadBusy(false);
    // A plan that refuses shows its note instead.
    if (!res.ok && !(res.code && PLAN_REFUSED.includes(res.code))) setPadError(res.error);
  }, [send]);
  const endPad = () => void send({ type: 'TAMIL_PAD_END' });
  const phoneOn = !!pad?.paired && !pad.ended;

  // Speak on phone, and no QR yet: make one (a pad that ended waits for "New QR").
  const wantsQr = mode === 'phone' && !hidden && !pad && !planNote && !padBusy && !padError;
  useEffect(() => {
    if (wantsQr) void startPad();
  }, [wantsQr, startPad]);

  const pick = (m: Mode) => {
    if (m === mode) return;
    if (m === 'computer' && phoneOn) return setLeaving(true);
    setError(null);
    choose(m);
  };

  // New words are at the end: keep them in view.
  useEffect(() => {
    if (box.current && !hidden) box.current.scrollTop = box.current.scrollHeight;
  }, [text.length, hidden]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      box.current?.focus();
      box.current?.select();
      setError('Press Ctrl+C to copy the selected text.');
    }
  }

  function clear() {
    setText('');
    setCopied(false);
    setLastSeconds(null);
    // What the phone sent so far is done with: its later edits don't bring it back.
    void chrome.storage.session.get(TAMIL_MARKS_KEY).then((r) => {
      const marks = r[TAMIL_MARKS_KEY] as PadMarks | undefined;
      if (marks) void chrome.storage.session.set({ [TAMIL_MARKS_KEY]: clearedMarks(marks) });
    });
  }

  // Asked once, in a window of its own: a toolbar popup can't show Chrome's question reliably.
  const asking = access === 'prompt';
  const askForMic = () =>
    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => stream.getTracks().forEach((t) => t.stop()))
      .catch(() => null);
  useEffect(() => {
    if (own && asking && mode === 'computer') void askForMic();
  }, [own, asking, mode]);

  const noMic = recorder.state === 'denied' && access === 'granted';
  const unsupported = recorder.state === 'unsupported';
  let title = text ? 'Tap to add more' : 'Tap and speak in Tamil';
  let hint: ReactNode = lastSeconds === null ? 'Speaking uses your voice minutes' : `Last recording used ${lastSeconds} seconds of your plan`;
  if (planNote) {
    title = 'Speaking is off';
    hint = 'You can still copy your text below';
  } else if (recording) {
    title = `Listening ${Math.floor(recorder.elapsed / 60)}:${String(recorder.elapsed % 60).padStart(2, '0')}`;
    hint = recorder.stopsIn ? `Stops in ${recorder.stopsIn} s` : `Tap to stop. It stops by itself after ${AUTO_STOP_SECONDS} seconds of silence.`;
  } else if (sending) {
    title = 'Writing your Tamil…';
    hint = 'Takes a few seconds';
  } else if (recorder.notice === 'too_short') {
    hint = 'That was too short. Tap and speak.';
  } else if (recorder.notice === 'interrupted') {
    hint = 'The recording stopped early. What you said is kept.';
  }

  const header = (
    <header className="border-b border-header-line bg-header px-3.5 pt-2.5 pb-2 text-header-ink">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-bold">
          <span className="grid size-[22px] place-items-center rounded-md bg-brand text-[13px] font-semibold text-brand-ink" style={{ fontFamily: TA_FONT }}>
            த
          </span>
          Tamil typing
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          {chip}
          {!own && (
            <button
              type="button"
              title="Keep open in its own window"
              aria-label="Keep open in its own window"
              disabled={recording || sending > 0}
              onClick={async () => {
                await send({ type: 'OPEN_TAMIL_WINDOW' });
                window.close();
              }}
              className="grid size-[26px] place-items-center rounded-md bg-header-ink/10 hover:bg-header-ink/20 disabled:opacity-50"
            >
              <AppWindow size={14} />
            </button>
          )}
          <button type="button" title="Close" aria-label="Close" onClick={close} className="grid size-[26px] place-items-center rounded-md bg-header-ink/10 hover:bg-header-ink/20">
            <X size={14} />
          </button>
        </span>
      </div>
      <p className="mt-0.5 text-xs text-header-ink/80">Speak Tamil, then copy the text anywhere</p>
    </header>
  );

  const shell = (body: ReactNode) => (
    <div className={cx('absolute inset-0 z-50 flex flex-col bg-page', hidden && 'hidden')} role="dialog" aria-label="Tamil typing">
      {header}
      {body}
    </div>
  );

  if (mode === undefined) return shell(null);
  if (mode === null) return shell(<Chooser onPick={choose} />);

  const modeSwitch = (
    <div className="grid shrink-0 grid-cols-2 gap-[3px] rounded-[10px] border border-line bg-subtle p-[3px]" role="group" aria-label="Speak on">
      {(
        [
          ['phone', 'Phone', <Smartphone key="p" size={15} />],
          ['computer', 'This computer', <Monitor key="c" size={15} />],
        ] as const
      ).map(([m, label, icon]) => (
        <button
          key={m}
          type="button"
          aria-pressed={mode === m}
          disabled={recording || sending > 0}
          onClick={() => pick(m)}
          className={cx(
            'flex min-h-[34px] items-center justify-center gap-1.5 rounded-lg text-[13px] disabled:cursor-not-allowed',
            mode === m ? 'bg-card font-semibold text-ink shadow-[0_1px_3px_rgba(0,0,0,0.12)]' : 'font-medium text-muted hover:text-ink',
          )}
        >
          {icon}
          {label}
        </button>
      ))}
    </div>
  );

  if (mode === 'computer' && (access === 'denied' || asking)) {
    return shell(
      <div className="flex min-h-0 flex-1 flex-col gap-2.5 px-3.5 py-3">
        {modeSwitch}
        {access === 'denied' ? (
          <Access
            title="Your microphone is blocked"
            text="Chrome is blocking the microphone for Voice2Fill. Allow it in Chrome's settings, then open Tamil typing again. Or speak on a phone instead."
            action="Open Chrome settings"
            onAction={() => void chrome.tabs.create({ url: 'chrome://settings/content/microphone' })}
          />
        ) : (
          <Access
            title="Allow your microphone"
            text={
              own
                ? 'Choose Allow in Chrome’s question at the top of this window.'
                : 'Chrome asks only once. A small window opens: choose Allow there, and Tamil typing stays open in it.'
            }
            action={own ? 'Ask again' : 'Allow microphone'}
            onAction={async () => {
              if (own) return void askForMic();
              await send({ type: 'OPEN_TAMIL_WINDOW' });
              window.close();
            }}
          />
        )}
      </div>,
    );
  }

  return shell(
    <>
      <div className="flex min-h-0 flex-1 flex-col gap-2.5 px-3.5 py-3">
        {modeSwitch}
        {planNote}
        {leaving ? (
          <div className="grid shrink-0 gap-2.5 rounded-xl border border-line bg-card p-3 shadow-[0_8px_22px_rgba(0,0,0,0.14)]" role="alertdialog" aria-label="Disconnect the phone?">
            <b className="text-sm">Disconnect the phone?</b>
            <span className="text-[13px] text-muted">The phone stops sending. The text you have stays here.</span>
            <div className="flex justify-end gap-1.5">
              <Button className="min-h-8 px-3 text-[13px]" onClick={() => setLeaving(false)}>
                Keep phone
              </Button>
              <Button
                variant="danger"
                className="min-h-8 px-3 text-[13px]"
                onClick={() => {
                  setLeaving(false);
                  endPad();
                  choose('computer');
                }}
              >
                Disconnect
              </Button>
            </div>
          </div>
        ) : mode === 'phone' ? (
          <PhonePanel pad={pad} planOff={!!planNote} busy={padBusy} error={padError} onNewQr={() => void startPad()} onEnd={endPad} />
        ) : (
          <div className="grid shrink-0 justify-items-center gap-1.5 rounded-xl border border-line bg-card px-3 pt-3.5 pb-3 text-center">
            <button
              type="button"
              aria-label={recording ? 'Stop' : 'Start speaking'}
              disabled={(!!planNote && !recording) || unsupported || access === null}
              onClick={() => (recording ? recorder.stop() : void start())}
              className="relative grid size-[68px] place-items-center rounded-full bg-danger text-white shadow-[0_6px_16px_rgba(212,67,61,0.35)] hover:brightness-95 disabled:cursor-not-allowed disabled:bg-track disabled:shadow-none"
            >
              {recording && <span className="absolute -inset-[7px] animate-[vf-pulse_1.5s_ease-out_infinite] rounded-full border-[3px] border-danger/40 motion-reduce:animate-none" />}
              {recording ? <Square size={26} fill="currentColor" /> : sending && !planNote ? <Loader2 size={28} className="animate-spin" /> : <Mic size={30} />}
            </button>
            {recording && (
              <span className="flex h-5 items-center gap-[3px]" aria-hidden="true">
                {Array.from({ length: 17 }, (_, i) => (
                  <i key={i} className="vf-level" style={{ animationDelay: `${-(i * 0.17) % 0.8}s` }} />
                ))}
              </span>
            )}
            <p className="text-[14.5px] font-semibold tabular-nums">{unsupported ? 'This browser can’t record' : noMic ? 'No microphone found' : title}</p>
            <p className="text-xs text-muted">{noMic ? 'Connect a microphone or headset, or speak on a phone instead.' : hint}</p>
          </div>
        )}
        {error && (
          <Banner tone="danger">
            {error}{' '}
            {failed.length > 0 && (
              <button type="button" onClick={retry} className="font-medium underline underline-offset-2">
                Retry
              </button>
            )}
          </Banner>
        )}
        <div className="flex min-h-0 flex-1 flex-col gap-1">
          <div className="flex justify-between text-[11px] font-bold tracking-wider text-muted uppercase">
            <span>Tamil text</span>
            <span className="font-medium tracking-normal normal-case">You can edit it</span>
          </div>
          <textarea
            ref={box}
            aria-label="Tamil text"
            placeholder={mode === 'phone' ? 'What the phone writes appears here' : 'Your Tamil text appears here'}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setCopied(false);
            }}
            className="min-h-16 w-full flex-1 resize-none rounded-lg border border-line bg-card px-3 py-2.5 text-[17px] leading-relaxed text-ink placeholder:font-sans placeholder:text-[13px] placeholder:text-muted focus:border-accent-ink focus:outline-none"
            style={{ fontFamily: TA_FONT }}
          />
          {mode === 'phone' && pad?.note && (
            <p className="flex items-center gap-1.5 text-xs text-accent-ink" role="status">
              <Pencil size={12} className="shrink-0" />
              <span className="min-w-0" style={{ fontFamily: TA_FONT }}>
                {pad.note}
              </span>
            </p>
          )}
        </div>
      </div>
      <footer className="flex items-center gap-2 border-t border-line bg-card px-3.5 py-2.5">
        <Button variant="primary" className={cx('flex-1', copied && 'border-transparent! bg-live-bg! text-live-ink!')} disabled={!text} onClick={copy}>
          {copied ? <Check size={15} /> : <Copy size={15} />}
          {copied ? 'Copied' : 'Copy text'}
        </Button>
        <Button disabled={!text || recording} onClick={clear}>
          Clear
        </Button>
      </footer>
    </>,
  );
}

/** Speak on phone: the QR, then the phone's state. The text box below fills as the phone speaks. */
function PhonePanel({
  pad,
  planOff,
  busy,
  error,
  onNewQr,
  onEnd,
}: {
  pad: TamilPadView | null;
  planOff: boolean;
  busy: boolean;
  error: string | null;
  onNewQr: () => void;
  onEnd: () => void;
}) {
  const sentences = (n: number) => (n === 1 ? '1 sentence came in.' : `${n} sentences came in.`);
  const newQr = (
    <button type="button" onClick={onNewQr} disabled={busy || planOff} className="inline-flex items-center gap-1 font-semibold whitespace-nowrap underline underline-offset-2 disabled:opacity-50">
      <RefreshCw size={13} /> New QR
    </button>
  );
  if (error) {
    return (
      <Banner tone="danger">
        {error} {newQr}
      </Banner>
    );
  }
  // The plan refuses speech: its note above says what to do; a phone that is on carries on its recording.
  if (!pad) return planOff ? null : <p className="flex items-center gap-2 text-sm text-muted"><Loader2 size={15} className="animate-spin" /> Making a QR…</p>;
  if (pad.ended) {
    return (
      <div role="status" className="flex shrink-0 items-start gap-2 rounded-lg border border-warn-ink/25 bg-warn-bg px-2.5 py-2 text-[13px] text-warn-ink">
        <span className="min-w-0 flex-1">
          {pad.paired ? (
            <>
              <b>Phone disconnected.</b> {sentences(pad.count)}
            </>
          ) : (
            <b>This QR has ended.</b>
          )}
        </span>
        {newQr}
      </div>
    );
  }
  if (pad.paired) {
    return (
      <div role="status" className="flex shrink-0 items-start gap-2 rounded-lg border border-live-ink/25 bg-live-bg px-2.5 py-2 text-[13px] text-live-ink">
        <span className="mt-[5px] size-2 shrink-0 rounded-full bg-live-ink shadow-[0_0_0_3px_rgba(23,96,42,0.18)]" />
        <span className="min-w-0 flex-1">
          <b>Phone connected.</b> Speak on the phone.
          {pad.count > 0 && <span className="block text-xs opacity-85">{sentences(pad.count)}</span>}
        </span>
        <button type="button" onClick={onEnd} className="font-semibold whitespace-nowrap underline underline-offset-2">
          Disconnect
        </button>
      </div>
    );
  }
  return (
    <div className="shrink-0 rounded-xl border border-line bg-card px-3 pt-2">
      <QrBlock
        key={pad.code}
        url={pad.qr_url}
        expiresAt={pad.expires_at}
        copyLink
        hint={
          <>
            Scan with the phone camera
            <span className="mt-1 flex justify-center gap-1.5 text-[11.5px] text-muted">
              <span className="rounded-full bg-subtle px-2 py-px">1 Scan</span>
              <span className="rounded-full bg-subtle px-2 py-px">2 Tap the mic</span>
              <span className="rounded-full bg-subtle px-2 py-px">3 Text comes here</span>
            </span>
          </>
        }
        expired={
          <div className="grid justify-items-center gap-2 py-4 text-center">
            <p className="text-sm font-semibold">This QR has expired</p>
            <Button className="min-h-8 px-3 text-[13px]" loading={busy} onClick={onNewQr}>
              <RefreshCw size={14} /> Get a new QR
            </Button>
          </div>
        }
      />
    </div>
  );
}

/** The first time: how will you speak? The choice is remembered; the switch at the top changes it. */
function Chooser({ onPick }: { onPick: (m: Mode) => void }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col justify-center gap-3.5 overflow-y-auto px-3.5 py-3">
      <div className="grid gap-0.5 text-center">
        <h2 className="text-[17px] font-bold">How will you speak?</h2>
        <p className="text-[13px] text-muted">Pick one. You can change it any time.</p>
      </div>
      <button
        type="button"
        onClick={() => onPick('phone')}
        className="relative grid grid-cols-[76px_1fr] items-center gap-3 rounded-[14px] border-[1.5px] border-brand bg-card p-3.5 text-left shadow-[0_0_0_3px_rgba(30,78,156,0.12)] hover:bg-subtle/40"
      >
        <span className="absolute -top-[9px] right-3 rounded-full bg-brand px-2 py-0.5 text-[10.5px] font-bold tracking-wide text-brand-ink">RECOMMENDED</span>
        <span className="grid size-[76px] place-items-center rounded-[14px] bg-accent-bg">
          <svg width="60" height="60" viewBox="0 0 60 60" aria-hidden="true">
            <rect x="14" y="5" width="28" height="50" rx="6" fill="#1e4e9c" />
            <rect x="17" y="11" width="22" height="36" rx="2" fill="#fff" />
            <g fill="#1a1813">
              <rect x="20" y="14" width="6" height="6" />
              <rect x="30" y="14" width="6" height="6" />
              <rect x="20" y="24" width="6" height="6" />
              <rect x="28" y="24" width="2" height="2" />
              <rect x="31" y="27" width="2" height="2" />
              <rect x="34" y="24" width="2" height="2" />
              <rect x="28" y="30" width="2" height="2" />
              <rect x="33" y="31" width="3" height="2" />
            </g>
            <circle cx="44" cy="40" r="10" fill="#d4433d" stroke="#fff" strokeWidth="2.5" />
            <rect x="41.5" y="34" width="5" height="8" rx="2.5" fill="#fff" />
            <path d="M39.5 40.5a4.5 4.5 0 0 0 9 0M44 45v2" stroke="#fff" strokeWidth="1.6" fill="none" strokeLinecap="round" />
          </svg>
        </span>
        <span>
          <b className="block text-[15px]">Speak on phone</b>
          <small className="mt-0.5 block text-[12.5px] leading-snug text-muted">Scan a QR with any phone. No mic needed on this computer. The text comes here.</small>
        </span>
      </button>
      <button
        type="button"
        onClick={() => onPick('computer')}
        className="grid grid-cols-[76px_1fr] items-center gap-3 rounded-[14px] border-[1.5px] border-line bg-card p-3.5 text-left hover:bg-subtle/40"
      >
        <span className="grid size-[76px] place-items-center rounded-[14px] bg-danger-bg">
          <svg width="60" height="60" viewBox="0 0 60 60" aria-hidden="true">
            <rect x="6" y="10" width="48" height="31" rx="4" fill="#574e3c" />
            <rect x="9" y="13" width="42" height="25" rx="2" fill="#fbf3dc" />
            <path d="M24 50h12M30 41v9" stroke="#574e3c" strokeWidth="3" strokeLinecap="round" />
            <circle cx="30" cy="25.5" r="9" fill="#d4433d" />
            <rect x="27.8" y="20" width="4.4" height="7.5" rx="2.2" fill="#fff" />
            <path d="M26 26a4 4 0 0 0 8 0" stroke="#fff" strokeWidth="1.5" fill="none" strokeLinecap="round" />
          </svg>
        </span>
        <span>
          <b className="block text-[15px]">This computer&rsquo;s mic</b>
          <small className="mt-0.5 block text-[12.5px] leading-snug text-muted">Speak into a headset or webcam mic on this computer.</small>
        </span>
      </button>
      <p className="text-center text-[11.5px] text-muted">Either way, speaking uses your voice minutes. The voice goes to Sarvam AI to become text and is not stored.</p>
    </div>
  );
}

/** The mic isn't allowed yet: what to do about it, and that the voice leaves this computer. */
function Access({ title, text, action, onAction }: { title: string; text: string; action: string; onAction: () => void }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="grid flex-1 content-center justify-items-center gap-2 rounded-xl border border-line bg-card p-5 text-center">
        <span className="grid size-[68px] place-items-center rounded-full bg-accent-bg text-accent-ink">
          <Mic size={32} />
        </span>
        <h2 className="text-base font-bold">{title}</h2>
        <p className="text-[13px] text-muted">{text}</p>
        <p className="text-xs text-muted">Your voice goes to Sarvam AI to become text. It is not stored.</p>
        <Button variant="primary" className="mt-1.5" onClick={onAction}>
          {action}
        </Button>
      </div>
    </div>
  );
}

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppWindow, Check, Copy, Loader2, Mic, Square, X } from 'lucide-react';
import { AUTO_STOP_SECONDS } from '@vff/shared';
import { useRecorder } from '@vff/shared/ui/use-recorder';
import { TA_FONT } from '@vff/shared/ui/voice-tips';
import { TAMIL_TEXT_KEY, type PopupRequest, type PopupResponse } from '../messages';
import { Banner, Button, cx } from './ui';

type Send = (req: PopupRequest) => Promise<PopupResponse>;
/** One piece of a recording (long speech is cut every 28 s), waiting to be written or to be retried. */
type Piece = { blob: Blob; durationMs: number; part: number };
type MicAccess = 'granted' | 'prompt' | 'denied';

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

/**
 * Speak Tamil into the computer's mic and copy the text anywhere; no form is involved. Pieces of speech
 * are written one at a time, so the text stays in spoken order. The seconds count in the plan's voice
 * minutes on the server. `own`: open in a window of its own (Chrome can only ask for the mic there, and
 * clicking the page doesn't close it). `chip`: the minutes left. `planNote`: why the plan refuses speech,
 * if it does.
 */
export function TamilTyping({
  hidden,
  own,
  chip,
  planNote,
  send,
  onClose,
}: {
  hidden: boolean;
  own: boolean;
  chip: ReactNode;
  planNote: ReactNode;
  send: Send;
  onClose: () => void;
}) {
  const [text, setText] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [sending, setSending] = useState(0);
  const [failed, setFailed] = useState<Piece[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [lastSeconds, setLastSeconds] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const access = useMicAccess();
  const box = useRef<HTMLTextAreaElement>(null);

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

  // Asked once, in a window of its own: a toolbar popup can't show Chrome's question reliably.
  const asking = access === 'prompt';
  const askForMic = () =>
    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => stream.getTracks().forEach((t) => t.stop()))
      .catch(() => null);
  useEffect(() => {
    if (own && asking) void askForMic();
  }, [own, asking]);

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

  return (
    <div className={cx('absolute inset-0 z-50 flex flex-col bg-page', hidden && 'hidden')} role="dialog" aria-label="Tamil typing">
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

      {access === 'denied' ? (
        <Access
          title="Your microphone is blocked"
          text="Chrome is blocking the microphone for Voice2Fill. Allow it in Chrome's settings, then open Tamil typing again."
          action="Open Chrome settings"
          onAction={() => void chrome.tabs.create({ url: 'chrome://settings/content/microphone' })}
        />
      ) : asking ? (
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
      ) : (
        <>
          <div className="flex min-h-0 flex-1 flex-col gap-2.5 px-3.5 py-3">
            {planNote}
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
              <p className="text-xs text-muted">{noMic ? 'Connect a microphone or headset, then tap again.' : hint}</p>
            </div>
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
                placeholder="Your Tamil text appears here"
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  setCopied(false);
                }}
                className="min-h-0 w-full flex-1 resize-none rounded-lg border border-line bg-card px-3 py-2.5 text-[17px] leading-relaxed text-ink placeholder:font-sans placeholder:text-[13px] placeholder:text-muted focus:border-accent-ink focus:outline-none"
                style={{ fontFamily: TA_FONT }}
              />
            </div>
          </div>
          <footer className="flex items-center gap-2 border-t border-line bg-card px-3.5 py-2.5">
            <Button
              variant="primary"
              className={cx('flex-1', copied && 'border-transparent! bg-live-bg! text-live-ink!')}
              disabled={!text}
              onClick={copy}
            >
              {copied ? <Check size={15} /> : <Copy size={15} />}
              {copied ? 'Copied' : 'Copy text'}
            </Button>
            <Button
              disabled={!text || recording}
              onClick={() => {
                setText('');
                setCopied(false);
                setLastSeconds(null);
              }}
            >
              Clear
            </Button>
          </footer>
        </>
      )}
    </div>
  );
}

/** The mic isn't allowed yet: what to do about it, and that the voice leaves this computer. */
function Access({ title, text, action, onAction }: { title: string; text: string; action: string; onAction: () => void }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col px-3.5 py-3">
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

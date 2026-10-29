'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, ClipboardPaste, Copy, Loader2, X } from 'lucide-react';
import { TIPS_TEXT, TRANSLATE_MAX_CHARS } from '@vff/shared';
import { BulbIcon } from '@vff/shared/ui/voice-tips';
import { cx } from '@/components/ui';
import { useI18n } from './lang';
import { TIPS_SEEN_KEY, TipsSheet } from './voice-tips';

/**
 * English → Tamil helper: a gold "த" bubble at the screen edge opens a bottom sheet where the operator
 * types or pastes English (a label, a help line) and gets the Tamil to read out or copy. On a voice form
 * the voice-tips bubble sits above it. The bubbles move together: dragged up and down, they snap to the
 * nearer side; they hide while recording, so they never cover the mic.
 */

export type Translate = (text: string, signal?: AbortSignal) => Promise<{ tamil: string } | { error: string }>;
type Pair = { en: string; ta: string };
type Spot = { side: 'left' | 'right'; bottom: number };

const TA_FONT = "'Noto Sans Tamil', Latha, 'Nirmala UI', sans-serif";
const SPOT_KEY = 'vf-helper-spot';
const RECENT_KEY = 'vf-helper-recent';
const RECENT_MAX = 8;
/** Wait this long after the last keystroke before asking (fewer AI calls while typing). */
const PAUSE_MS = 600;
const BUBBLE = 52;

function load<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
function store(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // private mode / storage full: the helper still works, it just forgets
  }
}
const keyOf = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();
const GAP = 10;
/** The stack's distance from the bottom: up to just under the top edge, but above the bottom bar's buttons. */
const clampBottom = (b: number, height: number) => Math.min(Math.max(b, 88), window.innerHeight - height - 12);

type Panel = 'tamil' | 'tips';
/** What a tap on the stack does, from the `data-act` of the part tapped. */
type Act = Panel | 'dismiss';

/**
 * The floating helpers: the gold "த" bubble, and with `tips` (a voice form) the blue voice-tips bubble
 * above it. They hide while recording, so they never cover the mic.
 */
export function TamilHelper({ translate, hidden, tips }: { translate: Translate; hidden?: boolean; tips?: boolean }) {
  const [open, setOpen] = useState<Panel | null>(null);
  // Until the tips are opened (or the callout closed) once on this phone, the tips bubble calls out.
  const [tipsSeen, setTipsSeen] = useState(true);
  useEffect(() => setTipsSeen(load(TIPS_SEEN_KEY, false)), []);
  const close = useCallback(() => setOpen(null), []);
  const act = (a: Act) => {
    if (a !== 'tamil') {
      setTipsSeen(true);
      store(TIPS_SEEN_KEY, true);
    }
    if (a !== 'dismiss') setOpen(a);
  };
  return (
    <>
      {!hidden && !open && <Bubbles tips={!!tips} fresh={!!tips && !tipsSeen} onAct={act} />}
      {open === 'tamil' && <Sheet translate={translate} onClose={close} />}
      {open === 'tips' && <TipsSheet onClose={close} />}
    </>
  );
}

/**
 * The bubbles, one stack: a tap opens a helper; a drag moves the stack (it snaps to the nearer side).
 * The pointer is captured by the stack, so the part tapped is read when the finger goes down.
 */
function Bubbles({ tips, fresh, onAct }: { tips: boolean; fresh: boolean; onAct: (a: Act) => void }) {
  const { t, lang } = useI18n();
  const [spot, setSpot] = useState<Spot>({ side: 'right', bottom: 140 });
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const start = useRef<{ x: number; y: number; moved: boolean; act: Act | null; dx: number; dy: number } | null>(null);
  const last = useRef<{ x: number; y: number } | null>(null);
  const stack = useRef<HTMLDivElement>(null);
  const height = tips ? BUBBLE * 2 + GAP : BUBBLE;
  // Read after mount: the server render has no localStorage.
  useEffect(() => setSpot(load<Spot>(SPOT_KEY, { side: 'right', bottom: 140 })), []);

  // Some phone browsers (in-app browsers opened by QR scanner apps, Samsung Internet) don't honour
  // touch-action: a drag upwards scrolls the page and cancels the drag. Stop the page scrolling
  // while the stack is held (React's touch listeners are passive, so this one is added by hand).
  useEffect(() => {
    const el = stack.current;
    if (!el) return;
    const hold = (e: TouchEvent) => {
      if (start.current && e.cancelable) e.preventDefault();
    };
    el.addEventListener('touchmove', hold, { passive: false });
    return () => el.removeEventListener('touchmove', hold);
  }, []);

  // A smaller screen (rotated, the browser's address bar shown) keeps the stack on screen.
  useEffect(() => {
    const fit = () => setSpot((s) => ({ ...s, bottom: Math.round(clampBottom(s.bottom, height)) }));
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [height]);

  /** Drops the stack where the finger left it, on the nearer side. */
  const drop = (x: number, y: number) => {
    const s = start.current;
    const top = y - (s?.dy ?? BUBBLE / 2);
    const next: Spot = {
      side: x < window.innerWidth / 2 ? 'left' : 'right',
      bottom: Math.round(clampBottom(window.innerHeight - top - height, height)),
    };
    setDrag(null);
    setSpot(next);
    store(SPOT_KEY, next);
  };
  const grab = start.current;
  // Keyboard: Enter / Space on a bubble (a pointer tap is handled on pointer up, below).
  const keyAct = (a: Act) => (e: React.MouseEvent) => e.detail === 0 && onAct(a);

  return (
    <div
      ref={stack}
      className={cx(
        'fixed z-30 flex touch-none flex-col items-center select-none',
        !drag && 'transition-[left,right,bottom] duration-150 motion-reduce:transition-none',
      )}
      style={{
        width: BUBBLE,
        height,
        gap: GAP,
        ...(drag && grab
          ? { left: drag.x - grab.dx, top: drag.y - grab.dy }
          : { [spot.side]: 12, bottom: `calc(${spot.bottom}px + env(safe-area-inset-bottom, 0px))` }),
      }}
      onPointerDown={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        const act = ((e.target as Element).closest('[data-act]') as HTMLElement | null)?.dataset.act as Act | undefined;
        e.currentTarget.setPointerCapture(e.pointerId);
        start.current = { x: e.clientX, y: e.clientY, moved: false, act: act ?? null, dx: e.clientX - r.left, dy: e.clientY - r.top };
        last.current = null;
      }}
      onPointerMove={(e) => {
        const s = start.current;
        if (!s) return;
        if (!s.moved && Math.hypot(e.clientX - s.x, e.clientY - s.y) < 8) return;
        s.moved = true;
        last.current = { x: e.clientX, y: e.clientY };
        setDrag(last.current);
      }}
      onPointerUp={(e) => {
        const s = start.current;
        if (!s?.moved) {
          start.current = null;
          setDrag(null);
          if (s?.act) onAct(s.act);
          return;
        }
        drop(e.clientX, e.clientY);
        start.current = null;
      }}
      onPointerCancel={() => {
        // The browser took the gesture over: keep the stack where it got to, rather than snapping back.
        const s = start.current;
        if (s?.moved && last.current) drop(last.current.x, last.current.y);
        else setDrag(null);
        start.current = null;
      }}
    >
      {tips && (
        <button
          type="button"
          data-act="tips"
          aria-label={TIPS_TEXT[lang].open}
          onClick={keyAct('tips')}
          className="relative grid shrink-0 place-items-center rounded-full border-2 border-white bg-brand text-brand-ink shadow-[0_6px_18px_rgba(0,0,0,0.25)]"
          style={{ width: BUBBLE, height: BUBBLE }}
        >
          {fresh && (
            <>
              <span className="absolute -inset-[7px] animate-[vf-pulse_1.8s_ease-out_infinite] rounded-full border-[3px] border-brand/35 motion-reduce:animate-none" />
              <span className="absolute -top-[3px] -right-[3px] size-[13px] rounded-full border-2 border-white bg-danger" />
            </>
          )}
          <BulbIcon size={24} />
        </button>
      )}
      <button
        type="button"
        data-act="tamil"
        aria-label={t('helperOpen')}
        onClick={keyAct('tamil')}
        className="relative grid shrink-0 place-items-center rounded-full border-2 border-white bg-gold text-[22px] font-semibold text-gold-ink shadow-[0_6px_18px_rgba(0,0,0,0.25)]"
        style={{ width: BUBBLE, height: BUBBLE, fontFamily: TA_FONT }}
      >
        த
        <span className="absolute -right-1 -bottom-0.5 rounded-md bg-brand px-1 font-sans text-[10px] leading-[15px] font-bold text-brand-ink">EN</span>
      </button>
      {fresh && !drag && (
        // First visit: a short callout beside the tips bubble, on the side facing the page.
        <div
          className="absolute top-0 w-48 rounded-xl bg-ink px-3 py-2 text-xs leading-snug text-page shadow-[0_8px_20px_rgba(0,0,0,0.25)]"
          style={{ [spot.side === 'right' ? 'right' : 'left']: BUBBLE + 12 }}
        >
          <button type="button" data-act="tips" onClick={keyAct('tips')} className="block pr-5 text-left">
            <b className="block text-[12.5px]">{t('tipsCallout')}</b>
            {t('tipsCalloutSub')}
          </button>
          <button type="button" data-act="dismiss" aria-label={t('tipsDismiss')} onClick={keyAct('dismiss')} className="absolute top-1.5 right-1.5 grid size-6 place-items-center rounded opacity-70 hover:opacity-100">
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

function Sheet({ translate, onClose }: { translate: Translate; onClose: () => void }) {
  const { t, srv } = useI18n();
  const [text, setText] = useState('');
  const [result, setResult] = useState<{ tamil?: string; error?: string; busy?: boolean }>({});
  const [copied, setCopied] = useState(false);
  const [recent, setRecent] = useState<Pair[]>([]);
  const [canPaste, setCanPaste] = useState(false);
  /** Answers already fetched on this page, so going back to a text costs nothing. */
  const cache = useRef(new Map<string, string>());
  const input = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const saved = load<Pair[]>(RECENT_KEY, []);
    for (const p of saved) cache.current.set(keyOf(p.en), p.ta);
    setRecent(saved);
    setCanPaste(typeof navigator !== 'undefined' && !!navigator.clipboard?.readText);
    input.current?.focus();
    // The page behind stays put while the sheet is open.
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const remember = useCallback((pair: Pair) => {
    setRecent((prev) => {
      // Typing "Date of" then "Date of birth" keeps only the finished text.
      const k = keyOf(pair.en);
      const next = [pair, ...prev.filter((p) => !k.startsWith(keyOf(p.en)) && keyOf(p.en) !== k)].slice(0, RECENT_MAX);
      store(RECENT_KEY, next);
      return next;
    });
  }, []);

  // Translate after a pause in typing; a newer text cancels the request for the older one.
  useEffect(() => {
    const q = text.trim();
    if (q.length < 2) {
      setResult({});
      return;
    }
    const hit = cache.current.get(keyOf(q));
    if (hit) {
      setResult({ tamil: hit });
      return;
    }
    setResult((r) => ({ tamil: r.tamil, busy: true }));
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const r = await translate(q, ctrl.signal);
        if ('tamil' in r) {
          cache.current.set(keyOf(q), r.tamil);
          setResult({ tamil: r.tamil });
          remember({ en: q, ta: r.tamil });
        } else setResult({ error: r.error });
      } catch {
        // aborted: a newer text is on its way
      }
    }, PAUSE_MS);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [text, translate, remember]);

  async function copy() {
    if (!result.tamil) return;
    try {
      await navigator.clipboard.writeText(result.tamil);
    } catch {
      // Older browsers: copy through a selected text box.
      const el = document.createElement('textarea');
      el.value = result.tamil;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      el.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const smallBtn = 'inline-flex min-h-8 items-center gap-1.5 rounded-md border border-line bg-card px-2.5 text-xs font-medium normal-case tracking-normal text-ink hover:bg-subtle disabled:opacity-50';
  const label = 'flex items-center justify-between text-[11px] font-bold tracking-wider text-muted uppercase';

  return (
    <div className="fixed inset-0 z-40 flex flex-col justify-end" role="dialog" aria-modal="true" aria-label={t('helperTitle')}>
      <button type="button" aria-label={t('helperClose')} className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative flex max-h-[75dvh] flex-col overflow-hidden rounded-t-2xl bg-page shadow-[0_-12px_32px_rgba(0,0,0,0.22)] motion-safe:animate-[sheet-up_160ms_ease-out]">
        <header className="flex items-start justify-between gap-3 border-b border-gold-line bg-gold px-4 pt-3 pb-2.5 text-gold-ink">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-[15px] font-bold">
              <span className="grid size-6 place-items-center rounded-md bg-brand text-[13px] font-semibold text-brand-ink" style={{ fontFamily: TA_FONT }}>
                த
              </span>
              {t('helperTitle')}
            </p>
            <p className="mt-0.5 text-xs text-gold-ink/80">{t('helperSub')}</p>
          </div>
          <button type="button" aria-label={t('helperClose')} onClick={onClose} className="grid size-9 shrink-0 place-items-center rounded-lg bg-gold-ink/10 hover:bg-gold-ink/20">
            <X size={18} />
          </button>
        </header>

        <div className="grid gap-2.5 overflow-y-auto px-4 pt-3 pb-[calc(16px+env(safe-area-inset-bottom,0px))]">
          <div className={label}>
            <span>{t('helperEnglish')}</span>
            {canPaste && (
              <button
                type="button"
                className={smallBtn}
                onClick={async () => {
                  const clip = await navigator.clipboard.readText().catch(() => '');
                  if (clip) setText(clip.slice(0, TRANSLATE_MAX_CHARS));
                }}
              >
                <ClipboardPaste size={14} /> {t('helperPaste')}
              </button>
            )}
          </div>
          <textarea
            ref={input}
            value={text}
            maxLength={TRANSLATE_MAX_CHARS}
            rows={2}
            placeholder={t('helperPlaceholder')}
            aria-label={t('helperEnglish')}
            onChange={(e) => setText(e.target.value)}
            className="min-h-16 w-full resize-y rounded-lg border border-line bg-card px-3 py-2 text-base text-ink focus:border-accent-ink focus:outline-none"
          />

          <div className={label}>
            <span>{t('helperTamil')}</span>
            <button type="button" className={cx(smallBtn, copied && 'border-transparent bg-live-bg text-live-ink')} disabled={!result.tamil} onClick={copy}>
              {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? t('helperCopied') : t('helperCopy')}
            </button>
          </div>
          <div
            aria-live="polite"
            className={cx(
              'min-h-16 rounded-lg border border-line bg-card px-3 py-2.5 break-words',
              result.tamil ? 'text-[17px] leading-relaxed text-ink' : 'text-[13px] text-muted',
              result.busy && result.tamil && 'opacity-60',
            )}
            style={result.tamil ? { fontFamily: TA_FONT } : undefined}
          >
            {result.error ? (
              <span className="text-danger-ink">{srv(result.error)}</span>
            ) : result.tamil ? (
              result.tamil
            ) : result.busy ? (
              <span className="inline-flex items-center gap-1.5">
                <Loader2 size={14} className="animate-spin" /> {t('helperWorking')}
              </span>
            ) : (
              t('helperEmpty')
            )}
          </div>

          {recent.length > 0 && (
            <>
              <div className={label}>
                <span>{t('helperRecent')}</span>
              </div>
              <div className="grid gap-0.5">
                {recent.map((p) => (
                  <button
                    key={p.en}
                    type="button"
                    onClick={() => setText(p.en)}
                    className="flex min-h-10 items-center justify-between gap-3 rounded-md px-2 text-left text-[13px] text-ink hover:bg-subtle"
                  >
                    <span className="min-w-0 truncate">{p.en}</span>
                    <span className="min-w-0 truncate text-right text-muted" style={{ fontFamily: TA_FONT }}>
                      {p.ta}
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

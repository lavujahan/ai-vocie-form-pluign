import { createContext, useContext, useEffect, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';
import { ChevronRight, Loader2, Mic, MoreHorizontal } from 'lucide-react';
import { TIPS_TEXT } from '@vff/shared';
import { BulbIcon, TA_FONT, TipsDeck } from '@vff/shared/ui/voice-tips';

// Same tokens as apps/web/components/ui.tsx, sized for a 360px popup (light, on a mild gold background: popup.css).

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

/** Opens Tamil typing; null while signed out, so screens show its bubble only after sign-in. */
export const OpenTamilTyping = createContext<(() => void) | null>(null);

/**
 * One popup screen: the header, the content (the only part that scrolls) and a footer that stays in
 * view. Chrome caps a popup at 600px tall.
 */
export function Screen({
  header,
  footer,
  tips = false,
  children,
}: {
  header: ReactNode;
  footer?: ReactNode;
  /** Show the voice-tips bubble (a voice form): the operator shows the tips to the customer. */
  tips?: boolean;
  children: ReactNode;
}) {
  const [tipsOpen, setTipsOpen] = useState(false);
  const openTamil = useContext(OpenTamilTyping);
  const bubbles = tips || !!openTamil;
  return (
    <div className={cx('relative flex max-h-[600px] flex-col', tipsOpen && 'min-h-[560px]')}>
      {header}
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto px-3.5 py-3">
          <div className={cx('grid gap-2.5', bubbles && 'pb-12')}>{children}</div>
        </div>
        {bubbles && <Bubbles onTips={tips ? () => setTipsOpen(true) : null} onTamil={openTamil} />}
      </div>
      {footer && <footer className="flex items-center gap-2 border-t border-line bg-card px-3.5 py-2.5">{footer}</footer>}
      {tipsOpen && (
        <div className="absolute inset-0 z-50" role="dialog" aria-modal="true" aria-label={TIPS_TEXT.en.title}>
          <TipsDeck lang="en" operatorNote="Tell your customer before handing over the phone" onClose={() => setTipsOpen(false)} />
        </div>
      )}
    </div>
  );
}

const TIPS_SEEN_KEY = 'vf-voice-tips-seen';
const TAMIL_SEEN_KEY = 'vf-tamil-typing-seen';

/** The dark note beside a bubble that is new to the user. */
function Callout({ title, onOpen, onHide, className, children }: { title: string; onOpen: () => void; onHide: () => void; className: string; children: ReactNode }) {
  return (
    <div className={cx('rounded-xl bg-ink px-3 py-2 text-xs leading-snug text-page shadow-[0_8px_20px_rgba(0,0,0,0.25)]', className)}>
      <button type="button" onClick={onOpen} className="block pr-5 text-left">
        <b className="block text-[12.5px]">{title}</b>
        {children}
      </button>
      <button
        type="button"
        aria-label="Hide this"
        onClick={onHide}
        className="absolute top-1.5 right-1.5 grid size-6 place-items-center rounded text-sm opacity-70 hover:opacity-100"
      >
        ✕
      </button>
    </div>
  );
}

/**
 * The bubbles at the bottom right of the screen: the blue lightbulb (voice tips) and the gold த (Tamil
 * typing). Until a bubble is opened (or its callout closed) once, it pulses with a callout, one at a time.
 */
function Bubbles({ onTips, onTamil }: { onTips: (() => void) | null; onTamil: (() => void) | null }) {
  const [unseen, setUnseen] = useState({ tips: false, tamil: false });
  useEffect(() => {
    chrome.storage.local.get([TIPS_SEEN_KEY, TAMIL_SEEN_KEY]).then(
      (r) => setUnseen({ tips: r[TIPS_SEEN_KEY] !== true, tamil: r[TAMIL_SEEN_KEY] !== true }),
      () => null,
    );
  }, []);
  const seenTips = () => {
    setUnseen((u) => ({ ...u, tips: false }));
    void chrome.storage.local.set({ [TIPS_SEEN_KEY]: true });
  };
  const seenTamil = () => {
    setUnseen((u) => ({ ...u, tamil: false }));
    void chrome.storage.local.set({ [TAMIL_SEEN_KEY]: true });
  };
  const tipsNew = !!onTips && unseen.tips;
  const tamilNew = !!onTamil && unseen.tamil && !tipsNew;
  return (
    <div className="absolute right-3.5 bottom-3 z-10 flex items-end gap-2">
      {tipsNew && (
        <Callout title="Voice tips" onOpen={() => (seenTips(), onTips())} onHide={seenTips} className="relative mb-0.5 w-48">
          6 quick tips that save minutes. Show them to your customer.
        </Callout>
      )}
      {tamilNew && (
        <Callout title="New: Tamil typing" onOpen={() => (seenTamil(), onTamil())} onHide={seenTamil} className="relative mb-0.5 w-48">
          Speak Tamil and copy the text anywhere.
        </Callout>
      )}
      {onTips && (
        <button
          type="button"
          aria-label="Voice tips"
          title="Voice tips"
          onClick={() => (seenTips(), onTips())}
          className="relative grid size-11 shrink-0 place-items-center rounded-full border-2 border-white bg-brand text-brand-ink shadow-[0_6px_18px_rgba(0,0,0,0.25)]"
        >
          {tipsNew && (
            <>
              <span className="absolute -inset-[7px] animate-[vf-pulse_1.8s_ease-out_infinite] rounded-full border-[3px] border-brand/35 motion-reduce:animate-none" />
              <span className="absolute -top-[3px] -right-[3px] size-[13px] rounded-full border-2 border-white bg-danger" />
            </>
          )}
          <BulbIcon size={21} />
        </button>
      )}
      {onTamil && (
        <button
          type="button"
          aria-label="Tamil typing"
          title="Tamil typing"
          onClick={() => (seenTamil(), onTamil())}
          className="relative grid size-11 shrink-0 place-items-center rounded-full border-2 border-white bg-gold text-[21px] font-semibold text-gold-ink shadow-[0_6px_18px_rgba(0,0,0,0.25)]"
          style={{ fontFamily: TA_FONT }}
        >
          {tamilNew && <span className="absolute -inset-[7px] animate-[vf-pulse_1.8s_ease-out_infinite] rounded-full border-[3px] border-gold-line/60 motion-reduce:animate-none" />}
          த
          <span className="absolute -right-[5px] -bottom-[3px] grid size-[19px] place-items-center rounded-full border-[1.5px] border-white bg-danger text-white">
            <Mic size={11} strokeWidth={2.6} />
          </span>
        </button>
      )}
    </div>
  );
}

/** Honey-gold band: the brand mark (white mic on blue), status chips on the right, a line about the form. */
export function Header({ sub, children }: { sub?: ReactNode; children?: ReactNode }) {
  return (
    <header className="border-b border-header-line bg-header px-3.5 pt-2.5 pb-2 text-header-ink">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-bold">
          <span className="grid size-[22px] place-items-center rounded-md bg-brand text-brand-ink">
            <Mic size={14} strokeWidth={2.4} />
          </span>
          Voice2Fill
        </span>
        {children && <span className="flex shrink-0 items-center gap-1.5">{children}</span>}
      </div>
      {sub && <p className="mt-0.5 truncate text-xs text-header-ink/80">{sub}</p>}
    </header>
  );
}

const CHIP = { plain: 'bg-header-ink/10', warn: 'bg-warn-bg text-warn-ink', danger: 'bg-danger-bg text-danger-ink' };

/** `href`: the chip is a link, opened in a new tab (e.g. "Plan ended" → the upgrade page). */
export function HeaderChip({
  tone = 'plain',
  title,
  href,
  children,
}: {
  tone?: keyof typeof CHIP;
  title?: string;
  href?: string;
  children: ReactNode;
}) {
  const className = cx('inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap tabular-nums', CHIP[tone]);
  return href ? (
    <a href={href} target="_blank" rel="noreferrer" title={title} className={cx(className, 'underline-offset-2 hover:underline')}>
      {children}
    </a>
  ) : (
    <span title={title} className={className}>
      {children}
    </span>
  );
}

export type PillTone = 'accent' | 'live' | 'warn' | 'danger' | 'neutral';
const PILL: Record<PillTone, string> = {
  accent: 'bg-accent-bg text-accent-ink',
  live: 'bg-live-bg text-live-ink',
  warn: 'bg-warn-bg text-warn-ink',
  danger: 'bg-danger-bg text-danger-ink',
  neutral: 'bg-subtle text-ink/75',
};

export function Pill({ tone = 'neutral', children }: { tone?: PillTone; children: ReactNode }) {
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap', PILL[tone])}>
      {children}
    </span>
  );
}

const BANNER = {
  accent: 'border-accent-ink/25 bg-accent-bg text-accent-ink',
  live: 'border-live-ink/25 bg-live-bg text-live-ink',
  warn: 'border-warn-ink/25 bg-warn-bg text-warn-ink',
  danger: 'border-danger-ink/25 bg-danger-bg text-danger-ink',
};

/** The one status line of a screen (what happened, what to do next). */
export function Banner({ tone, icon, children }: { tone: keyof typeof BANNER; icon?: ReactNode; children: ReactNode }) {
  return (
    <div role="status" className={cx('flex items-start gap-2 rounded-lg border px-2.5 py-2 text-[13px]', BANNER[tone])}>
      {icon && <span className="mt-px shrink-0">{icon}</span>}
      <span className="min-w-0">{children}</span>
    </div>
  );
}

export function Progress({ done, total, label }: { done: number; total: number; label: string }) {
  const pct = total ? Math.round((100 * done) / total) : 0;
  return (
    <div className="grid gap-1">
      <div className="flex justify-between text-xs text-muted tabular-nums">
        <span>
          <b className="font-semibold text-ink">{done}</b> of {total} {label}
        </span>
        <span>{pct}%</span>
      </div>
      <div
        role="progressbar"
        aria-label={`Fields ${label}`}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
        className="h-[7px] overflow-hidden rounded-full bg-track"
      >
        <div className="h-full rounded-full bg-accent-ink" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

const groupTitle = 'text-[11px] font-bold tracking-wider uppercase';

/** A group of field rows on a white card (rows read clearly against the gold page). */
export function GroupCard({ title, count, tone, children }: { title: string; count: number; tone?: 'warn'; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-line bg-card px-2.5 pt-1.5 pb-0.5">
      <h2 className={cx('flex justify-between', groupTitle, tone === 'warn' ? 'text-warn-ink' : 'text-muted')}>
        <span>{title}</span>
        <span className="tabular-nums">{count}</span>
      </h2>
      {children}
    </section>
  );
}

/** A group folded away until clicked (fields a choice on the page hides now). */
export function FoldedGroup({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return (
    <details className="group rounded-lg border border-line bg-card px-2.5 pt-1.5 pb-0.5">
      <summary className={cx('flex cursor-pointer list-none items-center gap-1 pb-1 text-muted [&::-webkit-details-marker]:hidden', groupTitle)}>
        <ChevronRight size={12} className="transition-transform group-open:rotate-90 motion-reduce:transition-none" />
        {title}
      </summary>
      <p className="text-xs text-muted">{hint}</p>
      {children}
    </details>
  );
}

const BUTTON = {
  outline: 'border-line bg-card text-ink hover:bg-subtle',
  primary: 'border-ink bg-ink text-page hover:bg-ink/90',
  danger: 'border-transparent bg-danger-bg text-danger-ink hover:bg-danger-bg/80',
};

export function Button({
  className,
  loading,
  variant = 'outline',
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean; variant?: keyof typeof BUTTON }) {
  return (
    <button
      type="button"
      {...props}
      disabled={props.disabled || loading}
      className={cx(
        'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border px-4 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink disabled:cursor-not-allowed disabled:opacity-50',
        BUTTON[variant],
        className,
      )}
    >
      {loading && <Loader2 size={15} className="animate-spin" />}
      {children}
    </button>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className="min-h-10 w-full rounded-lg border border-line bg-card px-3 text-base text-ink placeholder:text-muted/70 focus:border-accent-ink focus:outline-none"
    />
  );
}

/** A field: state icon (✓ filled, ⚠ needs a look), label, value on the right with an optional line under it. */
export function FieldRow({ label, children, sub, icon }: { label: ReactNode; children: ReactNode; sub?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex items-start gap-2 border-b border-row-line py-[7px] text-[13.5px] last:border-b-0">
      <span className="mt-px w-4 shrink-0">{icon}</span>
      {/* Long (often bilingual) labels wrap instead of pushing the row wider than the popup. */}
      <span className="min-w-0 flex-1 break-words text-ink">{label}</span>
      <span className="min-w-0 max-w-[55%] shrink-0 text-right">
        <span className="break-words font-semibold">{children}</span>
        {sub && <span className="mt-0.5 block text-xs font-normal text-muted">{sub}</span>}
      </span>
    </div>
  );
}

export type MenuItem = {
  label: string;
  onSelect: () => void;
  /** Ask first (e.g. ending the form): the question and the button that does it. */
  confirm?: { text: string; action: string };
  /** Set apart at the bottom (Sign out). */
  last?: boolean;
};

/** The ⋯ button and its list, opening upwards from the footer. Closes on a click outside or Esc. */
export function Menu({ items }: { items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const [asking, setAsking] = useState<MenuItem | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const close = () => {
    setOpen(false);
    setAsking(null);
  };
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && close();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <Button aria-label="More" aria-haspopup="menu" aria-expanded={open} className="w-10 px-0" onClick={() => (open ? close() : setOpen(true))}>
        <MoreHorizontal size={16} />
      </Button>
      {open && (
        <div role="menu" className="absolute right-0 bottom-full z-10 mb-2 grid w-52 rounded-lg border border-line bg-card p-1 shadow-lg">
          {asking?.confirm ? (
            <div className="grid gap-2 p-2">
              <p className="text-[13px]">{asking.confirm.text}</p>
              <div className="flex justify-end gap-1.5">
                <Button className="min-h-8 px-2.5 text-[13px]" onClick={close}>
                  Keep
                </Button>
                <Button
                  variant="danger"
                  className="min-h-8 px-2.5 text-[13px]"
                  onClick={() => {
                    close();
                    asking.onSelect();
                  }}
                >
                  {asking.confirm.action}
                </Button>
              </div>
            </div>
          ) : (
            items.map((item) => (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                className={cx(
                  'rounded-md px-2.5 py-2 text-left text-[13.5px] hover:bg-subtle focus-visible:outline-2 focus-visible:outline-accent-ink',
                  item.last ? 'mt-1 rounded-t-none border-t border-line pt-2.5 text-muted' : 'text-ink',
                )}
                onClick={() => {
                  if (item.confirm) setAsking(item);
                  else {
                    close();
                    item.onSelect();
                  }
                }}
              >
                {item.label}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

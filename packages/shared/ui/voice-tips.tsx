import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AUTO_STOP_SECONDS, TIPS_TEXT, VOICE_TIPS, type TipId, type TipsLang } from '../src/voice-tips';

/*
 * The voice tips as illustrated cards, one per screen, shared by the extension popup and the phone
 * (each app adds its own bubble and sheet around it). Styled with the shared token classes: both apps
 * list this folder as a Tailwind @source.
 */

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');
export const TA_FONT = "'Noto Sans Tamil', Latha, 'Nirmala UI', sans-serif";
const taStyle = (lang: TipsLang) => (lang === 'ta' ? { fontFamily: TA_FONT } : undefined);

/** The lightbulb on the tips bubble and the sheet header. */
export function BulbIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 18h6" />
      <path d="M10 22h4" />
      <path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.1V17h6v-.2c0-.8.4-1.6 1-2.1A7 7 0 0 0 12 2z" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

/**
 * The six tips. `operatorNote`: a line for the person showing the tips to someone else (the popup).
 * Swipe, the arrow keys or Back / Next move between cards; Done or ✕ calls `onClose`.
 */
export function TipsDeck({ lang, operatorNote, onClose }: { lang: TipsLang; operatorNote?: string; onClose: () => void }) {
  const [i, setI] = useState(0);
  const swipe = useRef<number | null>(null);
  const x = TIPS_TEXT[lang];
  const other: TipsLang = lang === 'en' ? 'ta' : 'en';
  const tip = VOICE_TIPS[i];
  const last = i === VOICE_TIPS.length - 1;
  const go = (d: number) => setI((n) => Math.min(VOICE_TIPS.length - 1, Math.max(0, n + d)));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-page text-ink">
      <header className="flex items-start gap-2.5 bg-brand px-3.5 pt-2.5 pb-2.5 text-brand-ink">
        <span className="grid size-[26px] shrink-0 place-items-center rounded-md bg-white/20">
          <BulbIcon size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[14.5px] leading-tight font-bold" style={taStyle(lang)}>
            {x.title}
          </p>
          <p className="text-[11px] opacity-85" style={taStyle(other)}>
            {TIPS_TEXT[other].title}
          </p>
        </div>
        <button type="button" aria-label={x.close} onClick={onClose} className="grid size-8 shrink-0 place-items-center rounded-lg bg-white/15 hover:bg-white/25">
          <CloseIcon />
        </button>
      </header>

      <div className="flex gap-1 px-3.5 pt-2.5" aria-hidden="true">
        {VOICE_TIPS.map((t, n) => (
          <i key={t.id} className={cx('h-1 flex-1 rounded-full', n <= i ? 'bg-brand' : 'bg-line')} />
        ))}
      </div>

      <div
        className="flex min-h-0 flex-1 touch-pan-y flex-col gap-2 overflow-y-auto px-3.5 pt-2.5 pb-3"
        aria-live="polite"
        onPointerDown={(e) => (swipe.current = e.clientX)}
        onPointerUp={(e) => {
          const from = swipe.current;
          swipe.current = null;
          if (from === null) return;
          const dx = e.clientX - from;
          if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
        }}
      >
        {operatorNote && <span className="self-start rounded-md bg-subtle px-2 py-1 text-[11.5px] text-ink/80">{operatorNote}</span>}
        <span className="text-[10.5px] font-bold tracking-wider text-accent-ink uppercase" style={taStyle(lang)}>
          {x.step.replace('{n}', String(i + 1)).replace('{total}', String(VOICE_TIPS.length))}
        </span>
        <div className="relative grid min-h-[150px] place-items-center rounded-xl bg-accent-bg p-3">
          <Art id={tip.id} lang={lang} />
        </div>
        <h3 className="text-base leading-snug font-semibold text-balance" style={taStyle(lang)}>
          {tip.title[lang]}
        </h3>
        <p className="-mt-1 text-[12.5px] text-muted" style={taStyle(other)}>
          {tip.title[other]}
        </p>
        <p className="text-[13px] leading-relaxed text-ink/85" style={taStyle(lang)}>
          {tip.body[lang]}
        </p>
        <span
          className={cx(
            'self-start rounded-md px-2 py-0.5 text-[11px] font-semibold',
            tip.tag === 'money' ? 'bg-live-bg text-live-ink' : 'bg-warn-bg text-warn-ink',
          )}
          style={taStyle(lang)}
        >
          {tip.tag === 'money' ? `₹ ${x.money}` : `✓ ${x.accuracy}`}
        </span>
      </div>

      <footer className="flex gap-2 border-t border-line bg-card px-3.5 py-2.5">
        <button
          type="button"
          onClick={() => (i === 0 ? onClose() : go(-1))}
          className="min-h-11 w-24 rounded-xl border border-line bg-card text-sm font-semibold hover:bg-subtle"
          style={taStyle(lang)}
        >
          {i === 0 ? x.skip : `← ${x.back}`}
        </button>
        <button
          type="button"
          onClick={() => (last ? onClose() : go(1))}
          className="min-h-11 flex-1 rounded-xl bg-brand text-sm font-semibold text-brand-ink hover:opacity-90"
          style={taStyle(lang)}
        >
          {last ? x.done : `${x.next} →`}
        </button>
      </footer>
    </div>
  );
}

// ---------- illustrations ----------

function Art({ id, lang }: { id: TipId; lang: TipsLang }) {
  switch (id) {
    case 'label':
      return <SayArt />;
    case 'pace':
      return <PaceArt />;
    case 'stop':
      return <StopArt />;
    case 'numbers':
      return <NumbersArt />;
    case 'type':
      return <TypeArt lang={lang} />;
    case 'close':
      return <CloseArt />;
  }
}

function Say({ good, children, sub }: { good: boolean; children: ReactNode; sub?: string }) {
  return (
    <div
      className={cx(
        'relative rounded-2xl py-2 pr-3 pl-9 text-[13.5px] font-semibold',
        good ? 'border-2 border-live-ink bg-card' : 'border-2 border-dashed border-danger/50 bg-danger-bg/60 text-danger-ink',
      )}
    >
      <span
        className={cx('absolute top-1/2 left-2.5 grid size-[18px] -translate-y-1/2 place-items-center rounded-full text-[11px] font-bold text-white', good ? 'bg-live-ink' : 'bg-danger')}
        aria-hidden="true"
      >
        {good ? '✓' : '✕'}
      </span>
      {children}
      {sub && (
        <span className="block text-[11.5px] font-medium opacity-75" style={{ fontFamily: TA_FONT }}>
          {sub}
        </span>
      )}
    </div>
  );
}

const Chip = ({ children }: { children: ReactNode }) => <span className="mr-1 rounded bg-brand px-1.5 text-[11.5px] text-brand-ink">{children}</span>;

function SayArt() {
  return (
    <div className="grid w-full gap-2">
      <Say good sub="பெயர் சௌரவ்">
        <Chip>Name</Chip>Saurav
      </Say>
      <Say good>
        <Chip>Mobile</Chip>98765 43210
      </Say>
      <Say good={false} sub="என் பெயர் சௌரவ்…">
        <s className="decoration-danger decoration-2">My name is Saurav</s>
      </Say>
    </div>
  );
}

function PaceArt() {
  return (
    <div className="grid justify-items-center gap-1.5">
      <svg width="210" height="114" viewBox="0 0 220 120" role="img" aria-label="Speed gauge: too slow, just right, too fast. The needle points to just right.">
        <path d="M30 104 A80 80 0 0 1 72 34" fill="none" className="stroke-danger/30" strokeWidth={18} />
        <path d="M74 33 A80 80 0 0 1 146 33" fill="none" className="stroke-live-ink/50" strokeWidth={18} />
        <path d="M148 34 A80 80 0 0 1 190 104" fill="none" className="stroke-danger/30" strokeWidth={18} />
        <line x1="110" y1="104" x2="112" y2="40" className="stroke-ink" strokeWidth={4} strokeLinecap="round" />
        <circle cx="110" cy="104" r="8" className="fill-ink" />
        <text x="22" y="118" fontSize="10.5" className="fill-danger-ink">
          Too slow
        </text>
        <text x="110" y="15" fontSize="11" fontWeight="700" textAnchor="middle" className="fill-live-ink">
          Just right
        </text>
        <text x="198" y="118" fontSize="10.5" textAnchor="end" className="fill-danger-ink">
          Too fast
        </text>
      </svg>
      <div className="flex gap-1.5">
        {['hmm…', 'uh…', 'okay so…'].map((w) => (
          <span key={w} className="relative rounded-full border border-line bg-card px-2.5 py-0.5 text-xs text-muted">
            {w}
            <span className="absolute inset-x-1 top-1/2 h-0.5 -rotate-12 bg-danger" aria-hidden="true" />
          </span>
        ))}
      </div>
    </div>
  );
}

function StopArt() {
  return (
    <div className="grid justify-items-center gap-2">
      <div className="relative size-[104px]">
        <svg viewBox="0 0 108 108" className="absolute inset-0" aria-hidden="true">
          <circle cx="54" cy="54" r="48" fill="none" className="stroke-card" strokeWidth={7} />
          <circle
            cx="54"
            cy="54"
            r="48"
            fill="none"
            className="stroke-brand animate-[vf-drain_4s_linear_infinite] motion-reduce:animate-none"
            strokeWidth={7}
            strokeLinecap="round"
            strokeDasharray="302"
            transform="rotate(-90 54 54)"
          />
        </svg>
        <span className="absolute inset-4 grid place-items-center rounded-full bg-danger shadow-[0_6px_16px_rgba(212,67,61,0.35)]">
          <span className="size-[22px] rounded bg-white" />
        </span>
        <span className="absolute -top-0.5 -right-1 rounded-full bg-ink px-2 py-0.5 text-[11px] font-bold text-page">{AUTO_STOP_SECONDS} s</span>
      </div>
      <div className="grid gap-1 text-[11px] text-muted">
        <div className="flex h-[7px] w-32 overflow-hidden rounded-full bg-card" role="img" aria-label="Minutes used: speech and silence both count">
          <span className="w-[62%] bg-brand" />
          <span className="w-[38%] bg-[repeating-linear-gradient(45deg,var(--vf-danger)_0_3px,transparent_3px_6px)] opacity-50" />
        </div>
        <div className="flex gap-3">
          <span className="inline-flex items-center gap-1">
            <i className="size-2 rounded-sm bg-brand" /> speech
          </span>
          <span className="inline-flex items-center gap-1">
            <i className="size-2 rounded-sm bg-danger/50" /> silence, also counted
          </span>
        </div>
      </div>
    </div>
  );
}

function NumbersArt() {
  const group = (parts: string[]) => (
    <div className="flex gap-1.5">
      {parts.map((p, n) => (
        <span key={n} className="rounded-lg border-2 border-brand bg-card px-2 py-0.5 text-[15px] font-bold tracking-wider tabular-nums">
          {p}
        </span>
      ))}
    </div>
  );
  return (
    <div className="grid justify-items-center gap-2">
      {group(['98765', '43210'])}
      {group(['1234', '5678', '9012'])}
      <span className="rounded-lg bg-card px-2.5 py-0.5 text-[13px] font-semibold">15 August 1990</span>
    </div>
  );
}

function TypeArt({ lang }: { lang: TipsLang }) {
  return (
    <>
      <span className="absolute top-2.5 right-2.5 rounded-full bg-live-ink px-2 py-0.5 text-[10.5px] font-bold text-page uppercase" style={taStyle(lang)}>
        {TIPS_TEXT[lang].free}
      </span>
      <div className="flex w-full items-center gap-2 rounded-xl border border-line bg-card px-2.5 py-2">
        <div className="min-w-0 flex-1">
          <div className="text-[11.5px] font-semibold">District *</div>
          <div className="text-[13px]">
            <del className="text-danger-ink">Erodu</del> → <ins className="font-semibold text-live-ink no-underline">Erode</ins>
          </div>
        </div>
        <span className="inline-flex items-center gap-1 rounded-lg bg-brand px-2.5 py-1.5 text-[11.5px] font-semibold text-brand-ink ring-4 ring-brand/20" style={taStyle(lang)}>
          ✎ {lang === 'ta' ? 'தட்டச்சு' : 'Type'}
        </span>
      </div>
    </>
  );
}

function CloseArt() {
  return (
    <svg width="210" height="130" viewBox="0 0 210 130" role="img" aria-label="Mouth pointing at the microphone at the bottom of the phone, a hand's length away; TV, fan and speakerphone crossed out">
      <circle cx="36" cy="46" r="24" className="fill-card stroke-ink" strokeWidth={2.5} />
      <circle cx="30" cy="40" r="2.5" className="fill-ink" />
      <path d="M50 52 q8 2 10 6 q-6 4 -10 4" className="fill-danger stroke-ink" strokeWidth={2} strokeLinejoin="round" />
      <path d="M70 52 q6 7 0 14" fill="none" className="stroke-brand" strokeWidth={2.5} strokeLinecap="round" />
      <path d="M79 48 q9 11 0 22" fill="none" className="stroke-brand" strokeWidth={2.5} strokeLinecap="round" opacity={0.75} />
      <path d="M88 44 q12 15 0 30" fill="none" className="stroke-brand" strokeWidth={2.5} strokeLinecap="round" opacity={0.5} />
      <g transform="translate(140 44) rotate(35)">
        <rect x="-13" y="-28" width="26" height="50" rx="5" className="fill-ink" />
        <rect x="-10" y="-23" width="20" height="36" rx="2" className="fill-accent-bg" />
        <circle cx="0" cy="18" r="7.5" fill="none" className="stroke-brand" strokeWidth={2.5} />
        <circle cx="0" cy="18" r="2.2" className="fill-page" />
      </g>
      <line x1="132" y1="68" x2="150" y2="82" className="stroke-brand" strokeWidth={1.5} />
      <text x="152" y="88" fontSize="10.5" fontWeight="700" className="fill-accent-ink">
        Phone mic
      </text>
      <path d="M60 84 h62" className="stroke-muted" strokeWidth={1.5} strokeDasharray="3 3" />
      <text x="91" y="80" fontSize="9.5" textAnchor="middle" className="fill-muted">
        1 hand
      </text>
      <g transform="translate(30 104)">
        <rect x="0" y="0" width="30" height="20" rx="3" className="fill-card stroke-muted" strokeWidth={2} />
        <line x1="-3" y1="22" x2="33" y2="-2" className="stroke-danger" strokeWidth={2.5} />
      </g>
      <g transform="translate(90 104)">
        <circle cx="11" cy="10" r="10" className="fill-card stroke-muted" strokeWidth={2} />
        <path d="M11 10 l0 -8 M11 10 l7 4 M11 10 l-7 4" className="stroke-muted" strokeWidth={2} />
        <line x1="-3" y1="22" x2="25" y2="-2" className="stroke-danger" strokeWidth={2.5} />
      </g>
      <g transform="translate(148 104)">
        <path d="M2 6 h6 l8 -6 v20 l-8 -6 h-6z" className="fill-card stroke-muted" strokeWidth={2} />
        <path d="M20 4 q5 6 0 12" fill="none" className="stroke-muted" strokeWidth={2} />
        <line x1="-3" y1="22" x2="27" y2="-2" className="stroke-danger" strokeWidth={2.5} />
      </g>
    </svg>
  );
}

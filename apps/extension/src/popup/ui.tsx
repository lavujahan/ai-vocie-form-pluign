import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

// Same components and tokens as apps/web/components/ui.tsx, sized for a 360px popup.

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={cx('rounded-xl border border-line bg-card p-4', className)}>{children}</section>;
}

export type PillTone = 'accent' | 'live' | 'warn' | 'danger' | 'neutral';
const PILL: Record<PillTone, string> = {
  accent: 'bg-accent-bg text-accent-ink',
  live: 'bg-live-bg text-live-ink',
  warn: 'bg-warn-bg text-warn-ink',
  danger: 'bg-danger-bg text-danger-ink',
  neutral: 'bg-subtle text-muted',
};

export function Pill({ tone = 'neutral', children }: { tone?: PillTone; children: ReactNode }) {
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap', PILL[tone])}>
      {children}
    </span>
  );
}

export function Button({
  className,
  loading,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean }) {
  return (
    <button
      {...props}
      disabled={props.disabled || loading}
      className={cx(
        'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-line bg-card px-4 text-sm font-medium text-ink transition-colors hover:bg-subtle disabled:cursor-not-allowed disabled:opacity-50',
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

export function FieldRow({ label, children, sub }: { label: ReactNode; children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-line py-2 text-sm last:border-b-0">
      <span className="shrink-0 text-ink/80">{label}</span>
      <span className="min-w-0 text-right">
        <span className="break-words font-medium">{children}</span>
        {sub && <span className="mt-0.5 block text-xs text-muted">{sub}</span>}
      </span>
    </div>
  );
}

export function LinkButton({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button {...props} className="text-xs text-muted underline-offset-2 hover:text-ink hover:underline">
      {children}
    </button>
  );
}

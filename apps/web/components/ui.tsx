import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

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
    <span className={cx('inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap', PILL[tone])}>
      {children}
    </span>
  );
}

export function Button({
  className,
  variant = 'outline',
  loading,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'outline' | 'primary' | 'ghost'; loading?: boolean }) {
  return (
    <button
      {...props}
      disabled={props.disabled || loading}
      className={cx(
        'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        variant === 'outline' && 'border border-line bg-card text-ink hover:bg-subtle',
        variant === 'primary' && 'bg-ink text-page hover:opacity-90',
        variant === 'ghost' && 'text-muted hover:bg-subtle hover:text-ink',
        className,
      )}
    >
      {loading && <Loader2 size={16} className="animate-spin" />}
      {children}
    </button>
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cx(
        'min-h-11 w-full rounded-lg border border-line bg-card px-3 text-base text-ink placeholder:text-muted/70 focus:border-accent-ink focus:outline-none',
        className,
      )}
    />
  );
}

/** Label on the left, value (or a status pill) right-aligned; rows are separated by dividers. */
export function FieldRow({
  label,
  children,
  sub,
  onClick,
  active,
}: {
  label: ReactNode;
  children: ReactNode;
  sub?: ReactNode;
  onClick?: () => void;
  active?: boolean;
}) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cx(
        'flex w-full items-start justify-between gap-3 border-b border-line py-2.5 text-left text-sm last:border-b-0',
        onClick && 'min-h-12 cursor-pointer',
        active && '-mx-2 rounded-lg bg-accent-bg/50 px-2',
      )}
    >
      <span className="shrink-0 pt-px text-ink/80">{label}</span>
      <span className="min-w-0 text-right">
        <span className="break-words font-medium">{children}</span>
        {sub && <span className="mt-0.5 block text-xs text-muted">{sub}</span>}
      </span>
    </Tag>
  );
}

export { cx };

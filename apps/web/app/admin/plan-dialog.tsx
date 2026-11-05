'use client';

import { useEffect, useState } from 'react';
import { Monitor, X } from 'lucide-react';
import {
  COUNTER_LABELS,
  TOPUP_MINUTES,
  TOPUP_PRICE_INR,
  type AdminUserRow,
  type ExtraRequest,
  type PaymentMethod,
  type PlanStatus,
  type UserPlanResponse,
} from '@vff/shared';
import { Button, Card, Input, Pill, cx, type PillTone } from '@/components/ui';
import { api } from './api';
import { inr, shortDate } from './dates';
import { METHODS, methodLabel } from './methods';

const DAY_MS = 86_400_000;
export const SELECT ='min-h-11 w-full rounded-lg border border-line bg-card px-3 text-base text-ink focus:border-accent-ink focus:outline-none';

const date = (iso: string | null) => (iso ? shortDate.format(new Date(iso)) : '—');

/** Pill text and tone for a user's plan: ended or used up (red), ending soon or nearly used up (amber). */
export function planBadge(p: PlanStatus): { label: string; tone: PillTone } {
  if (!p.plan_id) return { label: 'No plan', tone: 'neutral' };
  if (!p.active) return { label: `${p.plan_name} · ended`, tone: 'danger' };
  if (p.minutes_left <= 0) return { label: `${p.plan_name} · used up`, tone: 'danger' };
  const endsSoon = !!p.paid_until && Date.parse(p.paid_until) - Date.now() < 3 * DAY_MS;
  const low = p.minutes_total > 0 && p.minutes_left < p.minutes_total * 0.1;
  return { label: p.plan_name ?? p.plan_id, tone: endsSoon || low ? 'warn' : 'live' };
}

/** The Plan column of the Users table. */
export function PlanCell({ user }: { user: AdminUserRow }) {
  if (user.role === 'admin') return <span className="text-xs text-muted">Unlimited</span>;
  const p = user.plan;
  if (!p) return <span className="text-xs text-muted">—</span>;
  const badge = planBadge(p);
  return (
    <div>
      <Pill tone={badge.tone}>{badge.label}</Pill>
      {p.plan_id && (
        <div className="mt-0.5 text-xs tabular-nums whitespace-nowrap text-muted">
          {Math.floor(p.minutes_left)} of {p.minutes_total} min left · {p.active ? 'till' : 'ended'} {date(p.active ? p.paid_until : p.ends_at)}
        </div>
      )}
    </div>
  );
}

type Mode = 'renew' | 'extra';
type ExtraKind = ExtraRequest['kind'];
const EXTRA_KINDS: ExtraKind[] = ['minutes', 'documents', 'voice_qrs', 'nonvoice_qrs', 'computers'];
/** Default amount for an extra: the usual top-up for minutes; the admin sets a price for the others. */
const defaultCount = (k: ExtraKind) => (k === 'minutes' ? TOPUP_MINUTES : k === 'computers' ? 1 : 50);
const defaultAmount = (k: ExtraKind) => (k === 'minutes' ? TOPUP_PRICE_INR : 0);

/** This period's use of each counter, with + Add (minutes first). null: no limit. */
function usageRows(p: PlanStatus, computersInUse: number | null): { kind: ExtraKind; used: number; total: number | null }[] {
  const rows: { kind: ExtraKind; used: number; total: number | null }[] = [
    { kind: 'minutes', used: Math.min(p.minutes_total, Math.floor(p.minutes_used)), total: p.minutes_total },
  ];
  const c = p.counters;
  if (!c) return rows;
  rows.push(
    { kind: 'documents', ...c.documents },
    { kind: 'voice_qrs', ...c.voice_qrs },
    { kind: 'nonvoice_qrs', ...c.nonvoice_qrs },
    { kind: 'computers', used: computersInUse ?? 0, total: c.computers },
  );
  return rows;
}

/** A user's plan: renew or change it, add minutes, and see past periods and payments. */
export function PlanDialog({ user, onClose, onSaved }: { user: AdminUserRow; onClose: () => void; onSaved: (u: AdminUserRow) => void }) {
  const [data, setData] = useState<UserPlanResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('renew');
  const [planId, setPlanId] = useState('');
  const [start, setStart] = useState<'after_current' | 'now'>('after_current');
  const [kind, setKind] = useState<ExtraKind>('minutes');
  const [count, setCount] = useState(String(TOPUP_MINUTES));
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('upi');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const d = await api<UserPlanResponse>(`/api/admin/users/${user.id}/plan`);
      setData(d);
      setError(null);
      return d;
    } catch (e) {
      setError((e as Error).message);
      return null;
    }
  };

  useEffect(() => {
    void load().then((d) => {
      if (!d) return;
      // Renewing the same plan is the common case; a user on the Trial is offered the first paid plan.
      const current = d.plans.find((p) => p.id === d.user.plan?.plan_id && p.is_active && p.price_inr > 0);
      const pick = current ?? d.plans.find((p) => p.is_active && p.price_inr > 0) ?? d.plans.find((p) => p.is_active);
      if (pick) {
        setPlanId(pick.id);
        setAmount(String(pick.price_inr));
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id]);

  const status = data?.user.plan ?? user.plan;
  const canTopUp = !!status?.active;
  const plan = data?.plans.find((p) => p.id === planId);

  function switchMode(m: Mode) {
    setMode(m);
    setError(null);
    setAmount(m === 'extra' ? String(defaultAmount(kind)) : String(plan?.price_inr ?? ''));
  }

  function pickExtra(k: ExtraKind) {
    setKind(k);
    setCount(String(defaultCount(k)));
    setAmount(String(defaultAmount(k)));
    setMode('extra');
    setError(null);
  }

  async function signOut(deviceId: string) {
    setError(null);
    try {
      await api(`/api/admin/users/${user.id}/devices/${deviceId}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const payment = { amount_inr: Number(amount) || 0, method, reference: reference || undefined, note: note || undefined };
    try {
      const { user: saved } = await api<{ user: AdminUserRow }>(`/api/admin/users/${user.id}/${mode === 'renew' ? 'plan' : 'extra'}`, {
        method: 'POST',
        body: JSON.stringify(mode === 'renew' ? { plan_id: planId, start, ...payment } : { kind, count: Number(count), ...payment }),
      });
      onSaved(saved);
      setReference('');
      setNote('');
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const valid =
    Number(amount) >= 0 && (mode === 'renew' ? !!plan : Number.isInteger(Number(count)) && Number(count) > 0);
  // A renewal starts when the paid time ends; say when.
  const renewStarts =
    start === 'now' || !status?.paid_until || Date.parse(status.paid_until) <= Date.now() ? 'today' : date(status.paid_until);

  return (
    <div className="fixed inset-0 z-10 grid place-items-center bg-black/30 px-4 py-6" onClick={onClose}>
      <div className="max-h-full w-full max-w-lg overflow-y-auto rounded-xl" onClick={(e) => e.stopPropagation()}>
        <Card>
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">Plan · {user.name}</h2>
            <button type="button" onClick={onClose} aria-label="Close" className="text-muted hover:text-ink">
              <X size={18} />
            </button>
          </div>

          {status && (
            <div className="mt-3 rounded-lg bg-subtle px-3 py-2 text-sm">
              {status.plan_id ? (
                <>
                  <div className="flex items-center gap-2">
                    <Pill tone={planBadge(status).tone}>{planBadge(status).label}</Pill>
                    <span className="text-muted">
                      {date(status.starts_at)} – {date(status.ends_at)}
                    </span>
                  </div>
                  <div className="mt-1 tabular-nums">
                    {status.minutes_used} of {status.minutes_total} voice minutes used · {Math.floor(status.minutes_left)} left
                  </div>
                  {status.paid_until && status.paid_until !== status.ends_at && (
                    <div className="text-xs text-muted">Renewed until {date(status.paid_until)}</div>
                  )}
                </>
              ) : (
                <span className="text-muted">No plan yet.</span>
              )}
            </div>
          )}

          {status?.plan_id && status.active && (
            <section className="mt-4">
              <h3 className="text-xs font-semibold text-muted">Use this period</h3>
              <ul className="mt-1 divide-y divide-line text-sm">
                {usageRows(status, data?.devices?.length ?? null).map((r) => {
                  const pct = r.total ? Math.min(100, Math.round((r.used / r.total) * 100)) : 0;
                  return (
                    <li key={r.kind} className="grid grid-cols-[1fr_auto_auto] items-center gap-x-3 gap-y-1 py-2">
                      <span>{COUNTER_LABELS[r.kind]}</span>
                      <span className="text-xs tabular-nums text-muted">
                        <b className="font-semibold text-ink">{r.used}</b> {r.total === null ? '· no limit' : `of ${r.total}`}
                      </span>
                      <Button type="button" className="min-h-8 px-2.5 text-xs" onClick={() => pickExtra(r.kind)}>
                        + Add
                      </Button>
                      {r.total !== null && (
                        <div className="h-1.5 overflow-hidden rounded-full bg-subtle">
                          <div className={cx('h-full rounded-full', pct >= 100 ? 'bg-danger' : pct >= 80 ? 'bg-warn-ink' : 'bg-accent-ink')} style={{ width: `${pct}%` }} />
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {!!data?.devices?.length && (
            <section className="mt-4">
              <h3 className="text-xs font-semibold text-muted">
                Computers signed in · {data.devices.length}
                {status?.counters?.computers != null && ` of ${status.counters.computers}`}
              </h3>
              <ul className="mt-1 divide-y divide-line text-sm">
                {data.devices.map((d) => (
                  <li key={d.id} className="flex items-center gap-3 py-2">
                    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent-bg text-accent-ink">
                      <Monitor size={16} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{d.name}</span>
                      <span className="block text-xs text-muted">
                        {d.label ? `${d.label} · ` : ''}last used {shortDate.format(new Date(d.last_seen_at))}{' '}
                        {new Date(d.last_seen_at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}
                      </span>
                    </span>
                    <Button type="button" className="min-h-8 px-2.5 text-xs" onClick={() => signOut(d.id)}>
                      Sign out
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className="mt-4 flex gap-1 rounded-lg bg-subtle p-1 text-sm" role="tablist">
            {(
              [
                ['renew', 'Renew / change plan'],
                ['extra', 'Add extra'],
              ] as const
            ).map(([m, label]) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                disabled={m === 'extra' && !canTopUp}
                title={m === 'extra' && !canTopUp ? 'Needs an active plan' : undefined}
                onClick={() => switchMode(m)}
                className={cx(
                  'flex-1 rounded-md px-3 py-1.5 font-medium disabled:opacity-40',
                  mode === m ? 'bg-card text-ink shadow-sm' : 'text-muted hover:text-ink',
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <form onSubmit={save} className="mt-3 space-y-3">
            {mode === 'renew' ? (
              <>
                <label className="block">
                  <span className="text-xs font-medium text-muted">Plan</span>
                  <select
                    className={cx(SELECT, 'mt-1')}
                    value={planId}
                    onChange={(e) => {
                      setPlanId(e.target.value);
                      const p = data?.plans.find((x) => x.id === e.target.value);
                      if (p) setAmount(String(p.price_inr));
                    }}
                  >
                    {data?.plans
                      .filter((p) => p.is_active)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} · {inr.format(p.price_inr)} · {p.minutes} min · {p.days} days
                        </option>
                      ))}
                  </select>
                </label>
                <fieldset className="space-y-1 text-sm">
                  <label className="flex items-start gap-2">
                    <input type="radio" className="mt-1" checked={start === 'after_current'} onChange={() => setStart('after_current')} />
                    <span>
                      Renew: starts when the current plan ends
                      <span className="block text-xs text-muted">Unused minutes don’t carry over.</span>
                    </span>
                  </label>
                  <label className="flex items-start gap-2">
                    <input type="radio" className="mt-1" checked={start === 'now'} onChange={() => setStart('now')} />
                    <span>
                      Start now
                      <span className="block text-xs text-muted">Ends the current plan today (upgrade, or after the minutes ran out).</span>
                    </span>
                  </label>
                </fieldset>
                {plan && (
                  <p className="text-xs text-muted">
                    {plan.name} starts {renewStarts} with {plan.minutes} voice minutes for {plan.days} days.
                  </p>
                )}
              </>
            ) : (
              <div className="grid grid-cols-[1.4fr_1fr] gap-2">
                <label className="block">
                  <span className="text-xs font-medium text-muted">Add</span>
                  <select className={cx(SELECT, 'mt-1')} value={kind} onChange={(e) => pickExtra(e.target.value as ExtraKind)}>
                    {EXTRA_KINDS.map((k) => (
                      <option key={k} value={k}>
                        {COUNTER_LABELS[k]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-muted">How many (until {date(status?.ends_at ?? null)})</span>
                  <Input inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value.replace(/\D/g, '').slice(0, 6))} className="mt-1" />
                </label>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="text-xs font-medium text-muted">Amount paid (₹)</span>
                <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} className="mt-1" />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-muted">Paid by</span>
                <select className={cx(SELECT, 'mt-1')} value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
                  {METHODS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <Input placeholder="UPI / bank reference (optional)" value={reference} maxLength={100} onChange={(e) => setReference(e.target.value)} />
            <Input placeholder="Note (optional)" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
            {Number(amount) === 0 && <p className="text-xs text-muted">Amount 0: no payment is recorded (free).</p>}
            {error && <p className="text-xs text-danger-ink">{error}</p>}
            <Button type="submit" variant="primary" className="w-full" loading={busy} disabled={!valid || !data}>
              {mode === 'renew' ? 'Save plan' : `Add ${count || ''} ${COUNTER_LABELS[kind]}`}
            </Button>
          </form>

          {!!data?.payments.length && (
            <section className="mt-5">
              <h3 className="text-xs font-semibold text-muted">Payments</h3>
              <ul className="mt-1 divide-y divide-line text-sm">
                {data.payments.map((p) => (
                  <li key={p.id} className="flex items-baseline justify-between gap-3 py-1.5">
                    <span>
                      {date(p.paid_at)} · {p.kind === 'topup' ? 'Minutes' : (p.plan_name ?? 'Plan')}
                      <span className="block text-xs text-muted">
                        {methodLabel(p.method)}
                        {p.reference && ` · ${p.reference}`}
                        {p.note && ` · ${p.note}`}
                      </span>
                    </span>
                    <span className="font-medium tabular-nums">{inr.format(p.amount_inr)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {!!data?.subscriptions.length && (
            <section className="mt-4">
              <h3 className="text-xs font-semibold text-muted">Plan periods</h3>
              <ul className="mt-1 divide-y divide-line text-sm">
                {data.subscriptions.map((s) => (
                  <li key={s.id} className="flex items-baseline justify-between gap-3 py-1.5">
                    <span>
                      {s.plan_name}
                      <span className="block text-xs text-muted">
                        {date(s.starts_at)} – {date(s.ends_at)}
                      </span>
                    </span>
                    <span className="text-xs tabular-nums text-muted">
                      {s.minutes}
                      {s.extra_minutes > 0 && ` + ${s.extra_minutes}`} min
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </Card>
      </div>
    </div>
  );
}

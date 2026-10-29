'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut, Pencil, Search, X } from 'lucide-react';
import type { PaymentRow, PaymentsResponse } from '@vff/shared';
import { Button, Card, Input, cx } from '@/components/ui';
import { AdminNav } from '../admin-nav';
import { api } from '../api';
import { DateRange, type Range } from '../date-range';
import { inr, isDay, istDay, monthRange, shortDate, todayIst } from '../dates';
import { METHODS, methodLabel } from '../methods';
import { SELECT } from '../plan-dialog';

const date = (iso: string) => shortDate.format(new Date(iso));
const forLabel = (p: PaymentRow) => (p.kind === 'topup' ? 'Extra minutes' : (p.plan_name ?? 'Plan'));

/** Every payment in the chosen dates, with search and filters, and fixing a payment's details. */
export function PaymentsAdmin({ from, to }: { from?: string; to?: string }) {
  const router = useRouter();
  const [range, setRange] = useState<Range>(() => (from && to && isDay(from) && isDay(to) ? { from, to } : monthRange(0)));
  const [payments, setPayments] = useState<PaymentRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [method, setMethod] = useState('');
  const [kind, setKind] = useState('');
  const [editing, setEditing] = useState<PaymentRow | null>(null);

  const load = useCallback(
    async (r: Range) => {
      setLoading(true);
      try {
        setPayments((await api<PaymentsResponse>(`/api/admin/payments?${new URLSearchParams(r)}`)).payments);
        setError(null);
      } catch (e) {
        setError((e as Error).message);
        if ((e as Error).message.includes('sign in')) router.replace('/admin/login');
      } finally {
        setLoading(false);
      }
    },
    [router],
  );

  useEffect(() => {
    if (isDay(range.from) && isDay(range.to) && range.from <= range.to) void load(range);
  }, [range, load]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (payments ?? []).filter(
      (p) =>
        (!method || p.method === method) &&
        (!kind || p.kind === kind) &&
        (!q || [p.name, p.phone, p.reference, p.note].some((s) => s?.toLowerCase().includes(q))),
    );
  }, [payments, query, method, kind]);

  const total = shown.reduce((sum, p) => sum + p.amount_inr, 0);
  const byMethod = [...shown.reduce((m, p) => m.set(p.method, (m.get(p.method) ?? 0) + p.amount_inr), new Map<string, number>())];

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/admin/login');
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <header className="mb-4 flex items-center justify-between gap-3">
        <AdminNav />
        <Button variant="ghost" onClick={logout} aria-label="Sign out">
          <LogOut size={16} />
        </Button>
      </header>

      <div className="mb-4 grid gap-3 md:grid-cols-[auto_1fr]">
        <DateRange range={range} onChange={setRange} />
        <Card>
          <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
            <label className="block">
              <span className="text-xs font-medium text-muted">Search</span>
              <div className="relative mt-1">
                <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
                <Input placeholder="Name, phone or reference" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-9" />
              </div>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-muted">Paid by</span>
              <select className={cx(SELECT, 'mt-1')} value={method} onChange={(e) => setMethod(e.target.value)}>
                <option value="">All</option>
                {METHODS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-muted">For</span>
              <select className={cx(SELECT, 'mt-1')} value={kind} onChange={(e) => setKind(e.target.value)}>
                <option value="">All</option>
                <option value="plan">Plan</option>
                <option value="topup">Extra minutes</option>
              </select>
            </label>
          </div>
          <p className="mt-3 text-sm">
            <b className="tabular-nums">{shown.length}</b> payment{shown.length === 1 ? '' : 's'} ·{' '}
            <b className="tabular-nums">{inr.format(total)}</b>
            {byMethod.length > 1 && (
              <span className="text-muted">
                {' '}
                ({byMethod.map(([m, amount]) => `${methodLabel(m)} ${inr.format(amount)}`).join(' · ')})
              </span>
            )}
          </p>
        </Card>
      </div>

      {error && <p className="mb-3 rounded-lg bg-danger-bg px-4 py-2 text-sm text-danger-ink">{error}</p>}

      <Card className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="px-4 py-2 font-medium">Date</th>
                <th className="px-4 py-2 font-medium">User</th>
                <th className="px-4 py-2 font-medium">For</th>
                <th className="px-4 py-2 font-medium">Paid by</th>
                <th className="px-4 py-2 text-right font-medium">Amount</th>
                <th className="px-4 py-2 font-medium">Recorded by</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {shown.map((p) => (
                <tr key={p.id} className="border-t border-line">
                  <td className="px-4 py-2.5 whitespace-nowrap tabular-nums">{date(p.paid_at)}</td>
                  <td className="px-4 py-2.5">
                    <div className="font-medium">{p.name ?? 'Deleted user'}</div>
                    {p.phone && <div className="text-xs tabular-nums text-muted">{p.phone}</div>}
                  </td>
                  <td className="px-4 py-2.5">
                    {forLabel(p)}
                    {p.note && <div className="text-xs text-muted">{p.note}</div>}
                  </td>
                  <td className="px-4 py-2.5">
                    {methodLabel(p.method)}
                    {p.reference && <div className="text-xs break-all text-muted">{p.reference}</div>}
                  </td>
                  <td className="px-4 py-2.5 text-right font-medium tabular-nums">{inr.format(p.amount_inr)}</td>
                  <td className="px-4 py-2.5 text-xs text-muted">{p.recorded_by_name ?? 'Automatic'}</td>
                  <td className="px-2 py-1.5 text-right">
                    <button
                      type="button"
                      title="Edit payment"
                      aria-label={`Edit payment of ${inr.format(p.amount_inr)} on ${date(p.paid_at)}`}
                      onClick={() => setEditing(p)}
                      className="grid size-9 place-items-center rounded-lg text-muted hover:bg-subtle hover:text-ink"
                    >
                      <Pencil size={16} />
                    </button>
                  </td>
                </tr>
              ))}
              {!shown.length && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-sm text-muted">
                    {loading ? 'Loading…' : payments?.length ? 'No payments match.' : 'No payments in these dates.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {editing && (
        <EditPayment
          payment={editing}
          onClose={() => setEditing(null)}
          onSaved={(saved) => {
            setEditing(null);
            // A payment moved out of these dates leaves the list.
            const day = istDay(saved.paid_at);
            const inRange = day >= range.from && day <= range.to;
            setPayments((prev) =>
              (prev ?? [])
                .map((p) => (p.id === saved.id ? saved : p))
                .filter((p) => p.id !== saved.id || inRange)
                .sort((a, b) => Date.parse(b.paid_at) - Date.parse(a.paid_at)),
            );
          }}
        />
      )}
    </main>
  );
}

/** Fix a payment's date, amount, method, reference or note. */
function EditPayment({ payment, onClose, onSaved }: { payment: PaymentRow; onClose: () => void; onSaved: (p: PaymentRow) => void }) {
  const [day, setDay] = useState(istDay(payment.paid_at));
  const [amount, setAmount] = useState(String(payment.amount_inr));
  const [method, setMethod] = useState(payment.method);
  const [reference, setReference] = useState(payment.reference ?? '');
  const [note, setNote] = useState(payment.note ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const valid = isDay(day) && day <= todayIst() && Number(amount) > 0;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { payment: saved } = await api<{ payment: PaymentRow }>(`/api/admin/payments/${payment.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ paid_on: day, amount_inr: Number(amount), method, reference, note }),
      });
      onSaved(saved);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-10 grid place-items-center bg-black/30 px-4 py-6" onClick={onClose}>
      <div className="max-h-full w-full max-w-md overflow-y-auto rounded-xl" onClick={(e) => e.stopPropagation()}>
        <Card>
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">Edit payment</h2>
            <button type="button" onClick={onClose} aria-label="Close" className="text-muted hover:text-ink">
              <X size={18} />
            </button>
          </div>
          <div className="mt-3 rounded-lg bg-subtle px-3 py-2 text-sm">
            <div className="font-medium">
              {payment.name ?? 'Deleted user'}
              {payment.phone && <span className="font-normal tabular-nums text-muted"> · {payment.phone}</span>}
            </div>
            <div className="text-muted">For: {forLabel(payment)}</div>
          </div>

          <form onSubmit={save} className="mt-4 grid gap-3">
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="text-xs font-medium text-muted">Date</span>
                <Input type="date" value={day} max={todayIst()} onChange={(e) => setDay(e.target.value)} className="mt-1" />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-muted">Amount paid (₹)</span>
                <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} className="mt-1" />
              </label>
            </div>
            <label className="block">
              <span className="text-xs font-medium text-muted">Paid by</span>
              <select className={cx(SELECT, 'mt-1')} value={method} onChange={(e) => setMethod(e.target.value)}>
                {METHODS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
                {/* An older payment's method that is no longer offered stays selectable. */}
                {!METHODS.some((m) => m.id === payment.method) && <option value={payment.method}>{methodLabel(payment.method)}</option>}
              </select>
            </label>
            <Input placeholder="UPI / bank reference (optional)" value={reference} maxLength={100} onChange={(e) => setReference(e.target.value)} />
            <Input placeholder="Note (optional)" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
            <p className="text-xs text-muted">Changing this payment doesn&rsquo;t change the plan or minutes it gave.</p>
            {error && <p className="text-xs text-danger-ink">{error}</p>}
            <Button type="submit" variant="primary" className="w-full" loading={busy} disabled={!valid}>
              Save payment
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}

'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LogOut, MessageCircle } from 'lucide-react';
import type { BillingResponse } from '@vff/shared';
import { Button, Card, Pill, cx } from '@/components/ui';
import { AdminNav } from '../admin-nav';
import { api } from '../api';
import { DateRange } from '../date-range';
import { inr, isDay, monthRange, shortDate } from '../dates';
import { planBadge } from '../plan-dialog';

const mins = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
const date = (iso: string | null) => (iso ? shortDate.format(new Date(iso)) : '—');

/** wa.me link for a renewal reminder; 10-digit numbers are Indian (+91). */
function whatsApp(phone: string, name: string, until: string | null): string {
  const n = phone.length === 10 ? `91${phone}` : phone;
  const ended = until && Date.parse(until) <= Date.now();
  const text = `Hi ${name}, your Voice2Fill plan ${ended ? 'ended' : 'ends'} on ${date(until)}. Reply here to renew.`;
  return `https://wa.me/${n}?text=${encodeURIComponent(text)}`;
}

/** Money received against the AI cost of the same dates, and renewals that are due; payments are in Payments. */
export function BillingAdmin() {
  const router = useRouter();
  const [range, setRange] = useState(() => monthRange(0));
  const [data, setData] = useState<BillingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (from: string, to: string) => {
      setLoading(true);
      try {
        setData(await api<BillingResponse>(`/api/admin/billing?${new URLSearchParams({ from, to })}`));
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
    if (isDay(range.from) && isDay(range.to) && range.from <= range.to) void load(range.from, range.to);
  }, [range, load]);

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/admin/login');
  }

  const empty = (n: number, cols: number, text: string) =>
    !n && (
      <tr>
        <td colSpan={cols} className="px-4 py-6 text-center text-sm text-muted">
          {loading ? 'Loading…' : text}
        </td>
      </tr>
    );

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <header className="mb-4 flex items-center justify-between gap-3">
        <AdminNav />
        <Button variant="ghost" onClick={logout} aria-label="Sign out">
          <LogOut size={16} />
        </Button>
      </header>

      <h2 className="mb-2 text-sm font-semibold">Renewals due</h2>
      <p className="mb-2 text-xs text-muted">Paid time ending in the next 7 days, or ended in the last 30. Renew from Users → Plan.</p>
      <Card className="mb-6 p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="px-4 py-2 font-medium">User</th>
                <th className="px-4 py-2 font-medium">Plan</th>
                <th className="px-4 py-2 font-medium">Paid until</th>
                <th className="px-4 py-2 text-right font-medium">Minutes left</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {data?.renewals.map((r) => {
                const badge = planBadge(r);
                return (
                  <tr key={r.user_id} className="border-t border-line">
                    <td className="px-4 py-2.5">
                      <div className="font-medium">{r.name}</div>
                      <div className="text-xs tabular-nums text-muted">{r.phone}</div>
                    </td>
                    <td className="px-4 py-2.5">
                      <Pill tone={badge.tone}>{badge.label}</Pill>
                    </td>
                    <td className="px-4 py-2.5 tabular-nums">{date(r.paid_until)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{r.active ? Math.floor(r.minutes_left) : '—'}</td>
                    <td className="px-4 py-1.5 text-right">
                      <a
                        href={whatsApp(r.phone, r.name, r.paid_until)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-muted hover:bg-subtle hover:text-ink"
                      >
                        <MessageCircle size={14} /> Remind
                      </a>
                    </td>
                  </tr>
                );
              })}
              {empty(data?.renewals.length ?? 0, 5, 'No renewals due.')}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="mb-4 grid gap-3 md:grid-cols-[auto_1fr]">
        <DateRange range={range} onChange={setRange} />
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Received" value={data && inr.format(data.totals.revenue_inr)} />
          <Stat
            label="AI cost"
            value={data && inr.format(data.totals.cost_inr)}
            sub={
              data &&
              `${mins.format(data.totals.minutes)} voice min${data.totals.shared_cost_inr ? ` · ${inr.format(data.totals.shared_cost_inr)} form reading` : ''}`
            }
          />
          <Stat
            label="Margin"
            value={data && inr.format(data.totals.margin_inr)}
            tone={data && data.totals.margin_inr < 0 ? 'danger' : undefined}
          />
        </div>
      </div>

      {error && <p className="mb-3 rounded-lg bg-danger-bg px-4 py-2 text-sm text-danger-ink">{error}</p>}

      <h2 className="mb-2 text-sm font-semibold">By user</h2>
      <p className="mb-2 text-xs text-muted">Payments received and AI cost (Usage prices) in these dates. Hosting is not included.</p>
      <Card className="mb-6 p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="px-4 py-2 font-medium">User</th>
                <th className="px-4 py-2 text-right font-medium">Voice min</th>
                <th className="px-4 py-2 text-right font-medium">Received</th>
                <th className="px-4 py-2 text-right font-medium">AI cost</th>
                <th className="px-4 py-2 text-right font-medium">Margin</th>
              </tr>
            </thead>
            <tbody>
              {data?.users.map((u) => (
                <tr key={u.user_id ?? 'deleted'} className="border-t border-line">
                  <td className="px-4 py-2.5">
                    <div className="font-medium">{u.name ?? 'Deleted user'}</div>
                    {u.phone && <div className="text-xs tabular-nums text-muted">{u.phone}</div>}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{mins.format(u.minutes)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{inr.format(u.revenue_inr)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{inr.format(u.cost_inr)}</td>
                  <td className={cx('px-4 py-2.5 text-right font-medium tabular-nums', u.margin_inr < 0 && 'text-danger-ink')}>
                    {inr.format(u.margin_inr)}
                  </td>
                </tr>
              ))}
              {empty(data?.users.length ?? 0, 5, 'No payments or usage in these dates.')}
            </tbody>
          </table>
        </div>
      </Card>

      <h2 className="mb-2 text-sm font-semibold">Payments</h2>
      <Card className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span>
          {data ? (
            <>
              <b className="tabular-nums">{data.payments.length}</b> payment{data.payments.length === 1 ? '' : 's'} ·{' '}
              <b className="tabular-nums">{inr.format(data.totals.revenue_inr)}</b> in these dates
            </>
          ) : (
            <span className="text-muted">{loading ? 'Loading…' : '—'}</span>
          )}
        </span>
        <Link
          href={`/admin/payments?${new URLSearchParams(range)}`}
          className="font-medium text-accent-ink underline-offset-2 hover:underline"
        >
          Manage in Payments →
        </Link>
      </Card>
    </main>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string | null | undefined; sub?: string | null; tone?: 'danger' }) {
  return (
    <Card>
      <div className="text-xs font-medium text-muted">{label}</div>
      <div className={cx('mt-1 text-lg font-semibold tabular-nums', tone === 'danger' && 'text-danger-ink')}>{value ?? '—'}</div>
      {sub && <div className="text-xs text-muted">{sub}</div>}
    </Card>
  );
}

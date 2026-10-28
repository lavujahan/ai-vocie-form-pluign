'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import type { BillingSettings, UsageCosts, UsageSummaryResponse } from '@vff/shared';
import { Button, Card, Input } from '@/components/ui';
import { AdminNav } from '../admin-nav';
import { api } from '../api';
import { inr, isDay, monthRange, todayIst } from '../dates';

// Token costs are often fractions of a cent: up to 4 decimals.
const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 4 });
const num = new Intl.NumberFormat('en-IN');
const mins = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

const dayLabel = new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

export function UsageAdmin() {
  const router = useRouter();
  const [range, setRange] = useState(() => monthRange(0));
  /** The day table's user ('' = all users). */
  const [user, setUser] = useState('');
  const [data, setData] = useState<UsageSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (from: string, to: string, who: string) => {
      setLoading(true);
      try {
        const q = new URLSearchParams({ from, to, ...(who ? { user: who } : {}) });
        setData(await api<UsageSummaryResponse>(`/api/admin/usage?${q}`));
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
    if (isDay(range.from) && isDay(range.to) && range.from <= range.to) void load(range.from, range.to, user);
  }, [range, user, load]);

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/admin/login');
  }

  const presets = [
    { label: 'This month', ...monthRange(0) },
    { label: 'Last month', ...monthRange(1) },
  ];

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <header className="mb-4 flex items-center justify-between gap-3">
        <AdminNav />
        <Button variant="ghost" onClick={logout} aria-label="Sign out">
          <LogOut size={16} />
        </Button>
      </header>

      <div className="mb-4 grid gap-3 lg:grid-cols-[auto_1fr]">
        <Card>
          <div className="flex flex-wrap items-end gap-3">
            <label className="block">
              <span className="text-xs font-medium text-muted">From</span>
              <Input type="date" value={range.from} max={range.to} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} className="mt-1" />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-muted">To</span>
              <Input
                type="date"
                value={range.to}
                min={range.from}
                max={todayIst()}
                onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
                className="mt-1"
              />
            </label>
          </div>
          <div className="mt-2 flex gap-3">
            {presets.map((p) => (
              <button
                key={p.label}
                onClick={() => setRange({ from: p.from, to: p.to })}
                className={`text-xs underline-offset-2 hover:underline ${range.from === p.from && range.to === p.to ? 'font-semibold text-ink' : 'text-muted'}`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </Card>
        {data && <RatesCard settings={data.settings} onSaved={() => load(range.from, range.to, user)} />}
      </div>

      {error && <p className="mb-3 rounded-lg bg-danger-bg px-4 py-2 text-sm text-danger-ink">{error}</p>}

      <SummaryCards totals={data?.totals ?? null} shared={data ? data.shared : undefined} />

      <h2 className="mb-2 text-sm font-semibold">By user</h2>
      <Card className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <UsageHead first="User" />
            <tbody>
              {data?.rows.map((r) => (
                <tr key={r.user_id ?? 'unknown'} className="border-t border-line">
                  <td className="px-4 py-2.5">
                    <div className="font-medium">{r.name ?? 'Deleted user'}</div>
                    {r.phone && <div className="text-xs tabular-nums text-muted">{r.phone}</div>}
                  </td>
                  <UsageCells row={r} />
                </tr>
              ))}
              {data?.shared && (
                <tr className="border-t border-line text-muted">
                  <td className="px-4 py-2.5">
                    <div className="font-medium">Form reading</div>
                    <div className="text-xs">shared by all users</div>
                  </td>
                  <UsageCells row={data.shared} />
                </tr>
              )}
              <EmptyRow data={data} loading={loading} empty={!data?.rows.length && !data?.shared} />
            </tbody>
            {data && (data.rows.length > 0 || data.shared) && <TotalRow row={data.totals} />}
          </table>
        </div>
      </Card>

      <div className="mt-6 mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">By day</h2>
        <label className="flex items-center gap-2 text-xs text-muted">
          User
          <select
            value={user}
            onChange={(e) => setUser(e.target.value)}
            className="min-h-9 rounded-lg border border-line bg-card px-2 text-sm text-ink focus:border-accent-ink focus:outline-none"
          >
            <option value="">All users</option>
            {data?.rows
              .filter((r) => r.user_id)
              .map((r) => (
                <option key={r.user_id} value={r.user_id!}>
                  {r.name ?? r.phone ?? 'User'}
                </option>
              ))}
            {/* Keep a chosen user listed even if they have no usage in the new dates. */}
            {user && data && !data.rows.some((r) => r.user_id === user) && <option value={user}>Chosen user</option>}
          </select>
        </label>
      </div>
      <Card className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <UsageHead first="Date" />
            <tbody>
              {data?.days === null ? (
                <tr>
                  <td colSpan={COLUMNS} className="px-4 py-8 text-center text-sm text-muted">
                    Apply migration 0011_usage_daily.sql in Supabase to see usage by day.
                  </td>
                </tr>
              ) : (
                <>
                  {data?.days?.map((d) => (
                    <tr key={d.day} className="border-t border-line">
                      <td className="px-4 py-2.5 whitespace-nowrap">{dayLabel.format(new Date(`${d.day}T00:00:00Z`))}</td>
                      <UsageCells row={d} />
                    </tr>
                  ))}
                  <EmptyRow data={data} loading={loading} empty={!data?.days?.length} />
                </>
              )}
            </tbody>
            {data?.day_totals && !!data.days?.length && <TotalRow row={data.day_totals} />}
          </table>
        </div>
      </Card>

      <p className="mt-3 text-xs text-muted">
        OpenAI cost = uncached input tokens × your input price + cached input tokens × your cached price + output tokens ×
        your output price (per 1M tokens, in $), shown in ₹ at your rate. A new price applies to all dates. Check the{' '}
        <a className="underline" href="https://developers.openai.com/api/docs/pricing" target="_blank" rel="noreferrer">
          OpenAI prices
        </a>{' '}
        and{' '}
        <a className="underline" href="https://www.sarvam.ai/api-pricing" target="_blank" rel="noreferrer">
          Sarvam speech-to-text
        </a>{' '}
        (per minute of audio). Cached tokens = input tokens OpenAI read from its prompt cache (part of the input tokens,
        billed at the cached price); % = share of the input. Forms = forms the computer filled with at most 2 fields left empty, counted once per form (— until migration 0016 is applied). Form reading (working out a form&apos;s fields) is done
        once per form and reused by every user, so it has its own row and is left out of each user&apos;s row and a single
        user&apos;s By day table (from migration 0017). Dates follow India time.
      </p>
    </main>
  );
}

/**
 * All users' cost in the chosen dates: the total, its OpenAI and Sarvam parts, and form reading (part of
 * OpenAI, shared by all users: a form is read once and reused, so it is on no user's row).
 */
function SummaryCards({ totals, shared }: { totals: UsageCosts | null; shared: UsageCosts | null | undefined }) {
  const show = (f: (t: UsageCosts) => string) => (totals ? f(totals) : '…');
  const reading = (f: (t: UsageCosts) => string, none: string) => (shared === undefined ? '…' : shared ? f(shared) : none);
  const cards = [
    { label: 'Total cost', value: show((t) => inr.format(t.total_inr)), note: 'OpenAI + Sarvam' },
    {
      label: 'OpenAI',
      value: show((t) => inr.format(t.openai_inr)),
      note: show(
        (t) =>
          `${usd.format(t.openai_usd)} · ${num.format(t.tokens)} tokens (${num.format(t.cached_input_tokens)} cached · ${cachedShare(t)}) · ${num.format(t.llm_calls)} runs`,
      ),
    },
    {
      label: 'Sarvam',
      value: show((t) => inr.format(t.sarvam_inr)),
      note: show((t) => `${mins.format(t.minutes)} min · ${num.format(t.stt_calls)} recordings`),
    },
    {
      label: 'Form reading',
      value: reading((t) => inr.format(t.openai_inr), inr.format(0)),
      note: reading(
        (t) => `${num.format(t.llm_calls)} readings · ${num.format(t.output_tokens)} output tokens · part of OpenAI, shared by all users`,
        'No forms read in these dates',
      ),
    },
  ];
  return (
    <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((c, i) => (
        <Card key={c.label}>
          <div className="text-xs font-medium text-muted">{c.label}</div>
          <div className={`mt-1 tabular-nums ${i === 0 ? 'text-2xl font-semibold' : 'text-xl font-medium'}`}>{c.value}</div>
          <div className="mt-1 text-xs tabular-nums text-muted">{c.note}</div>
        </Card>
      ))}
    </div>
  );
}

function UsageHead({ first }: { first: string }) {
  return (
    <thead>
      <tr className="text-left text-xs text-muted">
        <th className="px-4 py-2 font-medium">{first}</th>
        <th className="px-4 py-2 text-right font-medium" title="Forms the computer filled, with at most 2 fields left empty">
          Forms
        </th>
        <th className="px-4 py-2 text-right font-medium">Minutes</th>
        <th className="px-4 py-2 text-right font-medium">Input tokens</th>
        <th className="px-4 py-2 text-right font-medium" title="Input tokens read from OpenAI's prompt cache (billed at the cached price)">
          Cached tokens
        </th>
        <th className="px-4 py-2 text-right font-medium">Input cost</th>
        <th className="px-4 py-2 text-right font-medium">Output tokens</th>
        <th className="px-4 py-2 text-right font-medium">Output cost</th>
        <th className="px-4 py-2 text-right font-medium">OpenAI</th>
        <th className="px-4 py-2 text-right font-medium">Sarvam</th>
        <th className="px-4 py-2 text-right font-medium">Total</th>
      </tr>
    </thead>
  );
}

function TotalRow({ row }: { row: UsageCosts }) {
  return (
    <tfoot>
      <tr className="border-t-2 border-line bg-subtle/50 font-semibold">
        <td className="px-4 py-2.5">Total</td>
        <UsageCells row={row} />
      </tr>
    </tfoot>
  );
}

function EmptyRow({ data, loading, empty }: { data: UsageSummaryResponse | null; loading: boolean; empty: boolean }) {
  if (data && !empty) return null;
  if (!data && !loading) return null;
  return (
    <tr>
      <td colSpan={COLUMNS} className="px-4 py-8 text-center text-sm text-muted">
        {!data ? 'Loading…' : 'No AI usage in these dates.'}
      </td>
    </tr>
  );
}

const COLUMNS = 11;

/** Cached share of the input tokens, e.g. "62%"; "—" with no input. */
const cachedShare = (row: UsageCosts) =>
  row.input_tokens ? `${Math.round((100 * row.cached_input_tokens) / row.input_tokens)}%` : '—';

function UsageCells({ row }: { row: UsageCosts }) {
  return (
    <>
      <td className="px-4 py-2.5 text-right tabular-nums">{row.forms_completed === null ? '—' : num.format(row.forms_completed)}</td>
      <td className="px-4 py-2.5 text-right tabular-nums" title={`${num.format(row.stt_calls)} recordings`}>
        {mins.format(row.minutes)}
      </td>
      <td className="px-4 py-2.5 text-right tabular-nums" title={`${num.format(row.llm_calls)} runs`}>
        {num.format(row.input_tokens)}
      </td>
      <td className="px-4 py-2.5 text-right tabular-nums">
        <div>{num.format(row.cached_input_tokens)}</div>
        <div className="text-xs text-muted">{cachedShare(row)}</div>
      </td>
      <td className="px-4 py-2.5 text-right tabular-nums">{usd.format(row.input_usd)}</td>
      <td className="px-4 py-2.5 text-right tabular-nums">{num.format(row.output_tokens)}</td>
      <td className="px-4 py-2.5 text-right tabular-nums">{usd.format(row.output_usd)}</td>
      <td className="px-4 py-2.5 text-right tabular-nums">
        <div>{usd.format(row.openai_usd)}</div>
        <div className="text-xs text-muted">{inr.format(row.openai_inr)}</div>
      </td>
      <td className="px-4 py-2.5 text-right tabular-nums">{inr.format(row.sarvam_inr)}</td>
      <td className="px-4 py-2.5 text-right font-semibold tabular-nums">{inr.format(row.total_inr)}</td>
    </>
  );
}

/** One price field: `min` / `max` as in the server's check. */
type Rate = { key: keyof BillingSettings; label: string; min: number; max: number };

const RATES: Rate[] = [
  { key: 'input_usd_per_m', label: 'Input tokens · $ per 1M', min: 0, max: 1000 },
  { key: 'cached_usd_per_m', label: 'Cached input · $ per 1M', min: 0, max: 1000 },
  { key: 'output_usd_per_m', label: 'Output tokens · $ per 1M', min: 0, max: 1000 },
  { key: 'usd_inr_rate', label: '1 USD in ₹', min: 0.01, max: 1000 },
  { key: 'sarvam_inr_per_min', label: 'Sarvam ₹ per minute', min: 0.01, max: 100 },
];

const asText = (s: BillingSettings) => Object.fromEntries(RATES.map((r) => [r.key, String(s[r.key])])) as Record<keyof BillingSettings, string>;

/** The admin's prices: OpenAI input / cached input / output tokens in $ per 1M, the $→₹ rate, Sarvam ₹ per minute. */
function RatesCard({ settings, onSaved }: { settings: BillingSettings; onSaved: () => void }) {
  const [text, setText] = useState(() => asText(settings));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => setText(asText(settings)), [settings]);

  const values = Object.fromEntries(RATES.map((r) => [r.key, Number(text[r.key])])) as BillingSettings;
  const valid = RATES.every((r) => text[r.key].trim() !== '' && values[r.key] >= r.min && values[r.key] <= r.max);
  const changed = RATES.some((r) => values[r.key] !== settings[r.key]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await api('/api/admin/billing-settings', { method: 'PATCH', body: JSON.stringify(values) });
      setMsg({ ok: true, text: 'Saved' });
      onSaved();
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <form onSubmit={save} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[repeat(5,minmax(0,1fr))_auto] lg:items-end">
        {RATES.map((r) => (
          <label key={r.key} className="block">
            <span className="text-xs font-medium text-muted">{r.label}</span>
            <Input
              type="number"
              inputMode="decimal"
              step="any"
              min={r.min}
              max={r.max}
              value={text[r.key]}
              onChange={(e) => setText((t) => ({ ...t, [r.key]: e.target.value }))}
              className="mt-1"
            />
          </label>
        ))}
        <Button type="submit" variant="primary" loading={busy} disabled={!valid || !changed}>
          Save prices
        </Button>
        {msg && <p className={`text-xs sm:col-span-2 lg:col-span-6 ${msg.ok ? 'text-live-ink' : 'text-danger-ink'}`}>{msg.text}</p>}
      </form>
    </Card>
  );
}

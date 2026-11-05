'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut, Plus } from 'lucide-react';
import { COUNTER_LABELS, LIMIT_KEYS, type LimitKey, type Plan } from '@vff/shared';
import { Button, Card, Input } from '@/components/ui';
import { AdminNav } from '../admin-nav';
import { api } from '../api';

/** Plan limits: an empty box is no limit. */
type Draft = { name: string; price_inr: string; minutes: string; days: string; is_active: boolean } & Record<LimitKey, string>;

const toDraft = (p: Plan): Draft => ({
  name: p.name,
  price_inr: String(p.price_inr),
  minutes: String(p.minutes),
  days: String(p.days),
  is_active: p.is_active,
  ...(Object.fromEntries(LIMIT_KEYS.map((k) => [k, p[k] == null ? '' : String(p[k])])) as Record<LimitKey, string>),
});
const toInput = (d: Draft) => ({
  name: d.name.trim(),
  price_inr: Number(d.price_inr),
  minutes: Number(d.minutes),
  days: Number(d.days),
  is_active: d.is_active,
  ...Object.fromEntries(LIMIT_KEYS.map((k) => [k, d[k] === '' ? null : Number(d[k])])),
});
const validDraft = (d: Draft) =>
  !!d.name.trim() &&
  d.price_inr !== '' &&
  Number(d.price_inr) >= 0 &&
  /^\d+$/.test(d.minutes) &&
  /^\d+$/.test(d.days) &&
  Number(d.days) >= 1 &&
  Number(d.days) <= 366 &&
  LIMIT_KEYS.every((k) => d[k] === '' || /^\d+$/.test(d[k])) &&
  (d.computers === '' || Number(d.computers) >= 1);

/** Plans that are sold. A change applies from each user's next renewal; running periods keep their minutes. */
export function PlansAdmin() {
  const router = useRouter();
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ plans: Plan[] }>('/api/admin/plans')
      .then((r) => setPlans(r.plans))
      .catch((e: Error) => {
        setError(e.message);
        if (e.message.includes('sign in')) router.replace('/admin/login');
      });
  }, [router]);

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/admin/login');
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <header className="mb-4 flex items-center justify-between gap-3">
        <AdminNav />
        <Button variant="ghost" onClick={logout} aria-label="Sign out">
          <LogOut size={16} />
        </Button>
      </header>
      <p className="mb-3 text-sm text-muted">
        Voice minutes are the speech your users record on their phones. Each plan also limits computers signed in at once, documents
        sent into forms (phone or scanner), and each Generate QR with voice (Voice Form Fill QR) or Typing only (Non Voice Form Fill QR);
        leave a limit empty for no limit. A change applies from each user’s next renewal; a plan that is turned off can’t be given to
        anyone. New users get the <span className="font-medium text-ink">trial</span> plan while it is on.
      </p>
      {error && <p className="mb-3 rounded-lg bg-danger-bg px-4 py-2 text-sm text-danger-ink">{error}</p>}
      <Card className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="px-3 py-2 font-medium">Plan</th>
                <th className="px-3 py-2 font-medium">Price ₹</th>
                <th className="px-3 py-2 font-medium">Voice minutes</th>
                {LIMIT_KEYS.map((k) => (
                  <th key={k} className="px-3 py-2 font-medium">
                    {COUNTER_LABELS[k]}
                  </th>
                ))}
                <th className="px-3 py-2 font-medium">Days</th>
                <th className="px-3 py-2 font-medium">On sale</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {plans?.map((p) => (
                <PlanRow key={p.id} plan={p} onSaved={(saved) => setPlans((list) => list?.map((x) => (x.id === saved.id ? saved : x)) ?? null)} />
              ))}
              {plans && <NewPlanRow onCreated={(p) => setPlans((list) => [...(list ?? []), p])} />}
            </tbody>
          </table>
        </div>
      </Card>
    </main>
  );
}

function Cells({ draft, set }: { draft: Draft; set: (d: Draft) => void }) {
  const num = (k: 'price_inr' | 'minutes' | 'days' | LimitKey, decimal = false) => (
    <td key={k} className="px-3 py-2">
      <Input
        inputMode={decimal ? 'decimal' : 'numeric'}
        value={draft[k]}
        placeholder={LIMIT_KEYS.includes(k as LimitKey) ? 'No limit' : undefined}
        aria-label={LIMIT_KEYS.includes(k as LimitKey) ? COUNTER_LABELS[k as LimitKey] : undefined}
        onChange={(e) => set({ ...draft, [k]: e.target.value.replace(decimal ? /[^\d.]/g : /\D/g, '').slice(0, 9) })}
        className="min-h-9 w-24 text-sm"
      />
    </td>
  );
  return (
    <>
      <td className="px-3 py-2">
        <Input value={draft.name} maxLength={60} onChange={(e) => set({ ...draft, name: e.target.value })} className="min-h-9 w-36 text-sm" />
      </td>
      {num('price_inr', true)}
      {num('minutes')}
      {LIMIT_KEYS.map((k) => num(k))}
      {num('days')}
      <td className="px-3 py-2">
        <input type="checkbox" aria-label="On sale" checked={draft.is_active} onChange={(e) => set({ ...draft, is_active: e.target.checked })} />
      </td>
    </>
  );
}

function PlanRow({ plan, onSaved }: { plan: Plan; onSaved: (p: Plan) => void }) {
  const [draft, setDraft] = useState(() => toDraft(plan));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const changed = JSON.stringify(draft) !== JSON.stringify(toDraft(plan));

  async function save() {
    setBusy(true);
    try {
      const { plan: saved } = await api<{ plan: Plan }>(`/api/admin/plans/${plan.id}`, { method: 'PATCH', body: JSON.stringify(toInput(draft)) });
      onSaved(saved);
      setDraft(toDraft(saved));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <tr className="border-t border-line align-top">
      <Cells draft={draft} set={setDraft} />
      <td className="px-3 py-2 text-right">
        <Button className="min-h-9" loading={busy} disabled={!changed || !validDraft(draft)} onClick={save}>
          Save
        </Button>
        <div className="mt-1 text-xs text-muted">{error ? <span className="text-danger-ink">{error}</span> : plan.id}</div>
      </td>
    </tr>
  );
}

function NewPlanRow({ onCreated }: { onCreated: (p: Plan) => void }) {
  const empty: Draft = { name: '', price_inr: '', minutes: '', days: '30', is_active: true, computers: '1', documents: '', voice_qrs: '', nonvoice_qrs: '' };
  const [id, setId] = useState('');
  const [draft, setDraft] = useState(empty);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setBusy(true);
    try {
      const { plan } = await api<{ plan: Plan }>('/api/admin/plans', { method: 'POST', body: JSON.stringify({ id, ...toInput(draft) }) });
      onCreated(plan);
      setId('');
      setDraft(empty);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <tr className="border-t border-line bg-subtle/50 align-top">
      <Cells draft={draft} set={setDraft} />
      <td className="px-3 py-2 text-right">
        <Button className="min-h-9" loading={busy} disabled={!/^[a-z0-9_-]{1,32}$/.test(id) || !validDraft(draft)} onClick={create}>
          <Plus size={15} /> Add
        </Button>
        <Input
          placeholder="id, e.g. yearly"
          aria-label="Plan id"
          value={id}
          onChange={(e) => setId(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 32))}
          className="mt-1 min-h-8 w-32 text-xs"
        />
        {error && <div className="mt-1 text-xs text-danger-ink">{error}</div>}
      </td>
    </tr>
  );
}

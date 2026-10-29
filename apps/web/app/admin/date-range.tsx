'use client';

import { Card, Input } from '@/components/ui';
import { monthRange, todayIst } from './dates';

export type Range = { from: string; to: string };

/** From / To dates (India time) with This month and Last month buttons. */
export function DateRange({ range, onChange }: { range: Range; onChange: (r: Range) => void }) {
  const presets = [
    { label: 'This month', ...monthRange(0) },
    { label: 'Last month', ...monthRange(1) },
  ];
  return (
    <Card>
      <div className="flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="text-xs font-medium text-muted">From</span>
          <Input type="date" value={range.from} max={range.to} onChange={(e) => onChange({ ...range, from: e.target.value })} className="mt-1" />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-muted">To</span>
          <Input
            type="date"
            value={range.to}
            min={range.from}
            max={todayIst()}
            onChange={(e) => onChange({ ...range, to: e.target.value })}
            className="mt-1"
          />
        </label>
      </div>
      <div className="mt-2 flex gap-3">
        {presets.map((p) => (
          <button
            key={p.label}
            onClick={() => onChange({ from: p.from, to: p.to })}
            className={`text-xs underline-offset-2 hover:underline ${range.from === p.from && range.to === p.to ? 'font-semibold text-ink' : 'text-muted'}`}
          >
            {p.label}
          </button>
        ))}
      </div>
    </Card>
  );
}

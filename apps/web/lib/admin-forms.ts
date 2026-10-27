import type { AdminFormRow } from '@vff/shared';
import { ANALYZER_INSTRUCTIONS, analyzerModelSpec } from './agents/formAnalyzer';
import { isFresh, promptVersion, readingExpiresAt } from './agents/formCache';

/** form_cache columns for the admin list (without the reading itself). */
export const FORM_ROW_COLUMNS =
  'fingerprint, form_name, page_url, field_count, partial, model, prompt_version, cost_usd, uses, last_used_at, created_at, edited_at';

export type FormCacheRow = Omit<AdminFormRow, 'expires_at' | 'fresh' | 'cost_usd'> & { prompt_version: string; cost_usd: number | string | null };

export function toFormRow(r: FormCacheRow): AdminFormRow {
  const { prompt_version, ...row } = r;
  const current = { model: analyzerModelSpec(), promptVersion: promptVersion(ANALYZER_INSTRUCTIONS) };
  return {
    ...row,
    cost_usd: r.cost_usd === null ? null : Number(r.cost_usd),
    expires_at: readingExpiresAt(r)?.toISOString() ?? null,
    fresh: isFresh({ ...r, prompt_version }, current),
  };
}

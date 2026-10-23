import 'server-only';
import { db } from '../supabase-admin';
import type { UsageEvent } from './events';

/**
 * Saves usage rows. Never throws: billing data must not break filling a form.
 * Before migration 0008 the table doesn't exist and nothing is saved.
 */
export async function recordUsage(events: UsageEvent[]): Promise<void> {
  if (!events.length) return;
  try {
    const { error } = await db().from('usage_events').insert(events);
    if (!error) return;
    if (error.code === '42P01' || error.code === 'PGRST205') console.warn('usage_events missing: apply migration 0008');
    else console.error('usage record failed', error);
  } catch (e) {
    console.error('usage record failed', e);
  }
}

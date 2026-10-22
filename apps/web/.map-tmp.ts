import { createClient } from '@supabase/supabase-js';
import { mapTranscript } from './lib/agents/fieldMapper';
const db = createClient((process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL)!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const { data: s } = await db.from('form_sessions').select('id').eq('id', '623e8bb6-3e0a-417e-bddf-05a46922b3f0').maybeSingle();
if (!s) { console.log('session purged'); process.exit(0); }
const { data: fields } = await db.from('form_fields').select('*').eq('session_id', s.id).order('position');
const { data: u } = await db.from('utterances').select('transcript').eq('session_id', s.id).eq('seq', 1).single();
const out = await mapTranscript({ fields: fields as never, current: {}, transcript: u!.transcript!, targetFieldKey: null });
if (out.empty) { console.log('empty'); process.exit(0); }
const label = new Map((fields as { field_key: string; clean_label: string }[]).map((f) => [f.field_key, f.clean_label]));
for (const f of fields as { field_key: string }[]) {
  const v = out.values.find((x) => x.field_key === f.field_key);
  console.log(`${(label.get(f.field_key) ?? '').padEnd(42)} ${v ? `${v.value}  (${v.confidence})${v.error ? '  ! ' + v.error : ''}` : '—'}`);
}
process.exit(0);

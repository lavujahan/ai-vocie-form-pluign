/**
 * Checks the live Supabase setup end to end (run after applying the migrations):
 *   pnpm --filter web check:db
 * - latest-wins upsert: seq 3, 1, 2 finishing out of order → value of #3 stays
 * - pairing code is single-use
 * - RLS: users and phones only see their own session (also what Realtime enforces)
 * Creates throwaway users/sessions and deletes them afterwards.
 */
import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { signJwt } from '../lib/jwt';

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const secret = process.env.SUPABASE_JWT_SECRET;
if (!url || !service || !anon || !secret) {
  console.error('Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_JWT_SECRET in apps/web/.env.local');
  process.exit(1);
}

const admin = createClient(url, service, { auth: { persistSession: false } });
const asToken = (token: string) => createClient(url, anon, { accessToken: async () => token });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let failures = 0;
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

const rand = () => String(Math.floor(Math.random() * 1e8)).padStart(8, '0');
const userIds: string[] = [];

try {
  const { data: users, error: ue } = await admin
    .from('users')
    .insert([
      { phone: `90${rand()}`, name: 'check-db A', pin_hash: 'x' },
      { phone: `91${rand()}`, name: 'check-db B', pin_hash: 'x' },
    ])
    .select('id');
  if (ue) throw ue;
  const [a, b] = users as { id: string }[];
  userIds.push(a.id, b.id);

  const { data: session, error: se } = await admin
    .from('form_sessions')
    .insert({
      user_id: a.id,
      session_code: randomBytes(16).toString('base64url'),
      page_url: 'https://example.test/form',
      page_origin: 'https://example.test',
      expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
    })
    .select('id, session_code')
    .single();
  if (se) throw se;
  const { data: field, error: fe } = await admin
    .from('form_fields')
    .insert({ session_id: session.id, field_key: 'name', label: 'Name', field_type: 'text', position: 0 })
    .select('id')
    .single();
  if (fe) throw fe;

  // ---- latest wins ----
  const upsert = (seq: number) =>
    admin.rpc('upsert_field_value', {
      p_session: session.id,
      p_field: field.id,
      p_value: `from #${seq}`,
      p_confidence: 1,
      p_source_phrase: null,
      p_seq: seq,
      p_utterance: null,
    });
  // Finish order 3, 1, 2.
  await Promise.all([3, 1, 2].map((seq, i) => sleep(i * 80).then(() => upsert(seq))));
  const { data: v } = await admin.from('field_values').select('value, source_seq').eq('field_id', field.id).single();
  check('latest-wins: #3 survives late #1 and #2', v?.value === 'from #3', JSON.stringify(v));
  await upsert(4);
  const { data: v4 } = await admin.from('field_values').select('value').eq('field_id', field.id).single();
  check('latest-wins: newer #4 overwrites', v4?.value === 'from #4');

  // ---- single-use pairing ----
  const pair = () =>
    admin
      .from('form_sessions')
      .update({ status: 'paired', paired_at: new Date().toISOString() })
      .eq('session_code', session.session_code)
      .eq('status', 'waiting')
      .gt('expires_at', new Date().toISOString())
      .select('id')
      .maybeSingle();
  const first = await pair();
  const second = await pair();
  check('pairing code works once', !!first.data && !second.data);

  // ---- RLS ----
  const userToken = async (id: string) =>
    (await signJwt({ role: 'authenticated', scope: 'user', app_role: 'user' }, id, 300, secret)).token;
  const phoneToken = async (sid: string) =>
    (await signJwt({ role: 'authenticated', scope: 'phone', session_id: sid }, sid, 300, secret)).token;

  const owner = await asToken(await userToken(a.id)).from('form_sessions').select('id').eq('id', session.id);
  check('RLS: owner reads own session', owner.data?.length === 1, owner.error?.message);
  const other = await asToken(await userToken(b.id)).from('form_sessions').select('id').eq('id', session.id);
  check('RLS: other user cannot read it', !other.error && other.data?.length === 0, other.error?.message);
  const phone = await asToken(await phoneToken(session.id)).from('field_values').select('value').eq('session_id', session.id);
  check('RLS: paired phone reads its values', phone.data?.length === 1, phone.error?.message);
  const stranger = await asToken(await phoneToken(crypto.randomUUID())).from('field_values').select('value').eq('session_id', session.id);
  check('RLS: another phone token reads nothing', !stranger.error && stranger.data?.length === 0, stranger.error?.message);
  const users2 = await asToken(await userToken(a.id)).from('users').select('id');
  check('RLS: users table is not readable by clients', (users2.data?.length ?? 0) === 0);
  const write = await asToken(await userToken(a.id)).from('field_values').update({ value: 'hacked' }).eq('session_id', session.id).select('id');
  check('RLS: clients cannot write values', (write.data?.length ?? 0) === 0);

  // ---- Realtime: the phone and the extension get value changes pushed ----
  for (const [who, token] of [
    ['phone', await phoneToken(session.id)],
    ['extension user', await userToken(a.id)],
  ] as const) {
    const client = asToken(token);
    let status = '';
    let statusErr = '';
    await client.realtime.setAuth(token); // same as the app: token on the socket before joining
    const got = new Promise<string>((resolve) => {
      client
        .channel(`check:${who}:${session.id}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'field_values', filter: `session_id=eq.${session.id}` }, (p) =>
          resolve((p.new as { value: string }).value),
        )
        .subscribe((s, err) => {
          status = s;
          if (err) statusErr = err.message;
        });
    });
    for (let i = 0; i < 50 && status !== 'SUBSCRIBED' && !statusErr; i++) await sleep(100);
    await sleep(1000); // let the server finish setting up the postgres_changes subscription
    const value = `realtime-${who}-${Date.now()}`;
    await admin.from('field_values').update({ value }).eq('field_id', field.id);
    const received = await Promise.race([got, sleep(8000).then(() => null)]);
    check(
      `Realtime: ${who} receives value changes`,
      received === value,
      received === value ? '' : `channel status ${status || 'none'}${statusErr ? ` (${statusErr})` : ''}, no event within 8s`,
    );
    await client.removeAllChannels();
  }
} catch (e) {
  console.error('check-db crashed:', e);
  failures++;
} finally {
  if (userIds.length) await admin.from('users').delete().in('id', userIds);
}

console.log(failures ? `\n${failures} check(s) failed` : '\nAll database checks passed');
process.exit(failures ? 1 : 0);

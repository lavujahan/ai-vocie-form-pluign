/**
 * Checks the live Supabase setup end to end (run after applying the migrations):
 *   pnpm --filter web check:db
 * - latest-wins upsert: seq 3, 1, 2 finishing out of order → value of #3 stays
 * - pairing code is single-use
 * - RLS: users and phones only see their own session (also what Realtime enforces)
 * - retention: expired sessions lose answers and dropdown hints; sessions older than 30 days are deleted
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

  // ---- Start over (migration 0005): clears values at seq 10; an utterance from seq 8 finishing later loses ----
  await admin.from('utterances').insert({ session_id: session.id, seq: 9, status: 'done', transcript: 'previous applicant' });
  const reset = await admin.rpc('reset_session', { p_session: session.id, p_seq: 10, p_scope: 'both' });
  check('Start over: reset_session runs (apply migration 0005)', reset.data === true, reset.error?.message);
  await upsert(8);
  const { data: afterReset } = await admin.from('field_values').select('value, source_seq').eq('field_id', field.id).single();
  check('Start over: older speech cannot bring a value back', afterReset?.value === null && afterReset?.source_seq === 10, JSON.stringify(afterReset));
  const { data: oldUtt } = await admin.from('utterances').select('id').eq('session_id', session.id).lt('seq', 10);
  check("Start over: the previous applicant's transcripts are deleted", (oldUtt?.length ?? 0) === 0);
  const again = await admin.rpc('reset_session', { p_session: session.id, p_seq: 10, p_scope: 'phone' });
  check('Start over: the same seq cannot reset twice', again.data === false, again.error?.message);
  await upsert(11);
  // reset_session sets 'paired'; the pairing check below needs a waiting session.
  await admin.from('form_sessions').update({ status: 'waiting' }).eq('id', session.id);

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

  // ---- Connect phone again: the same QR works once more, answers kept (as /reconnect does) ----
  const reconnect = await admin
    .from('form_sessions')
    .update({ status: 'waiting', paired_at: null, expires_at: new Date(Date.now() + 10 * 60_000).toISOString() })
    .eq('id', session.id)
    .in('status', ['waiting', 'paired', 'filled'])
    .neq('desktop_state', 'closed')
    .select('id')
    .maybeSingle();
  const third = await pair();
  const { data: kept } = await admin.from('field_values').select('value').eq('session_id', session.id).maybeSingle();
  check('Connect phone again: the QR pairs once more', !!reconnect.data && !!third.data, reconnect.error?.message);
  check('Connect phone again: answers are kept', kept?.value === 'from #11', JSON.stringify(kept));

  // ---- Token prices (admin panel → Usage) ----
  const prices = await admin.from('billing_settings').select('input_usd_per_m, output_usd_per_m').eq('id', true).maybeSingle();
  check('Billing: input / output token prices exist (apply migration 0010)', !prices.error && prices.data != null, prices.error?.message);
  const daily = await admin.rpc('usage_daily', { p_from: new Date(Date.now() - 86_400_000).toISOString(), p_to: new Date().toISOString(), p_user: null });
  check('Billing: usage by day runs (apply migration 0011)', !daily.error, daily.error?.message);

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

  // ---- File uploads (migration 0007): private bucket, files only readable by their own session ----
  const bucketInfo = await admin.storage.getBucket('form-files');
  check('Uploads: storage bucket form-files exists and is private (apply migration 0007)', bucketInfo.data?.public === false, bucketInfo.error?.message);
  const { data: fileField } = await admin
    .from('form_fields')
    .insert({ session_id: session.id, field_key: 'photo', label: 'Photo', field_type: 'file', position: 1 })
    .select('id')
    .single();
  if (fileField) {
    const path = `${session.id}/photo/check-db.jpg`;
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46]);
    const up = await admin.storage.from('form-files').upload(path, jpeg, { contentType: 'image/jpeg', upsert: true });
    check('Uploads: the API can store a file', !up.error, up.error?.message);
    const row = await admin
      .from('field_files')
      .insert({ session_id: session.id, field_id: fileField.id, path, file_name: 'Photo.jpg', mime: 'image/jpeg', bytes: jpeg.length })
      .select('id')
      .single();
    check('Uploads: field_files table exists (apply migration 0007)', !row.error, row.error?.message);
    const own = await asToken(await phoneToken(session.id)).from('field_files').select('id').eq('session_id', session.id);
    check('Uploads RLS: the paired phone sees its file', own.data?.length === 1, own.error?.message);
    const foreign = await asToken(await phoneToken(crypto.randomUUID())).from('field_files').select('id').eq('session_id', session.id);
    check('Uploads RLS: another phone sees nothing', !foreign.error && foreign.data?.length === 0, foreign.error?.message);
    const direct = await asToken(await phoneToken(session.id)).storage.from('form-files').download(path);
    check('Uploads: a client cannot download from the bucket without a signed link', !!direct.error);
    const signed = await admin.storage.from('form-files').createSignedUrl(path, 60);
    const viaLink = signed.data ? await fetch(signed.data.signedUrl) : null;
    check('Uploads: a 60-second signed link downloads it', viaLink?.ok === true, signed.error?.message);
    await admin.storage.from('form-files').remove([path]);
  }

  // ---- Retention (migration 0009): expired sessions lose their answers and hints, 30-day-old sessions go ----
  // purge_expired() is what the 15-minute cron runs, so calling it here only does early what the cron would do.
  const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
  const { data: aged } = await admin
    .from('form_sessions')
    .insert([
      { user_id: a.id, session_code: randomBytes(16).toString('base64url'), page_url: 'https://example.test/expired', page_origin: 'https://example.test', status: 'paired', expires_at: ago(2 * 3600_000), created_at: ago(2 * 3600_000) },
      { user_id: a.id, session_code: randomBytes(16).toString('base64url'), page_url: 'https://example.test/old', page_origin: 'https://example.test', status: 'expired', expires_at: ago(31 * 86400_000), created_at: ago(31 * 86400_000) },
    ])
    .select('id');
  if (aged?.length === 2) {
    const [expired, old] = aged as { id: string }[];
    const { data: hinted } = await admin
      .from('form_fields')
      .insert({ session_id: expired.id, field_key: 'village', label: 'Village', field_type: 'select', position: 0, choice_hint: { spoken: 'check-db', reason: 'ambiguous', top: [] } })
      .select('id')
      .single();
    if (hinted) {
      await admin.rpc('upsert_field_value', { p_session: expired.id, p_field: hinted.id, p_value: 'x', p_confidence: 1, p_source_phrase: null, p_seq: 1, p_utterance: null });
    }
    const purge = await admin.rpc('purge_expired');
    check('Retention: purge_expired runs (apply migration 0009)', !purge.error, purge.error?.message);
    const { data: hint } = await admin.from('form_fields').select('choice_hint').eq('session_id', expired.id).maybeSingle();
    check('Retention: expired session loses what was said for a dropdown', hint?.choice_hint === null, JSON.stringify(hint));
    const { data: vals } = await admin.from('field_values').select('id').eq('session_id', expired.id);
    check('Retention: expired session loses its values', (vals?.length ?? 0) === 0);
    const { data: gone } = await admin.from('form_sessions').select('id').eq('id', old.id);
    check('Retention: sessions older than 30 days are deleted', (gone?.length ?? 1) === 0);
  } else {
    check('Retention: could create aged test sessions', false);
  }

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

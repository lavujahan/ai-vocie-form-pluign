-- Answers a customer has sent wait for the operator: a portal that logs out after 15 minutes must not
-- cost the customer their form. "Send to desktop" sets hold_until (2 hours ahead, SENT_HOLD_MIN in
-- packages/shared/src/constants.ts); until then the purge leaves the session, its answers and its files
-- alone, and the extension lists it so the operator can use it from a new tab.
-- A column of its own: expires_at is the QR code's expiry, and "Connect phone again" resets it.
-- Retention is in store/pages/privacy.md, section 5.

alter table public.form_sessions add column if not exists hold_until timestamptz;
create index if not exists form_sessions_held_idx on public.form_sessions (user_id, hold_until desc) where hold_until is not null;

-- As in 0009, except that a session on hold doesn't expire.
create or replace function public.purge_expired()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.form_sessions
     set status = 'expired'
   where status <> 'expired'
     and expires_at < now() - interval '30 minutes'
     and (hold_until is null or hold_until < now());

  delete from public.field_values v
   using public.form_sessions s
   where v.session_id = s.id and s.status = 'expired';

  delete from public.utterances u
   using public.form_sessions s
   where u.session_id = s.id and s.status = 'expired';

  update public.form_fields f
     set choice_hint = null
    from public.form_sessions s
   where f.session_id = s.id and s.status = 'expired' and f.choice_hint is not null;

  delete from public.form_sessions
   where created_at < now() - interval '30 days';

  delete from public.login_attempts
   where created_at < now() - interval '1 day';
end;
$$;

revoke execute on function public.purge_expired() from public, anon, authenticated;
grant execute on function public.purge_expired() to service_role;

-- As in 0007, except that Start over ends the hold: nothing is left to wait for the operator.
create or replace function public.reset_session(p_session uuid, p_seq int, p_scope text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  update public.form_sessions
     set reset_seq = p_seq,
         reset_scope = p_scope,
         status = 'paired',
         hold_until = null
   where id = p_session
     and reset_seq < p_seq
     and status <> 'expired';
  get diagnostics n = row_count;
  if n = 0 then
    return false;
  end if;

  update public.form_fields set choice_hint = null where session_id = p_session and choice_hint is not null;
  delete from public.utterances where session_id = p_session and seq < p_seq;
  delete from public.field_files where session_id = p_session;

  perform public.upsert_field_value(p_session, f.id, null, null, null, p_seq, null)
     from public.form_fields f
    where f.session_id = p_session and f.field_type <> 'file';
  return true;
end;
$$;

revoke execute on function public.reset_session(uuid, int, text) from public, anon, authenticated;
grant execute on function public.reset_session(uuid, int, text) to service_role;

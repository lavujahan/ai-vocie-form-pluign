-- Start over on the phone, and the desktop form tab's state shown on the phone.
--   reset_seq / reset_scope: the phone's "Start over" (scope 'phone' = clear the phone's answers,
--                            'both' = also clear the form on the computer). Values older than
--                            reset_seq are gone and can never come back (latest-wins).
--   desktop_state:  'open' | 'moved' (the form tab now shows another site) | 'closed' (tab closed).
--                   The phone stops sending when it isn't 'open'.
--   desktop_report: the extension's last full fill {filled, skipped, total, at}, so the phone can show
--                   "Filled on computer ✓ 14/16" after Send to desktop.

alter table public.form_sessions
  add column if not exists reset_seq int not null default 0,
  add column if not exists reset_scope text check (reset_scope in ('phone', 'both')),
  add column if not exists desktop_state text not null default 'open' check (desktop_state in ('open', 'moved', 'closed')),
  add column if not exists desktop_report jsonb;

-- One transaction, in this order, so Realtime clients see the reset before the cleared values:
-- 1. the session row (reset_seq, back to 'paired' so Send to desktop works again)
-- 2. picker hints cleared, older utterances (transcripts of the previous applicant) deleted
-- 3. every field set to null at p_seq: utterances still in flight carry an older seq and lose.
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
         status = 'paired'
   where id = p_session
     and reset_seq < p_seq
     and status <> 'expired';
  get diagnostics n = row_count;
  if n = 0 then
    return false;
  end if;

  update public.form_fields set choice_hint = null where session_id = p_session and choice_hint is not null;
  delete from public.utterances where session_id = p_session and seq < p_seq;

  perform public.upsert_field_value(p_session, f.id, null, null, null, p_seq, null)
     from public.form_fields f
    where f.session_id = p_session;
  return true;
end;
$$;

revoke execute on function public.reset_session(uuid, int, text) from public, anon, authenticated;
grant execute on function public.reset_session(uuid, int, text) to service_role;

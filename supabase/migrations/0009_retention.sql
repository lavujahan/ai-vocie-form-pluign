-- Retention that matches the privacy policy (store/pages/privacy.md, section 5).
-- 0002 deleted values and transcripts of expired sessions, but kept the rest forever:
--   form_sessions (page URL, title, form name) and form_fields, whose choice_hint holds what the
--   person said for an unclear dropdown ("You said “…”").
-- Now, every 15 minutes:
--   1. sessions past their phone link (expires_at + 30 min) become 'expired';
--   2. their values, transcripts and picker hints are deleted;
--   3. sessions older than 30 days are deleted. form_fields, field_values, utterances and field_files
--      cascade; usage_events keep their numbers with session_id set to null (0008).
--   4. sign-in attempts older than 1 day are deleted (as in 0002).
-- Uploaded files themselves are purged by the app (/api/cron/purge-files), long before step 3.

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
     and expires_at < now() - interval '30 minutes';

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

-- Same job name as 0002: replaces its inline SQL with the function.
select cron.schedule('vff-purge-expired', '*/15 * * * *', $$select public.purge_expired()$$);

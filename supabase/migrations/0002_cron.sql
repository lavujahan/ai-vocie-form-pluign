-- Purge personal data of finished sessions.
-- A session is usable for the pairing code TTL (10 min) plus the phone JWT TTL (30 min).

create extension if not exists pg_cron;

select cron.schedule(
  'vff-purge-expired',
  '*/15 * * * *',
  $$
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

    delete from public.login_attempts
     where created_at < now() - interval '1 day';
  $$
);

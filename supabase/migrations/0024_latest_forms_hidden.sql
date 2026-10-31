-- × on a form under the extension's Latest forms: the operator doesn't want it listed. It only hides the
-- form from this operator: their sessions stay, so answers waiting for them are untouched, and form_cache
-- (shared by all users) is not changed. A later scan is a new session, which is not hidden, so it lists the
-- form again.

alter table public.form_sessions add column if not exists latest_hidden boolean not null default false;

-- As in 0023, without hidden sessions.
create or replace function public.user_scanned_forms(p_user uuid)
returns table (id uuid, form_name text, page_origin text, created_at timestamptz, field_count int)
language sql
stable
security definer
set search_path = public
as $$
  select s.id, s.form_name, s.page_origin, s.created_at,
         (select count(*)::int from public.form_fields f where f.session_id = s.id)
    from public.form_sessions s
   where s.user_id = p_user and s.analysis_status = 'done' and not s.latest_hidden
   order by s.created_at desc
   limit 300;
$$;

revoke execute on function public.user_scanned_forms(uuid) from public, anon, authenticated;
grant execute on function public.user_scanned_forms(uuid) to service_role;

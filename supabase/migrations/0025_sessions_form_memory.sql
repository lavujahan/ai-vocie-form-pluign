-- Latest forms comes from form memory: one form is one form_cache row, whatever a session's own name says.
-- form_cache has no record of who uses a form, so each session now keeps the form's fingerprint.
-- Apply after 0024. Deploy the app first: the app before this migration calls user_scanned_forms.

alter table public.form_sessions add column if not exists form_fingerprint text;
create index if not exists form_sessions_fingerprint_idx on public.form_sessions (user_id, form_fingerprint) where form_fingerprint is not null;

-- Sessions from before this: the whole-form reading of the same page whose fields they all have. The form's
-- heading is part of a fingerprint but isn't kept on a session, so this is a best match; the longest wins.
update public.form_sessions s
   set form_fingerprint = (
     select c.fingerprint
       from public.form_cache c
      where not c.partial
        and jsonb_array_length(c.fields) > 0
        and c.page_url = split_part(split_part(s.page_url, '?', 1), '#', 1)
        and not exists (
          select 1
            from jsonb_array_elements(c.fields) e
           where not exists (select 1 from public.form_fields f where f.session_id = s.id and f.field_key = e ->> 'field_key'))
      order by c.field_count desc
      limit 1)
 where s.form_fingerprint is null;

-- The forms in form memory this user has used: one row per form_cache row, with its uses (sessions are
-- deleted after 30 days, 0009) and the session with the most fields, which a new QR code copies: form memory
-- keeps a wizard's steps as separate rows, so only a session has the whole form.
create or replace function public.operator_forms(p_user uuid)
returns table (fingerprint text, form_name text, page_url text, uses int, last_used_at timestamptz, source_id uuid, field_count int)
language sql
stable
security definer
set search_path = public
as $$
  with used as (
    select s.id, s.form_fingerprint, s.created_at,
           (select count(*)::int from public.form_fields f where f.session_id = s.id) as fields
      from public.form_sessions s
     where s.user_id = p_user and s.form_fingerprint is not null and not s.latest_hidden
  ),
  forms as (
    select u.form_fingerprint, count(*)::int as uses, max(u.created_at) as last_used_at
      from used u
     group by u.form_fingerprint
  )
  select c.fingerprint, c.form_name, c.page_url, f.uses, f.last_used_at, best.id, best.fields
    from forms f
    join public.form_cache c on c.fingerprint = f.form_fingerprint and not c.partial
    cross join lateral (
      select u.id, u.fields
        from used u
       where u.form_fingerprint = f.form_fingerprint
       order by u.fields desc, u.created_at desc
       limit 1
    ) best
   where best.fields > 0;
$$;

revoke execute on function public.operator_forms(uuid) from public, anon, authenticated;
grant execute on function public.operator_forms(uuid) to service_role;

drop function if exists public.user_scanned_forms(uuid);

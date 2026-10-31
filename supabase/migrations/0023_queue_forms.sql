-- Queue QR: a customer fills a repeat form on their phone before their turn. The operator picks a form
-- they scanned before and shows a new QR code; the session starts from a copy of that scan's fields, with
-- no page open and no AI reading. Everything after that (pairing, Send, the hold, Use, Fill form) is as usual.
-- `queued` only changes what the customer's phone says. Retention is as in 0022.

alter table public.form_sessions add column if not exists queued boolean not null default false;

-- The user's scans, newest first, with their field counts, for the extension's Latest forms (lib/queue.ts
-- picks one per form). Counted here: a busy operator's fields don't fit in one API read. Sessions and their
-- fields are deleted after 30 days (0009), which is what limits the list to the last 30 days.
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
   where s.user_id = p_user and s.analysis_status = 'done'
   order by s.created_at desc
   limit 300;
$$;

revoke execute on function public.user_scanned_forms(uuid) from public, anon, authenticated;
grant execute on function public.user_scanned_forms(uuid) to service_role;

-- File uploads (photo / PDF) taken on the phone and put into the website's upload field.
--   storage bucket form-files: private; only the API (service role) reads or writes it. The phone
--                    uploads through a one-time signed URL; the extension downloads through a
--                    60-second signed URL. Files are deleted as soon as the computer has them.
--   form_fields.accept / file_rules: what the upload field takes (accept attribute + rules the Form
--                    Analyzer read from the page: formats, max KB, pages…).
--   field_files:     the file uploaded for a field (one per field; a newer upload replaces it).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('form-files', 'form-files', false, 10485760, array['image/jpeg', 'image/png', 'application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
-- No storage.objects policies for clients: anon / authenticated users can't list, read or write it.

alter table public.form_fields
  add column if not exists accept text,
  add column if not exists file_rules jsonb;

create table if not exists public.field_files (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.form_sessions (id) on delete cascade,
  field_id    uuid not null unique references public.form_fields (id) on delete cascade,
  path        text not null,
  file_name   text not null,
  mime        text not null check (mime in ('image/jpeg', 'image/png', 'application/pdf')),
  bytes       int  not null check (bytes > 0),
  pages       int,
  status      text not null default 'uploaded' check (status in ('uploaded', 'filled', 'rejected')),
  reason      text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists field_files_session_idx on public.field_files (session_id);

alter table public.field_files enable row level security;
drop policy if exists field_files_read on public.field_files;
create policy field_files_read on public.field_files
  for select to authenticated using (public.can_read_session(session_id));

alter publication supabase_realtime add table public.field_files;

-- Start over also forgets uploaded files (the API removes their storage objects first).
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
  delete from public.field_files where session_id = p_session;

  perform public.upsert_field_value(p_session, f.id, null, null, null, p_seq, null)
     from public.form_fields f
    where f.session_id = p_session and f.field_type <> 'file';
  return true;
end;
$$;

revoke execute on function public.reset_session(uuid, int, text) from public, anon, authenticated;
grant execute on function public.reset_session(uuid, int, text) to service_role;

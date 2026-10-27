-- Form readings (Form Analyzer results), shared by all users: a form is read by the AI once and the
-- reading is reused for every later scan of the same form (admin panel → Forms).
--   fingerprint: sha256 of the page origin + path, the form heading and every field's key, label, type,
--                required flag, options and help text. A changed field means a new fingerprint.
--   A reading is reused for 30 days while its model and prompt_version match the app's; a reading the
--   admin edited is kept until the admin clears it ("Read again").
-- Only form structure is stored here: no values, recordings or sessions.

create table if not exists public.form_cache (
  fingerprint    text primary key,
  form_name      text not null,
  page_url       text not null,
  field_count    int not null default 0,
  -- A later step of a form (fields that appeared after the first scan, e.g. a wizard's next page).
  partial        boolean not null default false,
  -- The scanned fields as the site shows them: [{field_key, label, field_type, required, options}].
  fields         jsonb not null default '[]',
  -- The reading that is reused: a FormAnalysis ({form_purpose, fields: [...]}).
  analysis       jsonb not null,
  model          text not null,
  prompt_version text not null,
  cost_usd       numeric(12, 6),
  uses           int not null default 0,
  last_used_at   timestamptz,
  created_at     timestamptz not null default now(),
  edited_at      timestamptz,
  edited_by      uuid references public.users (id) on delete set null
);
create index if not exists form_cache_last_used_idx on public.form_cache (last_used_at desc nulls last);
-- Only the API (service role) reads or writes it.
alter table public.form_cache enable row level security;

-- One more scan reused this reading.
create or replace function public.form_cache_hit(p_fingerprint text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.form_cache set uses = uses + 1, last_used_at = now() where fingerprint = p_fingerprint;
$$;

revoke execute on function public.form_cache_hit(text) from public, anon, authenticated;
grant execute on function public.form_cache_hit(text) to service_role;

-- Forms completed (extension popup, admin panel → Usage): one row per form session that the computer
-- filled, with at most 2 of its non-upload fields left empty (the rule is in apps/web/lib/completions.ts).
-- Recorded once per session. Kept when sessions are deleted after 30 days (0009), so session_id has no
-- foreign key.

create table if not exists public.form_completions (
  session_id   uuid primary key,
  user_id      uuid references public.users (id) on delete set null,
  form_name    text not null default '',
  page_url     text not null default '',
  fields       int not null default 0,
  filled       int not null default 0,
  completed_at timestamptz not null default now()
);
create index if not exists form_completions_user_idx on public.form_completions (user_id, completed_at);
create index if not exists form_completions_at_idx on public.form_completions (completed_at);
-- Only the API (service role) reads or writes it.
alter table public.form_completions enable row level security;

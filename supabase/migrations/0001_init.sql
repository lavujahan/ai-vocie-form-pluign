-- AI Voice Form Filler: core schema (MVP)
-- All writes go through Next.js API routes using the service role.
-- Clients (extension, phone) only read via RLS-scoped JWTs, mostly through Realtime.

create extension if not exists pgcrypto;

-- ---------- users & auth ----------

create table public.users (
  id              uuid primary key default gen_random_uuid(),
  phone           text not null unique,
  name            text not null,
  pin_hash        text not null,
  role            text not null default 'user' check (role in ('admin', 'user')),
  is_active       boolean not null default true,
  failed_attempts int not null default 0,
  locked_until    timestamptz,
  created_at      timestamptz not null default now()
);

create table public.login_attempts (
  id         bigint generated always as identity primary key,
  ip         text,
  phone      text,
  success    boolean not null,
  created_at timestamptz not null default now()
);
create index login_attempts_phone_idx on public.login_attempts (phone, created_at desc);
create index login_attempts_ip_idx on public.login_attempts (ip, created_at desc);

-- Atomically counts a failed PIN attempt and locks the account at p_max failures.
-- Returns the new failure count (0 once locked) and the lock expiry.
create or replace function public.register_failed_login(p_user uuid, p_max int, p_lock_minutes int)
returns table (failed_attempts int, locked_until timestamptz)
language sql
security definer
set search_path = public
as $$
  update public.users u
     set failed_attempts = case when u.failed_attempts + 1 >= p_max then 0 else u.failed_attempts + 1 end,
         locked_until    = case when u.failed_attempts + 1 >= p_max
                                then now() + make_interval(mins => p_lock_minutes)
                                else u.locked_until end
   where u.id = p_user
  returning u.failed_attempts, u.locked_until;
$$;

revoke execute on function public.register_failed_login(uuid, int, int) from public, anon, authenticated;
grant execute on function public.register_failed_login(uuid, int, int) to service_role;

-- ---------- sessions & fields ----------

create table public.form_sessions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.users (id) on delete cascade,
  session_code    text not null unique,
  status          text not null default 'waiting' check (status in ('waiting', 'paired', 'filled', 'expired')),
  form_name       text not null default '',
  page_url        text not null,
  page_origin     text not null,
  page_title      text,
  analysis_status text not null default 'pending' check (analysis_status in ('pending', 'done', 'error')),
  expires_at      timestamptz not null,
  paired_at       timestamptz,
  created_at      timestamptz not null default now()
);
create index form_sessions_user_idx on public.form_sessions (user_id, created_at desc);

create table public.form_fields (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid not null references public.form_sessions (id) on delete cascade,
  field_key     text not null,
  label         text not null,
  clean_label   text,
  field_type    text not null,
  required      boolean not null default false,
  options       jsonb not null default '[]'::jsonb,
  multiple      boolean not null default false,
  group_key     text,
  depends_on    text,
  step_index    int not null default 0,
  min           text,
  max           text,
  pattern       text,
  placeholder   text,
  context       text,
  -- filled in by the Form Analyzer Agent
  semantic_type text,
  validation    jsonb,
  output_script text not null default 'en' check (output_script in ('en', 'ta')),
  position      int not null,
  unique (session_id, field_key)
);

create table public.utterances (
  id               uuid primary key default gen_random_uuid(),
  session_id       uuid not null references public.form_sessions (id) on delete cascade,
  seq              int not null,
  target_field_key text,
  status           text not null default 'processing' check (status in ('processing', 'done', 'error')),
  transcript       text,
  error            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (session_id, seq)
);

create table public.field_values (
  id                  uuid primary key default gen_random_uuid(),
  -- denormalized so Realtime can filter on session_id
  session_id          uuid not null references public.form_sessions (id) on delete cascade,
  field_id            uuid not null unique references public.form_fields (id) on delete cascade,
  value               text,
  confidence          real,
  source_phrase       text,
  source_seq          int not null default 0,
  source_utterance_id uuid references public.utterances (id) on delete set null,
  updated_at          timestamptz not null default now()
);
create index field_values_session_idx on public.field_values (session_id);

-- ---------- latest-wins upsert ----------
-- A value only overwrites an existing one if it comes from the same or a newer seq,
-- so a slow utterance #2 can never overwrite the result of utterance #3.

create or replace function public.upsert_field_value(
  p_session       uuid,
  p_field         uuid,
  p_value         text,
  p_confidence    real,
  p_source_phrase text,
  p_seq           int,
  p_utterance     uuid
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  insert into public.field_values
    (session_id, field_id, value, confidence, source_phrase, source_seq, source_utterance_id, updated_at)
  values
    (p_session, p_field, p_value, p_confidence, p_source_phrase, p_seq, p_utterance, now())
  on conflict (field_id) do update
    set value               = excluded.value,
        confidence          = excluded.confidence,
        source_phrase       = excluded.source_phrase,
        source_seq          = excluded.source_seq,
        source_utterance_id = excluded.source_utterance_id,
        updated_at          = now()
    where public.field_values.source_seq <= excluded.source_seq;
  get diagnostics n = row_count;
  return n > 0;
end;
$$;

revoke execute on function public.upsert_field_value(uuid, uuid, text, real, text, int, uuid) from public, anon, authenticated;
grant execute on function public.upsert_field_value(uuid, uuid, text, real, text, int, uuid) to service_role;

-- ---------- Row Level Security ----------
-- Extension user JWT:  sub = users.id,          no session_id claim
-- Phone session JWT:   sub = form_sessions.id,  session_id claim, scope = 'phone'

create or replace function public.jwt_session_id() returns uuid
language sql stable
as $$ select nullif(auth.jwt() ->> 'session_id', '')::uuid $$;

create or replace function public.jwt_is_user() returns boolean
language sql stable
as $$ select coalesce(auth.jwt() ->> 'scope', '') <> 'phone' $$;

create or replace function public.can_read_session(p_session uuid) returns boolean
language sql stable
security definer
set search_path = public
as $$
  select p_session = public.jwt_session_id()
      or (public.jwt_is_user() and exists (
            select 1 from public.form_sessions s where s.id = p_session and s.user_id = auth.uid()));
$$;

alter table public.users          enable row level security;
alter table public.login_attempts enable row level security;
alter table public.form_sessions  enable row level security;
alter table public.form_fields    enable row level security;
alter table public.utterances     enable row level security;
alter table public.field_values   enable row level security;

-- users / login_attempts: no policies → no client access at all.

create policy form_sessions_read on public.form_sessions
  for select to authenticated using (public.can_read_session(id));

create policy form_fields_read on public.form_fields
  for select to authenticated using (public.can_read_session(session_id));

create policy utterances_read on public.utterances
  for select to authenticated using (public.can_read_session(session_id));

create policy field_values_read on public.field_values
  for select to authenticated using (public.can_read_session(session_id));

-- ---------- Realtime ----------

alter publication supabase_realtime add table public.form_sessions, public.form_fields, public.utterances, public.field_values;

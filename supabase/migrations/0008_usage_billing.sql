-- AI usage per user, for billing (admin panel → Usage).
--   usage_events:     one row per paid provider call: Sarvam speech-to-text (audio_ms) or an OpenAI
--                     agent run (tokens, cost_usd at the model's list price). Kept when sessions and
--                     utterances are purged, so utterance_id has no foreign key.
--   billing_settings: one row, set by the admin: USD→INR rate for OpenAI, Sarvam ₹ per minute.
--   usage_summary():  per-user totals for a period (the admin page converts them to ₹).

create table if not exists public.usage_events (
  id                  bigint generated always as identity primary key,
  created_at          timestamptz not null default now(),
  user_id             uuid references public.users (id) on delete set null,
  session_id          uuid references public.form_sessions (id) on delete set null,
  utterance_id        uuid,
  kind                text not null check (kind in ('stt', 'map', 'analyze', 'resolve')),
  provider            text not null check (provider in ('sarvam', 'openai')),
  model               text not null,
  ok                  boolean not null default true,
  audio_ms            int check (audio_ms >= 0),
  requests            int not null default 0,
  input_tokens        int not null default 0,
  cached_input_tokens int not null default 0,
  output_tokens       int not null default 0,
  cost_usd            numeric(12, 6)
);
create index if not exists usage_events_created_idx on public.usage_events (created_at);
create index if not exists usage_events_user_idx on public.usage_events (user_id, created_at);
-- Only the API (service role) reads or writes it.
alter table public.usage_events enable row level security;

create table if not exists public.billing_settings (
  id                 boolean primary key default true check (id),
  usd_inr_rate       numeric(10, 4) not null default 88 check (usd_inr_rate > 0),
  sarvam_inr_per_min numeric(10, 4) not null default 0.49 check (sarvam_inr_per_min > 0),
  updated_at         timestamptz not null default now(),
  updated_by         uuid references public.users (id) on delete set null
);
insert into public.billing_settings (id) values (true) on conflict (id) do nothing;
alter table public.billing_settings enable row level security;

create or replace function public.usage_summary(p_from timestamptz, p_to timestamptz)
returns table (
  user_id             uuid,
  name                text,
  phone               text,
  stt_calls           bigint,
  audio_ms            bigint,
  llm_calls           bigint,
  input_tokens        bigint,
  cached_input_tokens bigint,
  output_tokens       bigint,
  openai_usd          numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select e.user_id,
         u.name,
         u.phone,
         count(*) filter (where e.provider = 'sarvam'),
         coalesce(sum(e.audio_ms), 0)::bigint,
         count(*) filter (where e.provider = 'openai'),
         coalesce(sum(e.input_tokens), 0)::bigint,
         coalesce(sum(e.cached_input_tokens), 0)::bigint,
         coalesce(sum(e.output_tokens), 0)::bigint,
         coalesce(sum(e.cost_usd), 0)
    from public.usage_events e
    left join public.users u on u.id = e.user_id
   where e.created_at >= p_from
     and e.created_at < p_to
   group by e.user_id, u.name, u.phone
   order by u.name nulls last;
$$;

revoke execute on function public.usage_summary(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.usage_summary(timestamptz, timestamptz) to service_role;

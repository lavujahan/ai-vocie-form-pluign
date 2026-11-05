-- Plan counters: every feature is in every plan; plans differ by how much of each they allow per period.
--   plans / subscriptions: computers (signed in at once), documents (files sent into a form from the phone
--                   or the scanner), voice_qrs (Generate QR with voice on), nonvoice_qrs (Generate QR with
--                   Typing only). null = no limit. A period copies its plan's limits when it starts, as it
--                   does minutes, so a change applies from each user's next renewal; periods that started
--                   before this migration keep no limits until they renew. extra_*: added by the admin.
--   feature_events: one row per counted use. Kept when sessions are purged, like usage_events. `ref` makes
--                   a use count once: a document is counted once per upload field of a form.
--   user_devices:   computers the extension signed in on. One counts while its sign-in hasn't expired
--                   and it hasn't been signed out (by the user, from another computer, or by the admin).
--   add_extra():    adds any counter (or minutes) to the active period, with its payment.
-- Also: Starter ₹99 → ₹149.

alter table public.plans
  add column if not exists computers    int check (computers >= 1),
  add column if not exists documents    int check (documents >= 0),
  add column if not exists voice_qrs    int check (voice_qrs >= 0),
  add column if not exists nonvoice_qrs int check (nonvoice_qrs >= 0);

alter table public.subscriptions
  add column if not exists computers          int check (computers >= 1),
  add column if not exists documents          int check (documents >= 0),
  add column if not exists voice_qrs          int check (voice_qrs >= 0),
  add column if not exists nonvoice_qrs       int check (nonvoice_qrs >= 0),
  add column if not exists extra_computers    int not null default 0 check (extra_computers >= 0),
  add column if not exists extra_documents    int not null default 0 check (extra_documents >= 0),
  add column if not exists extra_voice_qrs    int not null default 0 check (extra_voice_qrs >= 0),
  add column if not exists extra_nonvoice_qrs int not null default 0 check (extra_nonvoice_qrs >= 0);

update public.plans set computers = 1, documents = 10,  voice_qrs = 15,   nonvoice_qrs = 5   where id = 'trial';
update public.plans set computers = 1, documents = 30,  voice_qrs = 60,   nonvoice_qrs = 20, price_inr = 149, updated_at = now() where id = 'starter';
update public.plans set computers = 1, documents = 80,  voice_qrs = 150,  nonvoice_qrs = 50  where id = 'basic';
update public.plans set computers = 2, documents = 250, voice_qrs = 400,  nonvoice_qrs = 150 where id = 'pro';
update public.plans set computers = 3, documents = 800, voice_qrs = 1200, nonvoice_qrs = 500 where id = 'business';

create table if not exists public.feature_events (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  user_id    uuid references public.users (id) on delete set null,
  session_id uuid references public.form_sessions (id) on delete set null,
  kind       text not null check (kind in ('document', 'voice_qr', 'nonvoice_qr')),
  ref        text
);
create index if not exists feature_events_user_idx on public.feature_events (user_id, kind, created_at);
create unique index if not exists feature_events_once_idx on public.feature_events (session_id, kind, ref) where ref is not null;
alter table public.feature_events enable row level security;

create table if not exists public.user_devices (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users (id) on delete cascade,
  device_key    text not null check (length(device_key) between 16 and 64),
  name          text not null,
  user_agent    text,
  signed_in_at  timestamptz not null default now(),
  expires_at    timestamptz not null,
  last_seen_at  timestamptz not null default now(),
  signed_out_at timestamptz,
  unique (user_id, device_key)
);
alter table public.user_devices enable row level security;

-- As in 0013, plus the plan's limits.
create or replace function public.grant_plan(
  p_user      uuid,
  p_plan      text,
  p_starts_at timestamptz,
  p_amount    numeric,
  p_method    text,
  p_reference text,
  p_note      text,
  p_admin     uuid
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  pl  public.plans;
  sid uuid;
begin
  select * into pl from public.plans where id = p_plan;
  if not found then raise exception 'unknown_plan' using errcode = 'P0002'; end if;
  perform 1 from public.users where id = p_user for update;
  if not found then raise exception 'unknown_user' using errcode = 'P0002'; end if;
  if exists (select 1 from public.subscriptions where user_id = p_user and starts_at >= p_starts_at) then
    raise exception 'already_planned' using errcode = 'P0001';
  end if;

  update public.subscriptions
     set ends_at = p_starts_at
   where user_id = p_user and starts_at < p_starts_at and ends_at > p_starts_at;

  insert into public.subscriptions (user_id, plan_id, starts_at, ends_at, minutes, computers, documents, voice_qrs, nonvoice_qrs, note, created_by)
  values (p_user, pl.id, p_starts_at, p_starts_at + make_interval(days => pl.days), pl.minutes,
          pl.computers, pl.documents, pl.voice_qrs, pl.nonvoice_qrs, p_note, p_admin)
  returning id into sid;

  if coalesce(p_amount, 0) > 0 then
    insert into public.payments (user_id, subscription_id, kind, amount_inr, method, reference, note, recorded_by)
    values (p_user, sid, 'plan', p_amount, p_method, p_reference, p_note, p_admin);
  end if;
  return sid;
end;
$$;

-- Adds `p_count` of one counter ('minutes', 'computers', 'documents', 'voice_qrs', 'nonvoice_qrs') to the
-- user's active period until it ends, and records the payment when there was one (kind 'topup').
-- Refused (P0001 'no_active_plan') if the user has no active period.
create or replace function public.add_extra(
  p_user      uuid,
  p_kind      text,
  p_count     int,
  p_amount    numeric,
  p_method    text,
  p_reference text,
  p_note      text,
  p_admin     uuid
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  sid uuid;
begin
  if p_kind not in ('minutes', 'computers', 'documents', 'voice_qrs', 'nonvoice_qrs') or p_count < 1 then
    raise exception 'bad_extra' using errcode = 'P0001';
  end if;
  select id into sid
    from public.subscriptions
   where user_id = p_user and starts_at <= now() and ends_at > now()
   order by starts_at desc
   limit 1
     for update;
  if sid is null then raise exception 'no_active_plan' using errcode = 'P0001'; end if;

  update public.subscriptions
     set extra_minutes      = extra_minutes      + case when p_kind = 'minutes'      then p_count else 0 end,
         extra_computers    = extra_computers    + case when p_kind = 'computers'    then p_count else 0 end,
         extra_documents    = extra_documents    + case when p_kind = 'documents'    then p_count else 0 end,
         extra_voice_qrs    = extra_voice_qrs    + case when p_kind = 'voice_qrs'    then p_count else 0 end,
         extra_nonvoice_qrs = extra_nonvoice_qrs + case when p_kind = 'nonvoice_qrs' then p_count else 0 end
   where id = sid;

  if coalesce(p_amount, 0) > 0 then
    insert into public.payments (user_id, subscription_id, kind, amount_inr, method, reference, note, recorded_by)
    values (p_user, sid, 'topup', p_amount, p_method, p_reference, p_note, p_admin);
  end if;
  return sid;
end;
$$;

-- As in 0013, plus each counter's limit (null = no limit) and its use in the period. The return type
-- changes, so the function is dropped first.
drop function if exists public.subscription_status(uuid);
create function public.subscription_status(p_user uuid default null)
returns table (
  user_id            uuid,
  role               text,
  subscription_id    uuid,
  plan_id            text,
  plan_name          text,
  starts_at          timestamptz,
  ends_at            timestamptz,
  minutes_total      int,
  used_ms            bigint,
  paid_until         timestamptz,
  computers_total    int,
  documents_total    int,
  documents_used     int,
  voice_qrs_total    int,
  voice_qrs_used     int,
  nonvoice_qrs_total int,
  nonvoice_qrs_used  int
)
language sql
stable
security definer
set search_path = public
as $$
  select u.id,
         u.role,
         s.id,
         s.plan_id,
         p.name,
         s.starts_at,
         s.ends_at,
         s.minutes + s.extra_minutes,
         case when s.id is null then 0
              else coalesce((select sum(e.audio_ms) from public.usage_events e
                              where e.user_id = u.id and e.created_at >= s.starts_at and e.created_at < s.ends_at), 0)
         end::bigint,
         (select max(x.ends_at) from public.subscriptions x where x.user_id = u.id),
         s.computers + s.extra_computers,
         s.documents + s.extra_documents,
         coalesce(c.documents, 0)::int,
         s.voice_qrs + s.extra_voice_qrs,
         coalesce(c.voice_qrs, 0)::int,
         s.nonvoice_qrs + s.extra_nonvoice_qrs,
         coalesce(c.nonvoice_qrs, 0)::int
    from public.users u
    left join lateral (
      select * from public.subscriptions x
       where x.user_id = u.id and x.starts_at <= now()
       order by x.starts_at desc
       limit 1
    ) s on true
    left join public.plans p on p.id = s.plan_id
    left join lateral (
      select count(*) filter (where f.kind = 'document')    as documents,
             count(*) filter (where f.kind = 'voice_qr')    as voice_qrs,
             count(*) filter (where f.kind = 'nonvoice_qr') as nonvoice_qrs
        from public.feature_events f
       where s.id is not null and f.user_id = u.id and f.created_at >= s.starts_at and f.created_at < s.ends_at
    ) c on true
   where p_user is null or u.id = p_user;
$$;

revoke execute on function public.grant_plan(uuid, text, timestamptz, numeric, text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.grant_plan(uuid, text, timestamptz, numeric, text, text, text, uuid) to service_role;
revoke execute on function public.add_extra(uuid, text, int, numeric, text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.add_extra(uuid, text, int, numeric, text, text, text, uuid) to service_role;
revoke execute on function public.subscription_status(uuid) from public, anon, authenticated;
grant execute on function public.subscription_status(uuid) to service_role;

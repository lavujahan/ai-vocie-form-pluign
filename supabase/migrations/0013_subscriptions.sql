-- Subscriptions (admin panel → Users, Plans, Billing): monthly plans with a voice-minute quota, paid by
-- UPI or bank transfer and recorded by the admin.
--   plans:          what is sold. minutes = voice minutes (Sarvam audio, usage_events.audio_ms) per
--                   period of `days` days.
--   subscriptions:  one row per period a user can use the app (starts_at → ends_at). minutes is copied
--                   from the plan, so a later plan change doesn't touch running periods; extra_minutes
--                   are top-ups. A user's plan is the latest period that has started; it is active while
--                   now() < ends_at. Expiry is worked out from the dates: no cron job.
--   payments:       money received, one row per payment (recorded by the admin now; a payment gateway
--                   can write here later). Kept when users are deactivated.
--   subscription_status(): each user's plan, end date and voice minutes used in it.
-- The API blocks scanning and speaking for users without an active plan with minutes left; admins are
-- never blocked. Only the API (service role) reads or writes these tables.

create table if not exists public.plans (
  id         text primary key check (id ~ '^[a-z0-9_-]{1,32}$'),
  name       text not null,
  price_inr  numeric(10, 2) not null default 0 check (price_inr >= 0),
  minutes    int not null check (minutes >= 0),
  days       int not null default 30 check (days between 1 and 366),
  is_active  boolean not null default true,
  sort       int not null default 0,
  updated_at timestamptz not null default now()
);
insert into public.plans (id, name, price_inr, minutes, days, sort) values
  ('trial', 'Trial', 0, 20, 7, 0),
  ('basic', 'Basic', 199, 150, 30, 1),
  ('pro', 'Pro', 499, 500, 30, 2),
  ('business', 'Business', 1499, 2000, 30, 3)
on conflict (id) do nothing;
alter table public.plans enable row level security;

create table if not exists public.subscriptions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users (id) on delete cascade,
  plan_id       text not null references public.plans (id),
  starts_at     timestamptz not null,
  ends_at       timestamptz not null,
  minutes       int not null check (minutes >= 0),
  extra_minutes int not null default 0 check (extra_minutes >= 0),
  note          text,
  created_by    uuid references public.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index if not exists subscriptions_user_idx on public.subscriptions (user_id, starts_at desc);
alter table public.subscriptions enable row level security;

create table if not exists public.payments (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references public.users (id) on delete set null,
  subscription_id uuid references public.subscriptions (id) on delete set null,
  kind            text not null check (kind in ('plan', 'topup')),
  amount_inr      numeric(10, 2) not null check (amount_inr > 0),
  method          text not null check (method in ('upi', 'bank', 'cash', 'razorpay', 'other')),
  reference       text,
  note            text,
  paid_at         timestamptz not null default now(),
  recorded_by     uuid references public.users (id) on delete set null
);
create index if not exists payments_paid_idx on public.payments (paid_at);
create index if not exists payments_user_idx on public.payments (user_id, paid_at desc);
alter table public.payments enable row level security;

-- Starts a plan for a user, and records the payment when there was one (p_amount > 0).
-- A plan that starts inside the current period (a plan change) ends that period then.
-- Refused (P0001 'already_planned') if the user already has a period starting at or after p_starts_at.
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

  insert into public.subscriptions (user_id, plan_id, starts_at, ends_at, minutes, note, created_by)
  values (p_user, pl.id, p_starts_at, p_starts_at + make_interval(days => pl.days), pl.minutes, p_note, p_admin)
  returning id into sid;

  if coalesce(p_amount, 0) > 0 then
    insert into public.payments (user_id, subscription_id, kind, amount_inr, method, reference, note, recorded_by)
    values (p_user, sid, 'plan', p_amount, p_method, p_reference, p_note, p_admin);
  end if;
  return sid;
end;
$$;

-- Adds voice minutes to the user's active period (a top-up), and records the payment when there was one.
-- Refused (P0001 'no_active_plan') if the user has no active period.
create or replace function public.add_minutes(
  p_user      uuid,
  p_minutes   int,
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
  select id into sid
    from public.subscriptions
   where user_id = p_user and starts_at <= now() and ends_at > now()
   order by starts_at desc
   limit 1
     for update;
  if sid is null then raise exception 'no_active_plan' using errcode = 'P0001'; end if;

  update public.subscriptions set extra_minutes = extra_minutes + p_minutes where id = sid;

  if coalesce(p_amount, 0) > 0 then
    insert into public.payments (user_id, subscription_id, kind, amount_inr, method, reference, note, recorded_by)
    values (p_user, sid, 'topup', p_amount, p_method, p_reference, p_note, p_admin);
  end if;
  return sid;
end;
$$;

-- Each user's latest started period (or none), with the voice minutes used in it, for one user or all.
-- paid_until: the end of the last period paid for (later than ends_at when renewed early).
create or replace function public.subscription_status(p_user uuid default null)
returns table (
  user_id         uuid,
  role            text,
  subscription_id uuid,
  plan_id         text,
  plan_name       text,
  starts_at       timestamptz,
  ends_at         timestamptz,
  minutes_total   int,
  used_ms         bigint,
  paid_until      timestamptz
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
         (select max(x.ends_at) from public.subscriptions x where x.user_id = u.id)
    from public.users u
    left join lateral (
      select * from public.subscriptions x
       where x.user_id = u.id and x.starts_at <= now()
       order by x.starts_at desc
       limit 1
    ) s on true
    left join public.plans p on p.id = s.plan_id
   where p_user is null or u.id = p_user;
$$;

revoke execute on function public.grant_plan(uuid, text, timestamptz, numeric, text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.grant_plan(uuid, text, timestamptz, numeric, text, text, text, uuid) to service_role;
revoke execute on function public.add_minutes(uuid, int, numeric, text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.add_minutes(uuid, int, numeric, text, text, text, uuid) to service_role;
revoke execute on function public.subscription_status(uuid) from public, anon, authenticated;
grant execute on function public.subscription_status(uuid) to service_role;

-- Users who exist before plans: a Trial from now, so nobody is cut off the moment this is applied.
-- Renew paying customers from admin panel → Users.
insert into public.subscriptions (user_id, plan_id, starts_at, ends_at, minutes, note)
select u.id, 'trial', now(), now() + interval '7 days', 20, 'Given when plans started'
  from public.users u
 where u.role = 'user'
   and not exists (select 1 from public.subscriptions s where s.user_id = u.id);

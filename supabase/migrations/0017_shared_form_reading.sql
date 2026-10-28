-- Form reading (usage_events.kind = 'analyze') is shared: a form is read once and the result is reused by
-- every user (form_cache, migration 0012). So it is no longer counted on the user who happened to open the
-- form first.
--   usage_summary(): one row per user without form reading, plus one row with shared = true (no user)
--                    holding all form reading in the dates.
--   usage_daily():   for one user, leaves form reading out; for all users, keeps it (it was still paid).

drop function if exists public.usage_summary(timestamptz, timestamptz);

create function public.usage_summary(p_from timestamptz, p_to timestamptz)
returns table (
  user_id             uuid,
  name                text,
  phone               text,
  shared              boolean,
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
  select case when e.kind = 'analyze' then null else e.user_id end,
         case when e.kind = 'analyze' then null else u.name end,
         case when e.kind = 'analyze' then null else u.phone end,
         e.kind = 'analyze',
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
   group by 1, 2, 3, 4
   order by 4, 2 nulls last;
$$;

revoke execute on function public.usage_summary(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.usage_summary(timestamptz, timestamptz) to service_role;

create or replace function public.usage_daily(p_from timestamptz, p_to timestamptz, p_user uuid default null)
returns table (
  day                 date,
  stt_calls           bigint,
  audio_ms            bigint,
  llm_calls           bigint,
  input_tokens        bigint,
  cached_input_tokens bigint,
  output_tokens       bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select (e.created_at at time zone 'Asia/Kolkata')::date,
         count(*) filter (where e.provider = 'sarvam'),
         coalesce(sum(e.audio_ms), 0)::bigint,
         count(*) filter (where e.provider = 'openai'),
         coalesce(sum(e.input_tokens), 0)::bigint,
         coalesce(sum(e.cached_input_tokens), 0)::bigint,
         coalesce(sum(e.output_tokens), 0)::bigint
    from public.usage_events e
   where e.created_at >= p_from
     and e.created_at < p_to
     and (p_user is null or (e.user_id = p_user and e.kind <> 'analyze'))
   group by 1
   order by 1;
$$;

revoke execute on function public.usage_daily(timestamptz, timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.usage_daily(timestamptz, timestamptz, uuid) to service_role;

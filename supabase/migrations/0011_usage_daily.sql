-- Day-by-day AI usage (admin panel → Usage → By day), for all users or one user.
-- Days follow India time, like the rest of the Usage page. Costs are worked out by the app from these
-- token and audio totals with the admin's prices (billing_settings).

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
     and (p_user is null or e.user_id = p_user)
   group by 1
   order by 1;
$$;

revoke execute on function public.usage_daily(timestamptz, timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.usage_daily(timestamptz, timestamptz, uuid) to service_role;

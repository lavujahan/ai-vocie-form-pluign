-- Tamil typing on the phone: the த bubble in the popup shows a QR; the phone opens /t/<code>, speaks
-- Tamil there, and each sentence reaches the extension (Realtime), which adds it to its Tamil text.
--   tamil_pads:       one QR. Single use (paired_at), 10 minutes to scan, ended by either side.
--   tamil_pad_pieces: one sentence per recording (its 28 s pieces joined), in spoken order (seq). The
--                     phone can edit or delete it; `deleted` keeps the row so the computer hears it.
-- No form is involved and no QR counter is used: the seconds count in the owner's voice minutes
-- (usage_events with no session, as Tamil typing on the computer). The audio is never stored; the text
-- is deleted 2 hours after the pad was last used (purge_tamil_pads, every 15 minutes).

create table if not exists public.tamil_pads (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.users (id) on delete cascade,
  code         text not null unique,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null,
  paired_at    timestamptz,
  ended_at     timestamptz,
  last_seen_at timestamptz not null default now()
);
create index if not exists tamil_pads_user_idx on public.tamil_pads (user_id, created_at desc);

create table if not exists public.tamil_pad_pieces (
  pad_id     uuid not null references public.tamil_pads (id) on delete cascade,
  seq        int not null check (seq > 0),
  text       text not null default '' check (length(text) <= 5000),
  audio_ms   int not null default 0 check (audio_ms >= 0),
  deleted    boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (pad_id, seq)
);

alter table public.tamil_pads       enable row level security;
alter table public.tamil_pad_pieces enable row level security;

-- Only the extension user who made the pad reads it (for Realtime). The phone uses the API.
create or replace function public.can_read_tamil_pad(p_pad uuid) returns boolean
language sql stable
security definer
set search_path = public
as $$
  select coalesce(auth.jwt() ->> 'scope', '') = 'user'
     and exists (select 1 from public.tamil_pads p where p.id = p_pad and p.user_id = auth.uid());
$$;

drop policy if exists tamil_pads_read on public.tamil_pads;
create policy tamil_pads_read on public.tamil_pads
  for select to authenticated using (public.can_read_tamil_pad(id));

drop policy if exists tamil_pad_pieces_read on public.tamil_pad_pieces;
create policy tamil_pad_pieces_read on public.tamil_pad_pieces
  for select to authenticated using (public.can_read_tamil_pad(pad_id));

alter publication supabase_realtime add table public.tamil_pads, public.tamil_pad_pieces;

create or replace function public.purge_tamil_pads()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.tamil_pads
   where greatest(last_seen_at, coalesce(ended_at, last_seen_at)) < now() - interval '2 hours'
      or (paired_at is null and expires_at < now() - interval '30 minutes');
$$;

revoke execute on function public.purge_tamil_pads() from public, anon, authenticated;
grant execute on function public.purge_tamil_pads() to service_role;

select cron.schedule('vff-purge-tamil-pads', '*/15 * * * *', $$select public.purge_tamil_pads()$$);

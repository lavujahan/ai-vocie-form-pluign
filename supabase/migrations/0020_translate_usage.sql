-- Tamil helper on the phone page (POST /api/translate): English form text into Tamil with OpenAI.
-- Its calls are billed like the other AI steps, as usage kind 'translate'.

alter table public.usage_events drop constraint if exists usage_events_kind_check;
alter table public.usage_events
  add constraint usage_events_kind_check check (kind in ('stt', 'map', 'analyze', 'resolve', 'translate'));

-- Long recordings are sent to speech-to-text in pieces (< 30 s each, Sarvam's limit).
-- Pieces of one recording share a recording_id and are numbered by part (0, 1, 2…), so the
-- server can map the joined transcript of all pieces instead of each piece alone.

alter table public.utterances
  add column if not exists recording_id uuid,
  add column if not exists part int;

create index if not exists utterances_recording_idx
  on public.utterances (session_id, recording_id, part);

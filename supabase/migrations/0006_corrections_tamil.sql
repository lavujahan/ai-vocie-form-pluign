-- Spoken commands and Tamil labels on the phone.
--   utterances.command: the speech was a command ("start over", "send it", "what is left?"); the phone
--                       asks before acting on it.
--   form_fields.label_ta: Tamil translation of the field label (Form Analyzer), shown on the phone in Tamil mode.

alter table public.utterances
  add column if not exists command text check (command in ('start_over', 'send', 'whats_left'));

alter table public.form_fields
  add column if not exists label_ta text;

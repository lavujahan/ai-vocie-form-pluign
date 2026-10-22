-- Milestone 7a: cascading dropdowns (State → District → Taluk → Village).
--   dynamic_options: the dropdown's options load later (it was empty/disabled when the form was scanned)
--   choice_hint:     set when the extension couldn't match the spoken value to the loaded options;
--                    the phone shows a picker of the best candidates. Cleared once a value is chosen.

alter table public.form_fields
  add column if not exists dynamic_options boolean not null default false,
  add column if not exists choice_hint jsonb;

-- Fields a choice on the page hides now: the other branch of a form ("Individual" shows some fields,
-- "Organisation" others). The extension reports them; the phone lists them under "Not on the form now"
-- and keeps their values (they fill again if the field comes back), and the mapper is told about them.
-- The session's field list itself only grows, so the mapper's prompt keeps the same start (cached).

alter table public.form_sessions add column if not exists hidden_fields text[] not null default '{}';

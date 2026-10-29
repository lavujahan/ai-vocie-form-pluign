-- Typing-only forms: the operator turns voice off when scanning (or later, from the popup's menu), so a
-- customer filling the form on their own phone only types. The phone shows no mic, and the API refuses
-- recordings for the form before any speech-to-text or AI call. Typing-only forms use no voice minutes.

alter table public.form_sessions add column if not exists voice_enabled boolean not null default true;

-- A form's field list, saved once with its reading (form_cache, migration 0012): every later session of
-- the form, by any user, gets exactly these fields, whatever the page showed when it was scanned (options
-- that loaded, a ticked checkbox). So the mapper's prompt starts with the same text every time and OpenAI
-- bills it at the cached price. Readings saved before this have no template: their next scan saves one.

alter table public.form_cache add column if not exists template jsonb;

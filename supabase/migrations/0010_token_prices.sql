-- Token prices set by the admin (admin panel → Usage), in USD per 1M tokens.
-- Each user's OpenAI cost = input tokens × input price + output tokens × output price, worked out
-- from the token totals when the page is shown, so a new price applies to every month at once.
-- Defaults: gpt-4o list price (https://developers.openai.com/api/docs/pricing).

alter table public.billing_settings
  add column if not exists input_usd_per_m  numeric(10, 4) not null default 2.5 check (input_usd_per_m >= 0),
  add column if not exists output_usd_per_m numeric(10, 4) not null default 10  check (output_usd_per_m >= 0);

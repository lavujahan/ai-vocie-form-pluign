-- Cached input token price set by the admin (admin panel → Usage), in USD per 1M tokens.
-- OpenAI bills the cached start of a prompt (usage_events.cached_input_tokens, part of input_tokens)
-- at a fraction of the input price. OpenAI cost = uncached input × input price + cached input × cached
-- price + output × output price. Default: gpt-5.4-mini's cached price
-- (https://developers.openai.com/api/docs/pricing).

alter table public.billing_settings
  add column if not exists cached_usd_per_m numeric(10, 4) not null default 0.075 check (cached_usd_per_m >= 0);

-- Plan prices for a 35% margin on AI cost (admin panel → Plans).
-- Cost basis: about ₹1.03 per voice minute, the middle between a whole form spoken in one recording
-- (≈ ₹0.81/min) and short recordings (2 × 20 s per form, ≈ ₹1.25/min): Sarvam ₹0.49/min (billed per
-- second) plus OpenAI mapping, which is billed per recording. Price ≈ minutes × ₹1.03 ÷ 0.65.
-- Adds Starter. Running periods keep the minutes they started with (subscriptions.minutes); the new
-- prices apply from each user's next renewal. Whether a plan is on sale (is_active) is left as it is.

insert into public.plans (id, name, price_inr, minutes, days, sort) values
  ('trial', 'Trial', 0, 15, 7, 0),
  ('starter', 'Starter', 99, 60, 30, 1),
  ('basic', 'Basic', 249, 150, 30, 2),
  ('pro', 'Pro', 649, 400, 30, 3),
  ('business', 'Business', 1949, 1200, 30, 4)
on conflict (id) do update
  set name       = excluded.name,
      price_inr  = excluded.price_inr,
      minutes    = excluded.minutes,
      days       = excluded.days,
      sort       = excluded.sort,
      updated_at = now();

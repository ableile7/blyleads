-- ============================================================
-- BlyLeads migration: record what Stripe actually collected per order
-- Run this entire file in the Supabase SQL Editor (live project).
-- Safe: adds one nullable column. No data modified.
-- ============================================================

-- total_amount holds the list price (price_per_lead x quantity). amount_collected
-- will hold what Stripe actually charged (list price + 3% fee - promo discount),
-- so the admin revenue total ties out to Stripe. Backfilled from Stripe by code.
alter table orders add column if not exists amount_collected numeric;

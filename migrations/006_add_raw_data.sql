-- ============================================================
-- BlyLeads migration: raw_data passthrough column
-- Run this entire file in the Supabase SQL Editor (live project).
-- Safe: adds one nullable column. No data modified.
-- ============================================================

-- "Data Leads" is a passthrough product — its uploaded rows are stored here
-- verbatim (the original columns) and delivered to agents exactly as uploaded,
-- instead of being mapped into the fixed insurance schema. Null for all other
-- tiers, which continue to use the fixed columns.
alter table leads add column if not exists raw_data jsonb;

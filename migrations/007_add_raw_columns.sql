-- ============================================================
-- BlyLeads migration: preserve original column order for passthrough tiers
-- Run this entire file in the Supabase SQL Editor (live project).
-- Safe: adds one nullable column. No data modified.
-- ============================================================

-- raw_data is jsonb, which does not preserve key order. Store the original
-- column order here so the Data Leads download reproduces the exact uploaded
-- layout. Null for non-passthrough tiers.
alter table leads add column if not exists raw_columns text[];

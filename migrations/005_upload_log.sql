-- ============================================================
-- BlyLeads migration: upload history log
-- Run this entire file in the Supabase SQL Editor (live project).
-- ============================================================

create table if not exists upload_batches (
  id          uuid primary key default gen_random_uuid(),
  filename    text not null,
  tier        text,
  inserted    integer not null default 0,
  skipped     integer not null default 0,
  uploaded_at timestamptz not null default now()
);

-- Admin-only data. Enable RLS with NO policies so the public/agent (anon) key
-- can't read it; the app accesses this table only via the service-role key,
-- which bypasses RLS.
alter table upload_batches enable row level security;

-- One-time backfill: reconstruct an approximate history from existing leads.
-- Real filenames were never stored before logging existed, so these rows are
-- grouped one-per-tier-per-day with a placeholder filename. Runs only while the
-- table is still empty, so re-running this file won't duplicate it.
insert into upload_batches (filename, tier, inserted, skipped, uploaded_at)
select '(historical import — filename not recorded)', tier, count(*), 0, min(created_at)
from leads
where not exists (select 1 from upload_batches)
group by tier, date_trunc('day', created_at);

select filename, tier, inserted, uploaded_at from upload_batches order by uploaded_at;

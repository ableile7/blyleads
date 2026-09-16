-- 021: index the unsold pool by (tier, state) to cut disk IO on the claim path.
--
-- claim_leads_by_state filters tier + state + is_sold=false, but the only
-- covering index was (tier, id) where is_sold=false — no state. Every claim
-- therefore walked the whole tier's index and heap-fetched each candidate row
-- just to read `state`. With the year tiers merged (019) a single tier is now
-- 82k-100k unsold rows, so that is 82k-100k random heap reads per claim on a
-- t4g.nano whose disk IO budget is already being drawn down.
--
-- Adding state to the index lets the filter be satisfied from the index alone;
-- only the rows actually claimed get heap-fetched. It also makes the
-- availability recounts (count(*) where tier=X and is_sold=false) and
-- /api/states index-only scans.
--
-- NOTE: no begin/commit here. CREATE INDEX CONCURRENTLY cannot run inside a
-- transaction block. Run this file's statements one at a time. CONCURRENTLY
-- keeps the table writable while the index builds (a few minutes on nano).

-- 1. New index. Safe to re-run: if a previous attempt failed it leaves an
--    INVALID index behind, so drop that first.
drop index if exists leads_unsold_tier_state_idx;

create index concurrently if not exists leads_unsold_tier_state_idx
    on leads (tier, state, id)
 where is_sold = false;

-- 2. Retire the old index — (tier, state, id) serves every query the old
--    (tier, id) did, since tier is still the leading column. Dropping it
--    removes an index that has to be maintained on every insert and claim,
--    which is itself write IO.
drop index concurrently if exists leads_unsold_tier_idx;

-- 3. Verify the planner uses it and that it is valid (indisvalid must be true):
--   select indexrelid::regclass, indisvalid
--     from pg_index where indexrelid::regclass::text like 'leads_unsold%';
--
--   explain (analyze, buffers)
--   select id from leads
--    where tier = 'Essential' and state = 'AZ' and is_sold = false
--    limit 100;
--   -- want: Index Only Scan using leads_unsold_tier_state_idx

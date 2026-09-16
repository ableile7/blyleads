-- 020: remove ELG (in-agency) dual pricing entirely.
--
-- BlyLeads now runs a single price list: every approved agent pays the same
-- price_per_lead from the `pricing` table. The service-role-only pricing_elg
-- table (migration 013) and the "Mark ELG" agent tag are no longer used by
-- any code path — dashboard, cart, checkout, and admin Pricing all read the
-- one standard price.
--
-- Safe to run more than once, and safe to run before or after 019.

begin;

-- The second price list is gone. Dropping it also removes the last reason for
-- the service-role-only RLS carve-out that 013 created.
drop table if exists pricing_elg;

-- agents.agency is left in place ON PURPOSE. It is no longer read anywhere,
-- but it still records which agents were tagged in-agency, and dropping a
-- column is not reversible. To clear the tags without losing the column:
--     update agents set agency = null where agency = 'ELG';
-- To remove it completely once you are sure:
--     alter table agents drop column if exists agency;

commit;

-- Verification:
--   select to_regclass('public.pricing_elg');            -- expect NULL
--   select tier, price_per_lead, is_active from pricing order by tier;

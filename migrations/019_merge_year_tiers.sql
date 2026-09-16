-- 019: collapse the Core/Essential year tiers back into flat Core and Essential.
--
-- Reverses the July 14 2026 split (see yearTier() / migration 018). Every
-- year-vintage lead becomes plain 'Core' or 'Essential', the three prices per
-- family become one, and the year-tier pricing rows go away.
--
-- New pricing:  Core $0.60   Essential $0.45
--
-- Scope: leads only. orders.tier is deliberately LEFT ALONE so past invoices
-- still record which vintage each agent actually bought (including the retired
-- 'Core 2023' name). Admin Orders keeps rendering those via its colour maps.
--
-- Safe to run more than once.

begin;

-- 1. Leads -> flat tiers. Includes the retired vintage names: 1,111 sold leads
--    still carry 'Core 2023' from before the 2023-2025 rebucket.
update leads
   set tier = 'Core'
 where tier in ('Core 2018-2020', 'Core 2021-2022', 'Core 2023', 'Core 2023-2025', 'Core 2024-2025');

update leads
   set tier = 'Essential'
 where tier in ('Essential 2018-2020', 'Essential 2021-2022', 'Essential 2023',
                'Essential 2023-2025', 'Essential 2024-2025');

-- 2. Flat pricing, and reactivate the two base tiers (both were is_active=false
--    while the year tiers carried the catalogue).
--    Both rows already exist, so plain updates — avoids any legacy CHECK
--    constraint on pricing.tier rejecting an insert.
update pricing set price_per_lead = 0.60, is_active = true where tier = 'Core';
update pricing set price_per_lead = 0.45, is_active = true where tier = 'Essential';

delete from pricing
 where tier in ('Core 2018-2020', 'Core 2021-2022', 'Core 2023', 'Core 2023-2025', 'Core 2024-2025',
                'Essential 2018-2020', 'Essential 2021-2022', 'Essential 2023',
                'Essential 2023-2025', 'Essential 2024-2025');

-- 3. Exact recount of sellable stock for the two merged tiers.
update pricing p
   set available_count = (
         select count(*) from leads l
          where l.tier = p.tier and l.is_sold = false
       )
 where p.tier in ('Core', 'Essential');

commit;

-- Verification (expect Core 82,330 unsold / Essential 100,022 unsold at the time
-- this was written, and zero rows left on any year tier):
--   select tier, count(*) filter (where not is_sold) as unsold, count(*) as total
--     from leads group by tier order by total desc;
--   select tier, price_per_lead, available_count, is_active from pricing order by tier;

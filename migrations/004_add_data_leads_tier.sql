-- ============================================================
-- BlyLeads migration: add the "Data Leads" tier
-- Run this entire file in the Supabase SQL Editor (live project).
-- ============================================================

-- 1. Allow the new tier value. leads.tier (and orders.tier, if constrained) has
--    a CHECK limiting tiers to the existing five; replace it to include the new
--    one. The DO block drops whatever the constraint is named, so this is safe
--    regardless of the auto-generated constraint name.
do $$
declare c record;
begin
  for c in select conname from pg_constraint
           where conrelid = 'leads'::regclass and contype = 'c'
             and pg_get_constraintdef(oid) ilike '%tier%' loop
    execute format('alter table leads drop constraint %I', c.conname);
  end loop;
  for c in select conname from pg_constraint
           where conrelid = 'orders'::regclass and contype = 'c'
             and pg_get_constraintdef(oid) ilike '%tier%' loop
    execute format('alter table orders drop constraint %I', c.conname);
  end loop;
end $$;

alter table leads  add constraint leads_tier_check
  check (tier in ('Prime', 'Select', 'Premier', 'Core', 'Essential', 'Data Leads'));
alter table orders add constraint orders_tier_check
  check (tier in ('Prime', 'Select', 'Premier', 'Core', 'Essential', 'Data Leads'));

-- 2. Pricing row for the new tier — created INACTIVE with a placeholder price.
--    Set the real price and flip "Active" on in the admin Pricing page; the
--    upload will sync available_count automatically.
insert into pricing (tier, price_per_lead, available_count, is_active)
values ('Data Leads', 1.00, 0, false)
on conflict (tier) do nothing;

-- Verify:
select * from pricing order by tier;

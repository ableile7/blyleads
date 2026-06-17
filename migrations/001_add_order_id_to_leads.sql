-- ============================================================
-- BlyLeads migration: link leads to their order
-- Run this entire file in the Supabase SQL Editor (live project).
-- Safe & reversible: adds a nullable column and only fills NULLs.
-- ============================================================

-- 1. Add the linking column + index (no-op if already present).
alter table leads add column if not exists order_id uuid references orders(id);
create index if not exists leads_order_id_idx on leads(order_id);

-- 2. Backfill existing assigned leads. A sold lead belongs to the most recent
--    PAID order of the same agent + tier created at or before it was sold.
--    (Each fulfillment stamps a whole batch with one sold_at, and orders are
--    fulfilled in creation order, so this matches each batch to its order.)
update leads l
set order_id = (
  select o.id
  from orders o
  where o.agent_id = l.sold_to
    and o.tier      = l.tier
    and o.status    = 'paid'
    and o.created_at <= l.sold_at
  order by o.created_at desc
  limit 1
)
where l.sold_to  is not null
  and l.sold_at  is not null
  and l.order_id is null;

-- 3. Verification (read-only) — review the output:
--    a) how many sold leads ended up linked vs. still unlinked
select
  count(*) filter (where order_id is not null) as linked,
  count(*) filter (where order_id is null and sold_to is not null) as sold_but_unlinked
from leads;

--    b) per paid order: quantity vs. leads actually linked (should match)
select o.created_at, o.tier, o.quantity,
       count(l.id) as linked_leads
from orders o
left join leads l on l.order_id = o.id
where o.status = 'paid'
group by o.id, o.created_at, o.tier, o.quantity
order by o.created_at;

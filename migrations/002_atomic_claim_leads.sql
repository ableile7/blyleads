-- ============================================================
-- BlyLeads migration: atomic lead claiming (prevents double-selling)
-- Run this entire file in the Supabase SQL Editor (live project).
-- Safe: creates a function + index. No data is modified.
-- ============================================================

-- Speeds up the "pick N available leads of a tier" scan.
create index if not exists leads_unsold_tier_idx on leads (tier, id) where is_sold = false;

-- Atomically claim up to p_quantity available leads of a tier (optionally
-- restricted to states) and assign them to an order in ONE transaction.
--
-- FOR UPDATE SKIP LOCKED makes two simultaneous buyers grab disjoint rows -- no
-- lead can be sold twice. If fewer than p_quantity are available, it raises and
-- the whole claim rolls back (no partial fulfillment), so the caller can leave
-- the order pending and retry / fulfil manually once inventory exists.
create or replace function claim_leads(
  p_tier     text,
  p_states   text[],
  p_quantity integer,
  p_agent    uuid,
  p_order    uuid,
  p_sold_at  timestamptz
) returns integer
language plpgsql
as $$
declare
  claimed integer;
begin
  with picked as (
    select id
    from leads
    where tier = p_tier
      and is_sold = false
      and (p_states is null or array_length(p_states, 1) is null or state = any(p_states))
    order by id
    limit p_quantity
    for update skip locked
  )
  update leads l
     set is_sold  = true,
         sold_to  = p_agent,
         sold_at  = p_sold_at,
         order_id = p_order
    from picked
   where l.id = picked.id;

  get diagnostics claimed = row_count;

  if claimed < p_quantity then
    -- Rolls back the update above (nothing gets claimed).
    raise exception 'insufficient_leads: only % of % available', claimed, p_quantity;
  end if;

  return claimed;
end;
$$;

grant execute on function claim_leads(text, text[], integer, uuid, uuid, timestamptz) to service_role;

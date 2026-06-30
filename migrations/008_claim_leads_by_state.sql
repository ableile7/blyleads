-- Per-state fulfillment.
--
-- Problem: claim_leads() pulls the whole order quantity from the combined pool
-- of the selected states "order by id limit N", so whichever state has the
-- lowest-id leads gets drained first and other selected states can be skipped
-- entirely -- even when they have stock. Agents enter a quantity PER STATE, but
-- that breakdown was being thrown away.
--
-- Fix: store the per-state breakdown on the order (state_quantities) and claim
-- each state's exact amount. claim_leads_by_state() does all states in ONE
-- transaction, so if any state is short it raises and the whole claim rolls
-- back (no partial / no double-sell) -- same guarantee as claim_leads().

alter table orders add column if not exists state_quantities jsonb;

create or replace function claim_leads_by_state(
  p_tier             text,
  p_state_quantities jsonb,        -- {"NC": 500, "OH": 500, "GA": 500, "LA": 500}
  p_agent            uuid,
  p_order            uuid,
  p_sold_at          timestamptz
) returns integer
language plpgsql
as $$
declare
  st            text;
  qty           integer;
  state_claimed integer;
  total_claimed integer := 0;
begin
  for st, qty in
    select key, value::integer from jsonb_each_text(p_state_quantities)
  loop
    if qty <= 0 then
      continue;
    end if;

    with picked as (
      select id
      from leads
      where tier = p_tier
        and is_sold = false
        and state = st
      order by id
      limit qty
      for update skip locked
    )
    update leads l
       set is_sold  = true,
           sold_to  = p_agent,
           sold_at  = p_sold_at,
           order_id = p_order
      from picked
     where l.id = picked.id;

    get diagnostics state_claimed = row_count;
    total_claimed := total_claimed + state_claimed;

    -- Short on this state -> abort the whole claim (rolls back every state).
    if state_claimed < qty then
      raise exception 'insufficient_leads: % only % of % available', st, state_claimed, qty;
    end if;
  end loop;

  return total_claimed;
end;
$$;

grant execute on function claim_leads_by_state(text, jsonb, uuid, uuid, timestamptz) to service_role;

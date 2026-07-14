-- ============================================================
-- BlyLeads migration: duplicate copies in the pool, but one agent
-- can never receive the same PERSON twice.
--
-- Why: vendors sometimes sell the same lead twice in one order
-- ("paid 2x" rows). Those extra copies can now be kept in inventory
-- and sold to a DIFFERENT agent. Both claim functions now:
--   1. skip any lead that matches one the agent already owns
--      (same source_lead_id, or same name + primary phone — any tier), and
--   2. never pick two copies of the same person within one claim.
-- Same signatures as before — no app code changes needed.
-- ============================================================

-- Fast "what does this agent already own" probes.
create index if not exists leads_sold_to_idx on leads (sold_to) where is_sold = true;

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
  with candidates as (
    select l.id,
           coalesce(l.source_lead_id, 'row-' || l.id::text) as k_id,
           coalesce(lower(trim(l.contact_name)) || '|' || nullif(trim(l.primary_phone), ''), 'row-' || l.id::text) as k_np
    from leads l
    where l.tier = p_tier
      and l.is_sold = false
      and (p_states is null or array_length(p_states, 1) is null or l.state = any(p_states))
      and not exists (
        select 1 from leads owned
        where owned.sold_to = p_agent
          and (
            (owned.source_lead_id is not null and owned.source_lead_id = l.source_lead_id)
            or (owned.contact_name is not null and owned.primary_phone is not null
                and l.contact_name is not null and l.primary_phone is not null
                and lower(trim(owned.contact_name)) = lower(trim(l.contact_name))
                and trim(owned.primary_phone) = trim(l.primary_phone))
          )
      )
  ),
  uniq as (
    -- one copy per person within this claim (first by id wins)
    select id from (
      select id,
             row_number() over (partition by k_id order by id) as rid,
             row_number() over (partition by k_np order by id) as rnp
      from candidates
    ) t
    where rid = 1 and rnp = 1
    order by id
    limit p_quantity
  ),
  picked as (
    select l.id
    from leads l
    join uniq u on u.id = l.id
    where l.is_sold = false
    order by l.id
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
    raise exception 'insufficient_leads: only % of % available', claimed, p_quantity;
  end if;

  return claimed;
end;
$$;

grant execute on function claim_leads(text, text[], integer, uuid, uuid, timestamptz) to service_role;

create or replace function claim_leads_by_state(
  p_tier             text,
  p_state_quantities jsonb,
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

    -- Rows claimed for earlier states in this loop are already sold_to
    -- p_agent inside this transaction, so the owned-check below also blocks
    -- cross-state copies of the same person within one order.
    with candidates as (
      select l.id,
             coalesce(l.source_lead_id, 'row-' || l.id::text) as k_id,
             coalesce(lower(trim(l.contact_name)) || '|' || nullif(trim(l.primary_phone), ''), 'row-' || l.id::text) as k_np
      from leads l
      where l.tier = p_tier
        and l.is_sold = false
        and l.state = st
        and not exists (
          select 1 from leads owned
          where owned.sold_to = p_agent
            and (
              (owned.source_lead_id is not null and owned.source_lead_id = l.source_lead_id)
              or (owned.contact_name is not null and owned.primary_phone is not null
                  and l.contact_name is not null and l.primary_phone is not null
                  and lower(trim(owned.contact_name)) = lower(trim(l.contact_name))
                  and trim(owned.primary_phone) = trim(l.primary_phone))
            )
        )
    ),
    uniq as (
      select id from (
        select id,
               row_number() over (partition by k_id order by id) as rid,
               row_number() over (partition by k_np order by id) as rnp
        from candidates
      ) t
      where rid = 1 and rnp = 1
      order by id
      limit qty
    ),
    picked as (
      select l.id
      from leads l
      join uniq u on u.id = l.id
      where l.is_sold = false
      order by l.id
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

    if state_claimed < qty then
      raise exception 'insufficient_leads: % only % of % available', st, state_claimed, qty;
    end if;
  end loop;

  return total_claimed;
end;
$$;

grant execute on function claim_leads_by_state(text, jsonb, uuid, uuid, timestamptz) to service_role;

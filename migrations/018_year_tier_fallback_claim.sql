-- ============================================================
-- Small-gap year-tier fallback for claim_leads / claim_leads_by_state.
--
-- Real incidents this fixes: Rodnée's order (8 duplicate-person copies in
-- one TN batch) and Jacob Duran's order (GA Essential 2018-2020 had 343 rows
-- but only 341 unique people, 2 were leftover vendor "paid 2x" duplicates).
-- Both times the exact tier/state combo was a couple of leads short of
-- unique people, and the whole order failed until an admin manually
-- substituted leads from the neighboring year tier.
--
-- Fix: both functions gain an optional p_fallback_tiers text[] (defaults to
-- '{}', so any caller that doesn't pass it keeps the exact old behavior).
-- When a state/pool comes up short by <= 20 leads, the shortfall is filled
-- from the fallback tiers in order before giving up; a bigger shortfall
-- still raises insufficient_leads exactly as before, since that likely
-- means a real inventory problem worth a human looking at rather than
-- something safe to paper over automatically.
-- ============================================================

create or replace function claim_leads(
  p_tier           text,
  p_states         text[],
  p_quantity       integer,
  p_agent          uuid,
  p_order          uuid,
  p_sold_at        timestamptz,
  p_fallback_tiers text[] default '{}'
) returns integer
language plpgsql
as $$
declare
  claimed     integer;
  shortfall   integer;
  fb_tier     text;
  fb_claimed  integer;
  v_tolerance constant integer := 20;
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
        select 1 from leads o1
        where o1.sold_to = p_agent and o1.is_sold = true
          and o1.source_lead_id = l.source_lead_id
      )
      and not exists (
        select 1 from leads o2
        where o2.sold_to = p_agent and o2.is_sold = true
          and lower(trim(o2.contact_name)) = lower(trim(l.contact_name))
          and trim(o2.primary_phone) = trim(l.primary_phone)
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
  shortfall := p_quantity - claimed;

  if shortfall > 0 and shortfall <= v_tolerance and array_length(p_fallback_tiers, 1) > 0 then
    foreach fb_tier in array p_fallback_tiers loop
      exit when shortfall <= 0;

      with candidates as (
        select l.id,
               coalesce(l.source_lead_id, 'row-' || l.id::text) as k_id,
               coalesce(lower(trim(l.contact_name)) || '|' || nullif(trim(l.primary_phone), ''), 'row-' || l.id::text) as k_np
        from leads l
        where l.tier = fb_tier
          and l.is_sold = false
          and (p_states is null or array_length(p_states, 1) is null or l.state = any(p_states))
          and not exists (
            select 1 from leads o1
            where o1.sold_to = p_agent and o1.is_sold = true
              and o1.source_lead_id = l.source_lead_id
          )
          and not exists (
            select 1 from leads o2
            where o2.sold_to = p_agent and o2.is_sold = true
              and lower(trim(o2.contact_name)) = lower(trim(l.contact_name))
              and trim(o2.primary_phone) = trim(l.primary_phone)
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
        limit shortfall
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

      get diagnostics fb_claimed = row_count;
      if fb_claimed > 0 then
        raise notice 'claim_leads: substituted % lead(s) from % (requested tier % short by %)', fb_claimed, fb_tier, p_tier, shortfall;
      end if;
      claimed := claimed + fb_claimed;
      shortfall := shortfall - fb_claimed;
    end loop;
  end if;

  if shortfall > 0 then
    raise exception 'insufficient_leads: only % of % available (incl. fallback tiers)', p_quantity - shortfall, p_quantity;
  end if;

  return claimed;
end;
$$;

grant execute on function claim_leads(text, text[], integer, uuid, uuid, timestamptz, text[]) to service_role;

create or replace function claim_leads_by_state(
  p_tier             text,
  p_state_quantities jsonb,
  p_agent            uuid,
  p_order            uuid,
  p_sold_at          timestamptz,
  p_fallback_tiers   text[] default '{}'
) returns integer
language plpgsql
as $$
declare
  st            text;
  qty           integer;
  state_claimed integer;
  shortfall     integer;
  fb_tier       text;
  fb_claimed    integer;
  total_claimed integer := 0;
  v_tolerance   constant integer := 20;
begin
  for st, qty in
    select key, value::integer from jsonb_each_text(p_state_quantities)
  loop
    if qty <= 0 then
      continue;
    end if;

    with candidates as (
      select l.id,
             coalesce(l.source_lead_id, 'row-' || l.id::text) as k_id,
             coalesce(lower(trim(l.contact_name)) || '|' || nullif(trim(l.primary_phone), ''), 'row-' || l.id::text) as k_np
      from leads l
      where l.tier = p_tier
        and l.is_sold = false
        and l.state = st
        and not exists (
          select 1 from leads o1
          where o1.sold_to = p_agent and o1.is_sold = true
            and o1.source_lead_id = l.source_lead_id
        )
        and not exists (
          select 1 from leads o2
          where o2.sold_to = p_agent and o2.is_sold = true
            and lower(trim(o2.contact_name)) = lower(trim(l.contact_name))
            and trim(o2.primary_phone) = trim(l.primary_phone)
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
    shortfall := qty - state_claimed;

    if shortfall > 0 and shortfall <= v_tolerance and array_length(p_fallback_tiers, 1) > 0 then
      foreach fb_tier in array p_fallback_tiers loop
        exit when shortfall <= 0;

        with candidates as (
          select l.id,
                 coalesce(l.source_lead_id, 'row-' || l.id::text) as k_id,
                 coalesce(lower(trim(l.contact_name)) || '|' || nullif(trim(l.primary_phone), ''), 'row-' || l.id::text) as k_np
          from leads l
          where l.tier = fb_tier
            and l.is_sold = false
            and l.state = st
            and not exists (
              select 1 from leads o1
              where o1.sold_to = p_agent and o1.is_sold = true
                and o1.source_lead_id = l.source_lead_id
            )
            and not exists (
              select 1 from leads o2
              where o2.sold_to = p_agent and o2.is_sold = true
                and lower(trim(o2.contact_name)) = lower(trim(l.contact_name))
                and trim(o2.primary_phone) = trim(l.primary_phone)
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
          limit shortfall
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

        get diagnostics fb_claimed = row_count;
        if fb_claimed > 0 then
          raise notice 'claim_leads_by_state: substituted % lead(s) in % from % (requested tier % short by %)', fb_claimed, st, fb_tier, p_tier, shortfall;
        end if;
        total_claimed := total_claimed + fb_claimed;
        shortfall := shortfall - fb_claimed;
      end loop;
    end if;

    if shortfall > 0 then
      raise exception 'insufficient_leads: % only % of % available (incl. fallback tiers)', st, qty - shortfall, qty;
    end if;
  end loop;

  return total_claimed;
end;
$$;

grant execute on function claim_leads_by_state(text, jsonb, uuid, uuid, timestamptz, text[]) to service_role;

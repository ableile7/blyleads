-- The pricing table is publicly readable (RLS: using(true)), so migration
-- 012's elg_price_per_lead column was visible to any signed-in agent via
-- direct REST. Move ELG prices to their own table with RLS enabled and NO
-- policies: only the service role (server code) can read or write it —
-- outside agents can't even tell in-agency pricing exists.
create table if not exists pricing_elg (
  tier text primary key,
  price_per_lead numeric not null
);
alter table pricing_elg enable row level security;

-- Carry over any ELG prices already set via 012, then drop the leaky column.
-- Guarded so this also runs cleanly if 012 was never applied.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'pricing' and column_name = 'elg_price_per_lead'
  ) then
    insert into pricing_elg (tier, price_per_lead)
      select tier, elg_price_per_lead from pricing where elg_price_per_lead is not null
      on conflict (tier) do update set price_per_lead = excluded.price_per_lead;
    alter table pricing drop column elg_price_per_lead;
  end if;
end $$;

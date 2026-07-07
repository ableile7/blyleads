-- In-agency pricing: agents tagged agency = 'ELG' see/pay elg_price_per_lead
-- on tiers where it's set (null = same as the standard price). The tag lives
-- on the agent so it survives suspend/reinstate cycles.
alter table agents add column if not exists agency text;
alter table pricing add column if not exists elg_price_per_lead numeric;

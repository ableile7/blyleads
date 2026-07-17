-- Free-text payment note on orders, for sales settled off-platform
-- (e.g. "Paid via Zelle"). Shown under the agent's name on the admin
-- Orders tab and included in the CSV export.
alter table orders add column if not exists payment_note text;

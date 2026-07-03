-- Record which promo code (if any) was used on each order, so single-use codes
-- (e.g. COLBY20) can be enforced at checkout and discounts audited later.
alter table orders add column if not exists promo_code text;

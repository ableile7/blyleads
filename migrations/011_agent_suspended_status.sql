-- Temporary agent blocks: 'suspended' keeps the account, orders, and assigned
-- leads intact but removes portal access until the admin reinstates them.
-- (Used to restrict the portal to in-agency agents without rejecting anyone.)
alter table agents drop constraint if exists agents_status_check;
alter table agents add constraint agents_status_check
  check (status in ('pending', 'approved', 'rejected', 'suspended'));

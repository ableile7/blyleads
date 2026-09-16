-- 023: stop letting agents read unsold inventory directly. RUN THIS BEFORE 022.
--
-- The old policy was:
--
--   create policy "leads: approved agents see unsold" on leads
--     for select using (
--       is_sold = false and
--       exists (select 1 from agents where id = auth.uid() and status = 'approved')
--     );
--
-- That let ANY approved agent select EVERY unsold lead, all columns, straight
-- from the public REST API using the browser-shipped anon key plus their own
-- login JWT — name, address, phone, loan amount for the whole catalogue,
-- without buying anything. Paging with a state filter keeps each request under
-- the statement timeout, so the size of the table is not a protection.
--
-- Nothing in the app relies on it. Every legitimate read of `leads` goes
-- through the service role on the server: admin pages, /api/states, /api/
-- checkout availability, fulfillment, and the /api/download workbook builder
-- (which separately verifies download_token + agent_id + status = 'paid').
--
-- Replaced with an owner-scoped policy: an agent may read only the leads
-- already assigned to them. This is also far cheaper to evaluate, since it
-- uses leads_sold_to_idx instead of scanning the unsold pool.
--
-- Safe to run more than once.

begin;

drop policy if exists "leads: approved agents see unsold" on leads;

-- Agents can read only what they already own. Unsold inventory is invisible.
create policy "leads: own leads only" on leads
  for select using (sold_to = auth.uid() and is_sold = true);

commit;

-- Verification — as a signed-in agent (anon key + their JWT), each of these
-- should now return only their own purchased leads, or nothing at all:
--   select * from leads where is_sold = false limit 1;   -- expect 0 rows
--   select count(*) from leads;                          -- expect their own count
--
-- And confirm the portal still works end to end: dashboard tier counts come
-- from `pricing`, state availability from /api/states, and re-downloads from
-- /api/download — all service-role paths, none of them affected by this.

-- 022: new signups get instant portal access — no admin approval step.
--
-- The agents row is created by the handle_new_user() trigger on auth.users,
-- which inserted status 'pending'. It now inserts 'approved', so a new agent
-- can browse and buy as soon as they confirm their email (Supabase auth still
-- gates that part). Nothing else needs to change: middleware, /api/checkout,
-- and the leads RLS policy all already key off status = 'approved'.
--
-- The other statuses stay fully functional and are still set from the admin
-- Agents tab: 'suspended' (temporary block, keeps account + orders),
-- 'rejected' (signs them out on next request), and 'pending' (which now only
-- ever happens if an admin sets it by hand).
--
-- Safe to run more than once.

begin;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.agents (id, email, full_name, status)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    'approved'
  );
  return new;
end;
$$;

-- Approve anyone already sitting in the queue, so nobody is stuck behind a
-- gate that no longer exists. (There were 0 pending accounts when this was
-- written; this is here in case one lands between now and when you run it.)
-- Deliberately does NOT touch 'rejected' or 'suspended' agents.
update agents set status = 'approved' where status = 'pending';

commit;

-- Verification:
--   select status, count(*) from agents group by status;
--   -- then sign up a throwaway account and confirm it lands as 'approved'

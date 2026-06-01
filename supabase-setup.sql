-- ============================================================
-- BlyLeads Database Setup
-- Run this entire file in Supabase SQL Editor
-- ============================================================

-- 1. AGENTS TABLE
create table if not exists agents (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz default now()
);

-- 2. LEADS TABLE
create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  tier text not null check (tier in ('Prime', 'Select', 'Premier')),
  lead_id text not null unique,
  record_date text,
  contact_name text,
  street_address text,
  city text,
  state text,
  zip_code text,
  primary_phone text,
  mobile_phone text,
  loan_amount text,
  coverage_type text,
  financial_institution text,
  is_sold boolean not null default false,
  sold_to uuid references agents(id),
  sold_at timestamptz,
  created_at timestamptz default now()
);

-- 3. ORDERS TABLE
create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references agents(id) on delete cascade,
  tier text not null,
  quantity integer not null,
  price_per_lead numeric not null,
  total_amount numeric not null,
  stripe_session_id text,
  stripe_payment_intent text,
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed')),
  download_token uuid default gen_random_uuid(),
  downloaded_at timestamptz,
  created_at timestamptz default now()
);

-- 4. PRICING TABLE
create table if not exists pricing (
  tier text primary key check (tier in ('Prime', 'Select', 'Premier')),
  price_per_lead numeric not null,
  available_count integer not null default 0,
  is_active boolean not null default true
);

-- Seed default pricing
insert into pricing (tier, price_per_lead, is_active) values
  ('Prime',   0.00, true),
  ('Select',  0.00, true),
  ('Premier', 0.00, true)
on conflict (tier) do nothing;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table agents enable row level security;
alter table leads enable row level security;
alter table orders enable row level security;
alter table pricing enable row level security;

-- AGENTS: users can read/update their own row
create policy "agents: own row" on agents
  for all using (auth.uid() = id);

-- LEADS: approved agents can see unsold leads only
create policy "leads: approved agents see unsold" on leads
  for select using (
    is_sold = false and
    exists (
      select 1 from agents where id = auth.uid() and status = 'approved'
    )
  );

-- ORDERS: agents see only their own orders
create policy "orders: own orders" on orders
  for select using (agent_id = auth.uid());

-- PRICING: anyone can read pricing
create policy "pricing: public read" on pricing
  for select using (true);

-- ============================================================
-- FUNCTION: auto-create agent row on signup
-- ============================================================
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.agents (id, email, full_name, status)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    'pending'
  );
  return new;
end;
$$;

-- Trigger that fires after a new user signs up
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

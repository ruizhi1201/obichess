-- ============================================================
-- Obi-Chess: Billing, Referral & Coach Partnership Schema
-- Paste this in the Supabase SQL Editor and click Run
-- ============================================================

-- 1. Add columns to profiles table
alter table profiles add column if not exists referral_code text unique default substr(md5(random()::text), 1, 8);
alter table profiles add column if not exists referred_by uuid references profiles(id);
alter table profiles add column if not exists pro_trial_until timestamptz;

-- 2. Subscriptions table
create table if not exists subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade unique,
  stripe_customer_id text,
  stripe_subscription_id text,
  plan text default 'free',
  status text default 'active',
  current_period_end timestamptz,
  created_at timestamptz default now()
);

-- 3. Referrals table
create table if not exists referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid references profiles(id),
  referred_id uuid references profiles(id),
  status text default 'pending',
  reward_issued boolean default false,
  created_at timestamptz default now()
);

-- 4. Coach partnerships table
create table if not exists coach_partnerships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) unique,
  tier integer default 0,
  referral_count integer default 0,
  revenue_share_pct numeric default 0,
  free_until timestamptz,
  stripe_connect_id text,
  featured boolean default false,
  created_at timestamptz default now()
);

-- 5. Coach payouts table
create table if not exists coach_payouts (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid references profiles(id),
  amount_cents integer,
  period_start timestamptz,
  period_end timestamptz,
  status text default 'pending',
  stripe_transfer_id text,
  created_at timestamptz default now()
);

-- 6. Enable Row Level Security
alter table subscriptions enable row level security;
alter table referrals enable row level security;
alter table coach_partnerships enable row level security;
alter table coach_payouts enable row level security;

-- 7. RLS Policies
-- Drop if exists first (safe to re-run)
drop policy if exists "Users can view own subscription" on subscriptions;
drop policy if exists "Users can view own referrals" on referrals;
drop policy if exists "Users can view own partnership" on coach_partnerships;
drop policy if exists "Users can view own payouts" on coach_payouts;

create policy "Users can view own subscription" on subscriptions
  for select using (auth.uid() = user_id);

create policy "Users can view own referrals" on referrals
  for select using (auth.uid() = referrer_id);

create policy "Users can view own partnership" on coach_partnerships
  for select using (auth.uid() = user_id);

create policy "Users can view own payouts" on coach_payouts
  for select using (auth.uid() = coach_id);

-- 8. Update handle_new_user trigger to auto-create referral_code + subscriptions row
-- First update the trigger function
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_referral_code text;
  v_referred_by uuid;
begin
  -- Generate unique referral code
  loop
    v_referral_code := substr(md5(random()::text), 1, 8);
    exit when not exists (
      select 1 from profiles where referral_code = v_referral_code
    );
  end loop;

  -- Insert profile
  insert into public.profiles (id, email, display_name, referral_code)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    v_referral_code
  )
  on conflict (id) do update set
    referral_code = coalesce(profiles.referral_code, excluded.referral_code);

  -- Create free subscription row
  insert into public.subscriptions (user_id, plan, status)
  values (new.id, 'free', 'active')
  on conflict (user_id) do nothing;

  return new;
end;
$$;

-- Drop and recreate trigger (safe to re-run)
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

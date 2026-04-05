-- ============================================================
-- Obi-Chess: Referral & Affiliate Program v2
-- Referral: tracks ALL signups (free + paid)
--   3 referrals → 1 month free single membership
--   20 referrals → 1 year free family membership (repeatable every 12 months)
-- Affiliate: tracks paid referrals only, 10% revenue split
-- ============================================================

-- 1. Update referrals table: add columns to differentiate referral types
alter table referrals add column if not exists became_paid boolean default false;
alter table referrals add column if not exists paid_at timestamptz;

-- 2. Add reward tracking to profiles
alter table profiles add column if not exists referral_reward_month_granted_at timestamptz;
alter table profiles add column if not exists referral_reward_year_granted_at timestamptz;
alter table profiles add column if not exists membership_free_until timestamptz;
alter table profiles add column if not exists membership_free_plan text; -- 'single' | 'family'

-- 3. Affiliate program table
create table if not exists affiliates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade unique,
  status text default 'pending', -- 'pending' | 'active' | 'rejected' | 'suspended'
  affiliate_code text unique,
  applied_at timestamptz default now(),
  approved_at timestamptz,
  total_paid_referrals integer default 0,
  total_revenue_cents integer default 0,
  balance_cents integer default 0, -- pending payout balance
  lifetime_paid_cents integer default 0,
  notes text,
  created_at timestamptz default now()
);

-- 4. Affiliate referrals table (paid-only tracking for affiliates)
create table if not exists affiliate_referrals (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid references profiles(id),
  referred_user_id uuid references profiles(id),
  registered_at timestamptz default now(),
  became_paid_at timestamptz,
  is_paid boolean default false,
  monthly_amount_cents integer default 0,
  created_at timestamptz default now()
);

-- 5. Affiliate earnings log
create table if not exists affiliate_earnings (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid references profiles(id),
  referred_user_id uuid references profiles(id),
  invoice_amount_cents integer,
  commission_cents integer, -- 10% of invoice
  period_month text, -- e.g. '2026-04'
  stripe_invoice_id text,
  status text default 'pending', -- 'pending' | 'paid'
  created_at timestamptz default now()
);

-- 6. Affiliate payouts table
create table if not exists affiliate_payouts (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid references profiles(id),
  amount_cents integer,
  requested_at timestamptz,
  processed_at timestamptz,
  status text default 'pending', -- 'pending' | 'processing' | 'paid' | 'failed'
  stripe_transfer_id text,
  notes text,
  created_at timestamptz default now()
);

-- 7. Enable RLS
alter table affiliates enable row level security;
alter table affiliate_referrals enable row level security;
alter table affiliate_earnings enable row level security;
alter table affiliate_payouts enable row level security;

-- 8. RLS Policies
drop policy if exists "Users can view own affiliate record" on affiliates;
drop policy if exists "Users can view own affiliate referrals" on affiliate_referrals;
drop policy if exists "Users can view own affiliate earnings" on affiliate_earnings;
drop policy if exists "Users can view own affiliate payouts" on affiliate_payouts;

create policy "Users can view own affiliate record" on affiliates
  for select using (auth.uid() = user_id);

create policy "Users can view own affiliate referrals" on affiliate_referrals
  for select using (auth.uid() = affiliate_id);

create policy "Users can view own affiliate earnings" on affiliate_earnings
  for select using (auth.uid() = affiliate_id);

create policy "Users can view own affiliate payouts" on affiliate_payouts
  for select using (auth.uid() = affiliate_id);

-- 9. Helper RPC functions for atomic increments
create or replace function increment_affiliate_balance(
  p_affiliate_user_id uuid,
  p_commission_cents integer,
  p_invoice_cents integer
)
returns void
language plpgsql
security definer
as $$
begin
  update affiliates
  set
    balance_cents = balance_cents + p_commission_cents,
    total_revenue_cents = total_revenue_cents + p_invoice_cents,
    lifetime_paid_cents = lifetime_paid_cents + p_commission_cents
  where user_id = p_affiliate_user_id;
end;
$$;

create or replace function increment_affiliate_paid_count(
  p_affiliate_user_id uuid
)
returns void
language plpgsql
security definer
as $$
begin
  update affiliates
  set total_paid_referrals = total_paid_referrals + 1
  where user_id = p_affiliate_user_id;
end;
$$;

-- 10. Index for performance
create index if not exists idx_affiliate_referrals_affiliate_id on affiliate_referrals(affiliate_id);
create index if not exists idx_affiliate_earnings_affiliate_id on affiliate_earnings(affiliate_id);
create index if not exists idx_referrals_referrer_id on referrals(referrer_id);
create index if not exists idx_referrals_referred_id on referrals(referred_id);

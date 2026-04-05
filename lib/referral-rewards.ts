/**
 * Referral reward logic for Obi-Chess
 *
 * Milestones (based on total registered referrals — free + paid):
 *   3 referrals  → 1 month free single membership
 *   20 referrals → 1 year free family membership (repeatable every 12 months)
 *
 * Affiliate rewards are handled separately (10% of referred paid users' payments)
 */

import { createServiceClient } from '@/lib/supabase';

type SupabaseClient = ReturnType<typeof createServiceClient>;

export async function checkAndGrantReferralRewards(
  supabase: SupabaseClient,
  referrerId: string
): Promise<void> {
  // Count ALL referrals (registered + completed) — both free and paid count
  const { count: totalCount } = await supabase
    .from('referrals')
    .select('id', { count: 'exact' })
    .eq('referrer_id', referrerId)
    .in('status', ['registered', 'completed']);

  const total = totalCount || 0;

  // Get referrer's current reward state
  const { data: profile } = await supabase
    .from('profiles')
    .select('referral_reward_month_granted_at, referral_reward_year_granted_at, membership_free_until, membership_free_plan')
    .eq('id', referrerId)
    .single();

  if (!profile) return;

  const now = new Date();

  // Milestone 1: 3 referrals → 1 month free single membership (one-time)
  if (total >= 3 && !profile.referral_reward_month_granted_at) {
    const freeUntil = new Date(
      profile.membership_free_until && new Date(profile.membership_free_until) > now
        ? profile.membership_free_until
        : now.toISOString()
    );
    freeUntil.setMonth(freeUntil.getMonth() + 1);

    await supabase
      .from('profiles')
      .update({
        referral_reward_month_granted_at: now.toISOString(),
        membership_free_until: freeUntil.toISOString(),
        membership_free_plan: 'single',
      })
      .eq('id', referrerId);

    // Ensure subscription reflects free access
    await supabase.from('subscriptions').upsert({
      user_id: referrerId,
      plan: 'pro',
      status: 'active',
      current_period_end: freeUntil.toISOString(),
    }, { onConflict: 'user_id' });
  }

  // Milestone 2: 20 referrals → 1 year free family membership (repeatable every 12 months)
  if (total >= 20) {
    const lastYearGrant = profile.referral_reward_year_granted_at
      ? new Date(profile.referral_reward_year_granted_at)
      : null;

    // Repeatable: can grant again if last grant was > 12 months ago
    const canGrantYear = !lastYearGrant || 
      (now.getTime() - lastYearGrant.getTime()) >= 365 * 24 * 60 * 60 * 1000;

    if (canGrantYear) {
      const currentFreeUntil = profile.membership_free_until && new Date(profile.membership_free_until) > now
        ? new Date(profile.membership_free_until)
        : now;

      const freeUntil = new Date(currentFreeUntil);
      freeUntil.setFullYear(freeUntil.getFullYear() + 1);

      await supabase
        .from('profiles')
        .update({
          referral_reward_year_granted_at: now.toISOString(),
          membership_free_until: freeUntil.toISOString(),
          membership_free_plan: 'family',
        })
        .eq('id', referrerId);

      // Ensure subscription reflects family plan
      await supabase.from('subscriptions').upsert({
        user_id: referrerId,
        plan: 'family',
        status: 'active',
        current_period_end: freeUntil.toISOString(),
      }, { onConflict: 'user_id' });
    }
  }
}

export async function handleAffiliatePayment(
  supabase: SupabaseClient,
  referredUserId: string,
  invoiceAmountCents: number,
  stripeInvoiceId: string
): Promise<void> {
  const COMMISSION_RATE = 0.10; // 10%

  // Find if this user was referred by an active affiliate
  const { data: affiliateRef } = await supabase
    .from('affiliate_referrals')
    .select('affiliate_id, is_paid')
    .eq('referred_user_id', referredUserId)
    .single();

  if (!affiliateRef) return;

  // Verify affiliate is still active
  const { data: affiliate } = await supabase
    .from('affiliates')
    .select('id, status')
    .eq('user_id', affiliateRef.affiliate_id)
    .single();

  if (!affiliate || affiliate.status !== 'active') return;

  const commissionCents = Math.round(invoiceAmountCents * COMMISSION_RATE);
  const periodMonth = new Date().toISOString().slice(0, 7); // 'YYYY-MM'

  // Check if earnings already logged for this invoice
  const { data: existingEarning } = await supabase
    .from('affiliate_earnings')
    .select('id')
    .eq('stripe_invoice_id', stripeInvoiceId)
    .single();

  if (existingEarning) return; // Already processed

  // Log earning
  await supabase.from('affiliate_earnings').insert({
    affiliate_id: affiliateRef.affiliate_id,
    referred_user_id: referredUserId,
    invoice_amount_cents: invoiceAmountCents,
    commission_cents: commissionCents,
    period_month: periodMonth,
    stripe_invoice_id: stripeInvoiceId,
    status: 'pending',
  });

  // Update affiliate balance and totals
  await supabase.rpc('increment_affiliate_balance', {
    p_affiliate_user_id: affiliateRef.affiliate_id,
    p_commission_cents: commissionCents,
    p_invoice_cents: invoiceAmountCents,
  });

  // Mark as paid if first payment
  if (!affiliateRef.is_paid) {
    await supabase
      .from('affiliate_referrals')
      .update({
        is_paid: true,
        became_paid_at: new Date().toISOString(),
        monthly_amount_cents: invoiceAmountCents,
      })
      .eq('referred_user_id', referredUserId)
      .eq('affiliate_id', affiliateRef.affiliate_id);

    // Increment paid referral count
    await supabase.rpc('increment_affiliate_paid_count', {
      p_affiliate_user_id: affiliateRef.affiliate_id,
    });
  }

  // Also mark the main referral as 'completed' if it wasn't
  await supabase
    .from('referrals')
    .update({ status: 'completed', became_paid: true, paid_at: new Date().toISOString() })
    .eq('referred_id', referredUserId)
    .eq('referrer_id', affiliateRef.affiliate_id)
    .neq('status', 'completed');
}

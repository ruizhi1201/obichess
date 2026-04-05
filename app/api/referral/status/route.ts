import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  try {
    const supabase = createServiceClient();

    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Get profile with referral code and reward state
    const { data: profile } = await supabase
      .from('profiles')
      .select('referral_code, membership_free_until, membership_free_plan, referral_reward_month_granted_at, referral_reward_year_granted_at')
      .eq('id', user.id)
      .single();

    // Get all referrals (registered + completed — both count toward milestones)
    const { data: referrals } = await supabase
      .from('referrals')
      .select('id, status, became_paid, reward_issued, created_at')
      .eq('referrer_id', user.id);

    const totalReferrals = referrals?.length || 0;
    const paidReferrals = referrals?.filter(r => r.became_paid).length || 0;
    const freeReferrals = totalReferrals - paidReferrals;

    // Milestone progress:
    // 3 total → 1 month free single (one-time)
    // 20 total → 1 year free family (repeatable every 12 months)
    let nextMilestone: number | null = null;
    let nextReward: string | null = null;

    if (totalReferrals < 3) {
      nextMilestone = 3;
      nextReward = '1 month free single membership';
    } else if (totalReferrals < 20) {
      nextMilestone = 20;
      nextReward = '1 year free family membership';
    } else {
      // Already at 20+ — check if repeatable year reward is available
      const lastYearGrant = profile?.referral_reward_year_granted_at
        ? new Date(profile.referral_reward_year_granted_at)
        : null;
      const now = new Date();
      const canGrantYear = !lastYearGrant ||
        (now.getTime() - lastYearGrant.getTime()) >= 365 * 24 * 60 * 60 * 1000;

      if (!canGrantYear && lastYearGrant) {
        const nextEligible = new Date(lastYearGrant);
        nextEligible.setFullYear(nextEligible.getFullYear() + 1);
        nextMilestone = null;
        nextReward = `Next family year renewal: ${nextEligible.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`;
      }
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://obichess.com';
    const referralLink = profile?.referral_code
      ? `${appUrl}/signup?ref=${profile.referral_code}`
      : null;

    // Check milestone states
    const monthMilestoneGranted = !!profile?.referral_reward_month_granted_at;
    const yearMilestoneGranted = !!profile?.referral_reward_year_granted_at;

    return NextResponse.json({
      referralCode: profile?.referral_code,
      referralLink,
      totalReferrals,
      paidReferrals,
      freeReferrals,
      membershipFreeUntil: profile?.membership_free_until,
      membershipFreePlan: profile?.membership_free_plan,
      monthMilestoneGranted,
      yearMilestoneGranted,
      lastYearGrantedAt: profile?.referral_reward_year_granted_at,
      nextMilestone,
      nextReward,
    });
  } catch (err) {
    console.error('Referral status error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

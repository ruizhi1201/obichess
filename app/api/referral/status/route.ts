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

    // Get profile with referral code
    const { data: profile } = await supabase
      .from('profiles')
      .select('referral_code, pro_trial_until')
      .eq('id', user.id)
      .single();

    // Get all referrals
    const { data: referrals, count } = await supabase
      .from('referrals')
      .select('id, status, reward_issued, created_at', { count: 'exact' })
      .eq('referrer_id', user.id);

    const completedCount = referrals?.filter(r => r.status === 'completed').length || 0;
    const pendingCount = referrals?.filter(r => r.status === 'pending').length || 0;

    // Determine next reward milestone
    let nextMilestone = null;
    let nextReward = null;
    if (completedCount < 3) {
      nextMilestone = 3;
      nextReward = '+14 days Pro free';
    } else if (completedCount < 10) {
      nextMilestone = 10;
      nextReward = '+60 days Pro free';
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://obichess.com';
    const referralLink = profile?.referral_code
      ? `${appUrl}/signup?ref=${profile.referral_code}`
      : null;

    return NextResponse.json({
      referralCode: profile?.referral_code,
      referralLink,
      totalReferrals: count || 0,
      completedReferrals: completedCount,
      pendingReferrals: pendingCount,
      proTrialUntil: profile?.pro_trial_until,
      nextMilestone,
      nextReward,
    });
  } catch (err) {
    console.error('Referral status error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

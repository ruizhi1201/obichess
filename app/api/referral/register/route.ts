import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAndGrantReferralRewards } from '@/lib/referral-rewards';

export async function POST(req: NextRequest) {
  try {
    const { refCode } = await req.json();

    if (!refCode) {
      return NextResponse.json({ error: 'Missing ref code' }, { status: 400 });
    }

    const supabase = createServiceClient();

    // Get current user
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Find referrer by code (check both referral_code on profiles and affiliate_code on affiliates)
    const { data: referrer } = await supabase
      .from('profiles')
      .select('id')
      .eq('referral_code', refCode)
      .single();

    // Also check affiliate_code
    let referrerId: string | null = referrer?.id || null;
    let isAffiliateLink = false;

    if (!referrerId) {
      const { data: affiliate } = await supabase
        .from('affiliates')
        .select('user_id, status')
        .eq('affiliate_code', refCode)
        .single();

      if (affiliate && affiliate.status === 'active') {
        referrerId = affiliate.user_id;
        isAffiliateLink = true;
      }
    }

    if (!referrerId) {
      return NextResponse.json({ error: 'Invalid referral code' }, { status: 404 });
    }

    if (referrerId === user.id) {
      return NextResponse.json({ error: 'Cannot refer yourself' }, { status: 400 });
    }

    // Check if already referred
    const { data: existingReferral } = await supabase
      .from('referrals')
      .select('id')
      .eq('referred_id', user.id)
      .single();

    if (existingReferral) {
      return NextResponse.json({ message: 'Already processed' });
    }

    // Create referral record — status 'registered' since this is a free signup
    await supabase.from('referrals').insert({
      referrer_id: referrerId,
      referred_id: user.id,
      status: 'registered', // all signups count; 'completed' = became paid
      reward_issued: false,
    });

    // If via affiliate link, also record in affiliate_referrals
    if (isAffiliateLink) {
      await supabase.from('affiliate_referrals').insert({
        affiliate_id: referrerId,
        referred_user_id: user.id,
        is_paid: false,
      });
    }

    // Store who referred them
    await supabase
      .from('profiles')
      .update({ referred_by: referrerId })
      .eq('id', user.id);

    // Check and grant referral rewards to referrer based on total signups
    await checkAndGrantReferralRewards(supabase, referrerId);

    return NextResponse.json({
      success: true,
      message: 'Referral registered!',
    });
  } catch (err) {
    console.error('Referral register error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

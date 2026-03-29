import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';

const TIER1_THRESHOLD = 5;
const TIER2_THRESHOLD = 20;

export async function POST(req: NextRequest) {
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

    // Count completed referrals
    const { count: completedCount } = await supabase
      .from('referrals')
      .select('id', { count: 'exact' })
      .eq('referrer_id', user.id)
      .eq('status', 'completed');

    const referralCount = completedCount || 0;

    if (referralCount < TIER1_THRESHOLD) {
      return NextResponse.json({
        eligible: false,
        message: `You need at least ${TIER1_THRESHOLD} completed referrals. You have ${referralCount}.`,
        referralCount,
        required: TIER1_THRESHOLD,
      });
    }

    // Determine tier
    const tier = referralCount >= TIER2_THRESHOLD ? 2 : 1;
    const revenueSharePct = tier === 2 ? 15 : 5;
    const freeYears = tier === 2 ? 3 : 1;
    const freeUntil = new Date();
    freeUntil.setFullYear(freeUntil.getFullYear() + freeYears);

    // Upsert coach partnership
    const { data: existing } = await supabase
      .from('coach_partnerships')
      .select('id, tier')
      .eq('user_id', user.id)
      .single();

    await supabase.from('coach_partnerships').upsert({
      user_id: user.id,
      tier,
      referral_count: referralCount,
      revenue_share_pct: revenueSharePct,
      free_until: freeUntil.toISOString(),
      featured: tier === 2,
    }, { onConflict: 'user_id' });

    // Update their subscription to free (coach gets free access)
    await supabase.from('subscriptions').upsert({
      user_id: user.id,
      plan: 'pro',
      status: 'active',
      current_period_end: freeUntil.toISOString(),
    }, { onConflict: 'user_id' });

    const wasUpgraded = existing && existing.tier < tier;

    return NextResponse.json({
      eligible: true,
      tier,
      revenueSharePct,
      freeUntil: freeUntil.toISOString(),
      featured: tier === 2,
      referralCount,
      message: wasUpgraded
        ? `Upgraded to Tier ${tier} coach! ${revenueSharePct}% revenue share.`
        : `Welcome to the Coach Partnership Program! You're Tier ${tier} with ${revenueSharePct}% revenue share.`,
    });
  } catch (err) {
    console.error('Coach apply error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';

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

    // Find referrer by code
    const { data: referrer } = await supabase
      .from('profiles')
      .select('id')
      .eq('referral_code', refCode)
      .single();

    if (!referrer) {
      return NextResponse.json({ error: 'Invalid referral code' }, { status: 404 });
    }

    if (referrer.id === user.id) {
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

    // Create referral record
    await supabase.from('referrals').insert({
      referrer_id: referrer.id,
      referred_id: user.id,
      status: 'pending',
    });

    // Give referred user 14-day Pro trial
    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + 14);

    await supabase
      .from('profiles')
      .update({
        referred_by: referrer.id,
        pro_trial_until: trialEnd.toISOString(),
      })
      .eq('id', user.id);

    // Update subscription record to reflect trial
    await supabase
      .from('subscriptions')
      .upsert({
        user_id: user.id,
        plan: 'pro',
        status: 'trialing',
        current_period_end: trialEnd.toISOString(),
      }, { onConflict: 'user_id' });

    return NextResponse.json({
      success: true,
      trialEnd: trialEnd.toISOString(),
      message: '14-day Pro trial activated!',
    });
  } catch (err) {
    console.error('Referral register error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

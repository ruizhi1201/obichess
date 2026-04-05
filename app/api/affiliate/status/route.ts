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

    // Get affiliate record
    const { data: affiliate } = await supabase
      .from('affiliates')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (!affiliate) {
      return NextResponse.json({ isAffiliate: false });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://obichess.com';
    const affiliateLink = `${appUrl}/signup?ref=${affiliate.affiliate_code}`;

    return NextResponse.json({
      isAffiliate: true,
      status: affiliate.status,
      affiliateCode: affiliate.affiliate_code,
      affiliateLink,
      totalPaidReferrals: affiliate.total_paid_referrals,
      totalRevenueCents: affiliate.total_revenue_cents,
      balanceCents: affiliate.balance_cents,
      lifetimePaidCents: affiliate.lifetime_paid_cents,
      appliedAt: affiliate.applied_at,
      approvedAt: affiliate.approved_at,
    });
  } catch (err) {
    console.error('Affiliate status error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

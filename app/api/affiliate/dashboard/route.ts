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

    if (!affiliate || affiliate.status !== 'active') {
      return NextResponse.json({ error: 'Not an active affiliate' }, { status: 403 });
    }

    // Get all affiliate referrals
    const { data: referrals } = await supabase
      .from('affiliate_referrals')
      .select('referred_user_id, is_paid, became_paid_at, registered_at, monthly_amount_cents')
      .eq('affiliate_id', user.id)
      .order('registered_at', { ascending: false });

    // Get recent earnings (last 6 months)
    const { data: earnings } = await supabase
      .from('affiliate_earnings')
      .select('commission_cents, invoice_amount_cents, period_month, status, created_at')
      .eq('affiliate_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);

    // Get payouts history
    const { data: payouts } = await supabase
      .from('affiliate_payouts')
      .select('amount_cents, status, requested_at, processed_at, created_at')
      .eq('affiliate_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20);

    // Compute monthly earnings summary
    const earningsByMonth: Record<string, number> = {};
    for (const e of earnings || []) {
      earningsByMonth[e.period_month] = (earningsByMonth[e.period_month] || 0) + e.commission_cents;
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://obichess.com';
    const affiliateLink = `${appUrl}/signup?ref=${affiliate.affiliate_code}`;

    const totalRegistered = referrals?.length || 0;
    const totalPaid = referrals?.filter(r => r.is_paid).length || 0;

    return NextResponse.json({
      affiliate: {
        code: affiliate.affiliate_code,
        link: affiliateLink,
        status: affiliate.status,
        appliedAt: affiliate.applied_at,
        approvedAt: affiliate.approved_at,
      },
      stats: {
        totalRegistered,
        totalPaid,
        balanceCents: affiliate.balance_cents,
        lifetimePaidCents: affiliate.lifetime_paid_cents,
        totalRevenueCents: affiliate.total_revenue_cents,
        commissionRate: 10, // percent
      },
      referrals: (referrals || []).map(r => ({
        registeredAt: r.registered_at,
        isPaid: r.is_paid,
        becamePaidAt: r.became_paid_at,
        monthlyAmountCents: r.monthly_amount_cents,
      })),
      earningsByMonth,
      recentEarnings: (earnings || []).slice(0, 10).map(e => ({
        month: e.period_month,
        commissionCents: e.commission_cents,
        invoiceAmountCents: e.invoice_amount_cents,
        status: e.status,
        date: e.created_at,
      })),
      payouts: (payouts || []).map(p => ({
        amountCents: p.amount_cents,
        status: p.status,
        requestedAt: p.requested_at,
        processedAt: p.processed_at,
      })),
    });
  } catch (err) {
    console.error('Affiliate dashboard error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

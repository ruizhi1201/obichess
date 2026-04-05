import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';

function generateAffiliateCode(email: string): string {
  // Generate a readable code from email prefix + random suffix
  const prefix = email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8);
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${prefix}-${suffix}`;
}

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

    // Check if already applied
    const { data: existing } = await supabase
      .from('affiliates')
      .select('id, status, affiliate_code')
      .eq('user_id', user.id)
      .single();

    if (existing) {
      return NextResponse.json({
        success: false,
        alreadyApplied: true,
        status: existing.status,
        affiliateCode: existing.affiliate_code,
        message: existing.status === 'active'
          ? 'You are already an active affiliate.'
          : existing.status === 'pending'
            ? 'Your application is pending review.'
            : `Your affiliate status is: ${existing.status}`,
      });
    }

    // Generate unique affiliate code
    let affiliateCode = generateAffiliateCode(user.email || user.id);
    let attempts = 0;
    while (attempts < 5) {
      const { data: codeCheck } = await supabase
        .from('affiliates')
        .select('id')
        .eq('affiliate_code', affiliateCode)
        .single();
      if (!codeCheck) break;
      affiliateCode = generateAffiliateCode(user.email || user.id);
      attempts++;
    }

    // Create affiliate application
    // Auto-approve for now (can add manual review step later)
    const { data: newAffiliate, error: insertError } = await supabase
      .from('affiliates')
      .insert({
        user_id: user.id,
        affiliate_code: affiliateCode,
        status: 'active', // Auto-approve; change to 'pending' for manual review
        applied_at: new Date().toISOString(),
        approved_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError || !newAffiliate) {
      console.error('Affiliate insert error:', insertError);
      return NextResponse.json({ error: 'Failed to create affiliate account' }, { status: 500 });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://obichess.com';
    const affiliateLink = `${appUrl}/signup?ref=${affiliateCode}`;

    return NextResponse.json({
      success: true,
      status: 'active',
      affiliateCode,
      affiliateLink,
      message: 'Welcome to the Obi-Chess Affiliate Program! Share your link and earn 10% of every referred paid subscriber\'s monthly payment.',
    });
  } catch (err) {
    console.error('Affiliate apply error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

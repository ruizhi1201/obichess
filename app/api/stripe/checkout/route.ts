import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createServiceClient } from '@/lib/supabase';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2026-03-25.dahlia' });

export async function POST(req: NextRequest) {
  try {
    const { plan, promoCode } = await req.json();

    if (!plan || !['pro', 'family'].includes(plan)) {
      return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
    }

    const supabase = createServiceClient();

    // Get the authenticated user from Supabase auth header
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Get or create Stripe customer
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .single();

    let customerId = subscription?.stripe_customer_id;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { supabase_user_id: user.id },
      });
      customerId = customer.id;

      await supabase
        .from('subscriptions')
        .upsert({ user_id: user.id, stripe_customer_id: customerId });
    }

    const priceId = plan === 'pro'
      ? process.env.STRIPE_PRO_PRICE_ID!
      : process.env.STRIPE_FAMILY_PRICE_ID!;

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://obichess.com';

    // Resolve promo code to a Stripe promotion code ID if provided
    let discounts: { promotion_code: string }[] | undefined;
    if (promoCode) {
      const promoCodes = await stripe.promotionCodes.list({ code: promoCode, active: true, limit: 1 });
      if (promoCodes.data.length > 0) {
        discounts = [{ promotion_code: promoCodes.data[0].id }];
      } else {
        return NextResponse.json({ error: 'Invalid or expired promo code' }, { status: 400 });
      }
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appUrl}/dashboard?upgraded=1`,
      cancel_url: `${appUrl}/pricing`,
      metadata: { user_id: user.id, plan },
      // If no promo code entered manually, allow user to enter one at checkout
      allow_promotion_codes: !discounts,
      ...(discounts ? { discounts } : {}),
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error('Checkout error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

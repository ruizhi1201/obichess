import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createServiceClient } from '@/lib/supabase';
import { checkAndGrantReferralRewards, handleAffiliatePayment } from '@/lib/referral-rewards';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2026-03-25.dahlia' });
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

// Helper: get period end from subscription item
function getSubPeriodEnd(sub: Stripe.Subscription): string | null {
  const item = sub.items?.data?.[0];
  if (item && 'current_period_end' in item) {
    return new Date((item as Stripe.SubscriptionItem & { current_period_end: number }).current_period_end * 1000).toISOString();
  }
  if (sub.cancel_at) return new Date(sub.cancel_at * 1000).toISOString();
  return null;
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get('stripe-signature');

  if (!sig) {
    return NextResponse.json({ error: 'No signature' }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook signature error:', err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  const supabase = createServiceClient();

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.user_id;
        const plan = session.metadata?.plan;

        if (!userId || !plan) break;

        const sub = await stripe.subscriptions.retrieve(session.subscription as string);

        await supabase.from('subscriptions').upsert({
          user_id: userId,
          stripe_customer_id: session.customer as string,
          stripe_subscription_id: sub.id,
          plan,
          status: sub.status,
          current_period_end: getSubPeriodEnd(sub),
        }, { onConflict: 'user_id' });

        // Mark referral as completed (became paid) and check milestone rewards
        await handlePaidConversion(supabase, userId);
        break;
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = sub.customer as string;

        const { data: existingSub } = await supabase
          .from('subscriptions')
          .select('user_id')
          .eq('stripe_customer_id', customerId)
          .single();

        if (!existingSub) break;

        const priceId = sub.items.data[0]?.price.id;
        let plan = 'free';
        if (priceId === process.env.STRIPE_PRO_PRICE_ID) plan = 'pro';
        else if (priceId === process.env.STRIPE_FAMILY_PRICE_ID) plan = 'family';

        await supabase
          .from('subscriptions')
          .update({
            plan: sub.status === 'active' ? plan : 'free',
            status: sub.status,
            stripe_subscription_id: sub.id,
            current_period_end: getSubPeriodEnd(sub),
          })
          .eq('user_id', existingSub.user_id);
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = sub.customer as string;

        await supabase
          .from('subscriptions')
          .update({ plan: 'free', status: 'canceled' })
          .eq('stripe_customer_id', customerId);
        break;
      }

      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;
        const subId = (invoice as Stripe.Invoice & { subscription?: string }).subscription;

        if (!subId) break;

        const sub = await stripe.subscriptions.retrieve(subId);
        const priceId = sub.items.data[0]?.price.id;
        let plan = 'free';
        if (priceId === process.env.STRIPE_PRO_PRICE_ID) plan = 'pro';
        else if (priceId === process.env.STRIPE_FAMILY_PRICE_ID) plan = 'family';

        // Update subscription record
        await supabase
          .from('subscriptions')
          .update({
            plan,
            status: 'active',
            current_period_end: getSubPeriodEnd(sub),
          })
          .eq('stripe_customer_id', customerId);

        // Get user_id for affiliate commission
        const { data: subRecord } = await supabase
          .from('subscriptions')
          .select('user_id')
          .eq('stripe_customer_id', customerId)
          .single();

        if (subRecord && invoice.amount_paid > 0) {
          // Handle affiliate commission (10% to affiliate who referred this user)
          await handleAffiliatePayment(
            supabase,
            subRecord.user_id,
            invoice.amount_paid,
            invoice.id
          );
        }
        break;
      }
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error('Webhook handler error:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }
}

/**
 * When a referred user makes their first payment:
 * - Mark their referral status as 'completed'
 * - Re-check referrer's milestone rewards (all signups still count, but paid ones also trigger)
 */
async function handlePaidConversion(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string
) {
  // Find the referral for this user
  const { data: referral } = await supabase
    .from('referrals')
    .select('id, referrer_id, status')
    .eq('referred_id', userId)
    .single();

  if (!referral) return;

  // Update to completed if not already
  if (referral.status !== 'completed') {
    await supabase
      .from('referrals')
      .update({
        status: 'completed',
        became_paid: true,
        paid_at: new Date().toISOString(),
      })
      .eq('id', referral.id);
  }

  // Re-check rewards (same milestone logic applies — total count is what matters)
  await checkAndGrantReferralRewards(supabase, referral.referrer_id);
}

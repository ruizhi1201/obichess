import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createServiceClient } from '@/lib/supabase';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2026-03-25.dahlia' });
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

// Helper: get period end from subscription (in new Stripe API, it's on the item)
function getSubPeriodEnd(sub: Stripe.Subscription): string | null {
  const item = sub.items?.data?.[0];
  if (item && 'current_period_end' in item) {
    return new Date((item as Stripe.SubscriptionItem & { current_period_end: number }).current_period_end * 1000).toISOString();
  }
  // fallback: use cancel_at or null
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

        // Handle referral reward when new paid subscriber
        await handleReferralConversion(supabase, userId, plan);
        break;
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = sub.customer as string;

        // Look up user by customer ID
        const { data: existingSub } = await supabase
          .from('subscriptions')
          .select('user_id')
          .eq('stripe_customer_id', customerId)
          .single();

        if (!existingSub) break;

        // Determine plan from price
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

        await supabase
          .from('subscriptions')
          .update({
            plan,
            status: 'active',
            current_period_end: getSubPeriodEnd(sub),
          })
          .eq('stripe_customer_id', customerId);

        // Log coach payout if applicable
        const { data: subRecord } = await supabase
          .from('subscriptions')
          .select('user_id')
          .eq('stripe_customer_id', customerId)
          .single();

        if (subRecord) {
          await logCoachPayout(supabase, subRecord.user_id, invoice.amount_paid);
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

async function handleReferralConversion(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
  _plan: string
) {
  // Find if this user was referred
  const { data: referral } = await supabase
    .from('referrals')
    .select('id, referrer_id')
    .eq('referred_id', userId)
    .eq('status', 'pending')
    .single();

  if (!referral) return;

  // Mark referral as completed
  await supabase
    .from('referrals')
    .update({ status: 'completed' })
    .eq('id', referral.id);

  // Count referrer's total completed referrals
  const { count } = await supabase
    .from('referrals')
    .select('id', { count: 'exact' })
    .eq('referrer_id', referral.referrer_id)
    .eq('status', 'completed');

  const totalReferrals = count || 0;

  // Get referrer's current pro_trial_until
  const { data: referrerProfile } = await supabase
    .from('profiles')
    .select('pro_trial_until')
    .eq('id', referral.referrer_id)
    .single();

  const now = new Date();
  const baseDate = referrerProfile?.pro_trial_until && new Date(referrerProfile.pro_trial_until) > now
    ? new Date(referrerProfile.pro_trial_until)
    : now;

  // Award milestones: 3 referrals = +14 days, 10 = +60 days
  let daysToAdd = 0;
  if (totalReferrals === 3) daysToAdd = 14;
  else if (totalReferrals === 10) daysToAdd = 60;

  if (daysToAdd > 0) {
    const newTrialEnd = new Date(baseDate);
    newTrialEnd.setDate(newTrialEnd.getDate() + daysToAdd);

    await supabase
      .from('profiles')
      .update({ pro_trial_until: newTrialEnd.toISOString() })
      .eq('id', referral.referrer_id);

    // Ensure referrer has an active pro subscription record
    await supabase
      .from('subscriptions')
      .upsert({
        user_id: referral.referrer_id,
        plan: 'pro',
        status: 'active',
        current_period_end: newTrialEnd.toISOString(),
      }, { onConflict: 'user_id' });
  }

  // Mark reward issued
  await supabase
    .from('referrals')
    .update({ reward_issued: true })
    .eq('id', referral.id);
}

async function logCoachPayout(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
  amountPaid: number
) {
  // Find if this user was referred by a coach
  const { data: referral } = await supabase
    .from('referrals')
    .select('referrer_id')
    .eq('referred_id', userId)
    .eq('status', 'completed')
    .single();

  if (!referral) return;

  // Check if referrer is a coach with tier
  const { data: partnership } = await supabase
    .from('coach_partnerships')
    .select('tier, revenue_share_pct')
    .eq('user_id', referral.referrer_id)
    .single();

  if (!partnership || partnership.tier === 0) return;

  const sharePct = partnership.revenue_share_pct || 0;
  if (sharePct === 0) return;

  const payoutAmount = Math.round(amountPaid * (sharePct / 100));

  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  await supabase.from('coach_payouts').insert({
    coach_id: referral.referrer_id,
    amount_cents: payoutAmount,
    period_start: periodStart.toISOString(),
    period_end: periodEnd.toISOString(),
    status: 'pending',
  });
}

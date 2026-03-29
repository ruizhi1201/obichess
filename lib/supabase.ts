import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Server-side client with service role key (for admin operations)
export function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}

export type Profile = {
  id: string;
  email: string | null;
  display_name: string | null;
  rating: number | null;
  created_at: string;
};

export type Game = {
  id: string;
  user_id: string | null;
  pgn: string;
  title: string | null;
  analysis: Record<string, unknown> | null;
  created_at: string;
};

export type CoachTranscript = {
  id: string;
  user_id: string | null;
  content: string;
  focus_areas: Record<string, unknown> | null;
  created_at: string;
};

export type Subscription = {
  id: string;
  user_id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  plan: 'free' | 'pro' | 'family';
  status: string;
  current_period_end: string | null;
  created_at: string;
};

export type Referral = {
  id: string;
  referrer_id: string;
  referred_id: string;
  status: string;
  reward_issued: boolean;
  created_at: string;
};

export type CoachPartnership = {
  id: string;
  user_id: string;
  tier: number;
  referral_count: number;
  revenue_share_pct: number;
  free_until: string | null;
  stripe_connect_id: string | null;
  featured: boolean;
  created_at: string;
};

// Helper to get current user's subscription
export async function getUserSubscription(userId: string): Promise<Subscription | null> {
  const { data } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('user_id', userId)
    .single();
  return data;
}

// Helper to check if user has active Pro or Family plan
export async function isUserPro(userId: string): Promise<boolean> {
  const sub = await getUserSubscription(userId);
  if (!sub) {
    // Check pro_trial_until on profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('pro_trial_until')
      .eq('id', userId)
      .single();
    if (profile?.pro_trial_until && new Date(profile.pro_trial_until) > new Date()) {
      return true;
    }
    return false;
  }
  if (sub.plan === 'free') {
    // Check trial
    const { data: profile } = await supabase
      .from('profiles')
      .select('pro_trial_until')
      .eq('id', userId)
      .single();
    if (profile?.pro_trial_until && new Date(profile.pro_trial_until) > new Date()) {
      return true;
    }
    return false;
  }
  // Check plan is active and not expired
  if (sub.status === 'active' || sub.status === 'trialing') {
    if (!sub.current_period_end) return true;
    return new Date(sub.current_period_end) > new Date();
  }
  return false;
}

'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export type SubscriptionTier = 'free' | 'pro' | 'family';

/**
 * Hook to get current user's subscription tier.
 * Returns 'free' by default (while loading or if not subscribed).
 */
export function useSubscription(): { tier: SubscriptionTier; loading: boolean } {
  const [tier, setTier] = useState<SubscriptionTier>('free');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetchTier() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          if (!cancelled) { setTier('free'); setLoading(false); }
          return;
        }

        // Check subscription table
        const { data: sub } = await supabase
          .from('subscriptions')
          .select('plan, status, current_period_end')
          .eq('user_id', user.id)
          .single();

        if (sub && (sub.status === 'active' || sub.status === 'trialing')) {
          const notExpired = !sub.current_period_end || new Date(sub.current_period_end) > new Date();
          if (notExpired) {
            if (!cancelled) setTier(sub.plan === 'family' ? 'family' : 'pro');
            setLoading(false);
            return;
          }
        }

        // Check pro_trial_until on profiles
        const { data: profile } = await supabase
          .from('profiles')
          .select('pro_trial_until')
          .eq('id', user.id)
          .single();

        if (profile?.pro_trial_until && new Date(profile.pro_trial_until) > new Date()) {
          if (!cancelled) setTier('pro');
          setLoading(false);
          return;
        }

        if (!cancelled) setTier('free');
      } catch {
        if (!cancelled) setTier('free');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchTier();
    return () => { cancelled = true; };
  }, []);

  return { tier, loading };
}

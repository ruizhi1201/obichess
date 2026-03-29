'use client';

import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    const handleCallback = async () => {
      const { data: { session } } = await supabase.auth.getSession();

      if (session) {
        // Check for pending referral code
        const pendingRefCode = localStorage.getItem('pendingRefCode');
        if (pendingRefCode) {
          localStorage.removeItem('pendingRefCode');
          try {
            await fetch('/api/referral/register', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`,
              },
              body: JSON.stringify({ refCode: pendingRefCode }),
            });
          } catch (err) {
            console.error('Failed to register referral:', err);
          }
        }

        router.replace('/dashboard');
      } else {
        router.replace('/');
      }
    };

    handleCallback();
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="text-4xl mb-4">♟️</div>
        <div className="text-zinc-400">Signing you in...</div>
      </div>
    </div>
  );
}

'use client';

import Link from 'next/link';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';

const plans = [
  {
    name: 'Free',
    price: '$0',
    period: 'forever',
    description: 'Get a taste of AI chess coaching',
    features: [
      '5 game analyses per month',
      'Text-only move explanations',
      'Stockfish engine analysis',
      'Basic move classification',
    ],
    cta: 'Get Started Free',
    ctaHref: '/analyze',
    highlight: false,
    planKey: null,
  },
  {
    name: 'Pro',
    price: '$14.99',
    period: 'per month',
    description: 'For serious players who want to improve fast',
    features: [
      'Unlimited game analyses',
      'AI coach voice (TTS)',
      'Freestyle "what if" chat',
      'Full game history saved',
      'Coach transcript upload',
      'Weakness tracking + drill plans',
    ],
    cta: 'Start Pro',
    ctaHref: null,
    highlight: true,
    planKey: 'pro',
  },
  {
    name: 'Family',
    price: '$24.99',
    period: 'per month',
    description: 'Up to 3 players under one subscription',
    features: [
      'Up to 3 player profiles',
      'All Pro features per profile',
      'Shared billing',
      'Perfect for chess families',
    ],
    cta: 'Start Family Plan',
    ctaHref: null,
    highlight: false,
    planKey: 'family',
  },
];

export default function PricingPage() {
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleUpgrade = async (planKey: string) => {
    setLoading(planKey);
    setError(null);

    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
      // Redirect to dashboard (login) with return URL
      window.location.href = `/dashboard?redirect=/pricing`;
      return;
    }

    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ plan: planKey }),
      });

      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        setError(data.error || 'Failed to start checkout');
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(null);
    }
  };

  return (
    <main className="min-h-screen flex flex-col">
      {/* Nav */}
      <nav className="border-b border-zinc-800 px-6 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
          <span className="text-xl">♟️</span>
          <span className="font-bold tracking-tight">Obi-Chess</span>
        </Link>
        <div className="flex items-center gap-4">
          <Link href="/analyze" className="text-zinc-400 hover:text-zinc-100 text-sm transition-colors">
            Analyze
          </Link>
          <Link href="/dashboard" className="text-zinc-400 hover:text-zinc-100 text-sm transition-colors">
            Dashboard
          </Link>
        </div>
      </nav>

      <div className="flex-1 px-6 py-16">
        <div className="max-w-5xl mx-auto">
          {/* Header */}
          <div className="text-center mb-12">
            <h1 className="text-4xl md:text-5xl font-bold mb-4">
              Simple, transparent pricing
            </h1>
            <p className="text-zinc-400 text-lg max-w-xl mx-auto">
              Start free, upgrade when you&apos;re ready. Cancel anytime.
            </p>
          </div>

          {error && (
            <div className="max-w-md mx-auto mb-8 bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-400 text-sm text-center">
              {error}
            </div>
          )}

          {/* Plans */}
          <div className="grid md:grid-cols-3 gap-6">
            {plans.map((plan) => (
              <div
                key={plan.name}
                className={`rounded-2xl p-6 border flex flex-col ${
                  plan.highlight
                    ? 'bg-amber-500/5 border-amber-500/40 relative'
                    : 'bg-zinc-900 border-zinc-800'
                }`}
              >
                {plan.highlight && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="bg-amber-500 text-zinc-950 text-xs font-bold px-3 py-1 rounded-full">
                      MOST POPULAR
                    </span>
                  </div>
                )}

                <div className="mb-6">
                  <h2 className="text-xl font-bold mb-1">{plan.name}</h2>
                  <p className="text-zinc-400 text-sm mb-4">{plan.description}</p>
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-bold">{plan.price}</span>
                    <span className="text-zinc-400 text-sm">/{plan.period}</span>
                  </div>
                </div>

                <ul className="space-y-3 flex-1 mb-6">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm">
                      <span className="text-amber-400 mt-0.5 shrink-0">✓</span>
                      <span className="text-zinc-300">{f}</span>
                    </li>
                  ))}
                </ul>

                {plan.ctaHref ? (
                  <Link
                    href={plan.ctaHref}
                    className="w-full text-center bg-zinc-800 hover:bg-zinc-700 text-zinc-100 font-semibold py-3 rounded-xl transition-colors"
                  >
                    {plan.cta}
                  </Link>
                ) : (
                  <button
                    onClick={() => plan.planKey && handleUpgrade(plan.planKey)}
                    disabled={loading === plan.planKey}
                    className={`w-full font-semibold py-3 rounded-xl transition-colors ${
                      plan.highlight
                        ? 'bg-amber-500 hover:bg-amber-400 text-zinc-950'
                        : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-100'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    {loading === plan.planKey ? 'Loading...' : plan.cta}
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Referral callout */}
          <div className="mt-12 bg-zinc-900 border border-zinc-800 rounded-2xl p-8 text-center">
            <div className="text-3xl mb-3">🎁</div>
            <h3 className="text-xl font-bold mb-2">Refer friends, earn Pro time</h3>
            <p className="text-zinc-400 text-sm max-w-lg mx-auto mb-4">
              Share your referral link. When friends sign up, they get a 14-day Pro trial.
              You earn free Pro time for every 3 and 10 referrals.
            </p>
            <Link
              href="/dashboard/referrals"
              className="inline-flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 font-semibold px-6 py-3 rounded-xl transition-colors text-sm"
            >
              View Your Referrals →
            </Link>
          </div>
        </div>
      </div>

      <footer className="border-t border-zinc-800 px-6 py-6 text-center text-zinc-600 text-sm">
        © 2025 Obi-Chess. Built for competitive players.
      </footer>
    </main>
  );
}

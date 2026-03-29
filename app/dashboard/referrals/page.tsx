'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

interface ReferralStatus {
  referralCode: string;
  referralLink: string;
  totalReferrals: number;
  completedReferrals: number;
  pendingReferrals: number;
  proTrialUntil: string | null;
  nextMilestone: number | null;
  nextReward: string | null;
}

export default function ReferralsPage() {
  const [status, setStatus] = useState<ReferralStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [applyLoading, setApplyLoading] = useState(false);
  const [applyResult, setApplyResult] = useState<string | null>(null);
  const [user, setUser] = useState<{ email?: string } | null>(null);

  useEffect(() => {
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        window.location.href = '/dashboard';
        return;
      }

      setUser({ email: session.user.email });

      const res = await fetch('/api/referral/status', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await res.json();
      setStatus(data);
      setLoading(false);
    };

    load();
  }, []);

  const copyLink = () => {
    if (status?.referralLink) {
      navigator.clipboard.writeText(status.referralLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleCoachApply = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    setApplyLoading(true);
    setApplyResult(null);

    const res = await fetch('/api/coach/apply', {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const data = await res.json();
    setApplyResult(data.message || data.error);
    setApplyLoading(false);
  };

  return (
    <main className="min-h-screen flex flex-col">
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
            My Games
          </Link>
          {user && <span className="text-sm text-zinc-500">{user.email}</span>}
        </div>
      </nav>

      <div className="flex-1 max-w-2xl mx-auto w-full px-6 py-12">
        <div className="mb-8">
          <Link href="/dashboard" className="text-zinc-500 hover:text-zinc-300 text-sm transition-colors">
            ← Back to Dashboard
          </Link>
        </div>

        <h1 className="text-2xl font-bold mb-2">Referrals & Rewards</h1>
        <p className="text-zinc-400 text-sm mb-8">
          Share your link. Friends get a 14-day Pro trial. You earn free Pro time.
        </p>

        {loading ? (
          <div className="text-zinc-500 text-sm">Loading...</div>
        ) : status ? (
          <div className="space-y-6">
            {/* Referral Link */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
              <h2 className="font-semibold mb-3">Your Referral Link</h2>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={status.referralLink || ''}
                  className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-300 font-mono"
                />
                <button
                  onClick={copyLink}
                  className="bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold px-4 py-2 rounded-lg text-sm transition-colors shrink-0"
                >
                  {copied ? '✓ Copied!' : 'Copy'}
                </button>
              </div>
              <p className="text-zinc-500 text-xs mt-2">
                Friends who sign up with your link get a free 14-day Pro trial.
              </p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: 'Total Referrals', value: status.totalReferrals },
                { label: 'Converted', value: status.completedReferrals },
                { label: 'Pending', value: status.pendingReferrals },
              ].map((s) => (
                <div key={s.label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">
                  <div className="text-2xl font-bold text-amber-400">{s.value}</div>
                  <div className="text-zinc-400 text-xs mt-1">{s.label}</div>
                </div>
              ))}
            </div>

            {/* Pro Trial Status */}
            {status.proTrialUntil && (
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4">
                <div className="flex items-center gap-2">
                  <span>⭐</span>
                  <span className="text-amber-400 font-semibold text-sm">Pro active until {new Date(status.proTrialUntil).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
                </div>
              </div>
            )}

            {/* Reward Milestones */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
              <h2 className="font-semibold mb-4">Reward Milestones</h2>
              <div className="space-y-3">
                <MilestoneRow
                  count={3}
                  reward="+14 days Pro free"
                  current={status.completedReferrals}
                />
                <MilestoneRow
                  count={10}
                  reward="+60 days Pro free"
                  current={status.completedReferrals}
                />
              </div>
              {status.nextMilestone && (
                <p className="text-zinc-500 text-xs mt-4">
                  {status.nextMilestone - status.completedReferrals} more conversion{status.nextMilestone - status.completedReferrals !== 1 ? 's' : ''} to earn {status.nextReward}
                </p>
              )}
            </div>

            {/* Coach Partnership */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
              <h2 className="font-semibold mb-2">Coach Partnership Program</h2>
              <p className="text-zinc-400 text-sm mb-4">
                Are you a chess coach? Refer 5+ students and earn revenue share on their subscriptions.
              </p>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="bg-zinc-800 rounded-lg p-3">
                  <div className="font-semibold text-sm mb-1">Tier 1 (5+ referrals)</div>
                  <ul className="text-zinc-400 text-xs space-y-1">
                    <li>• 1 year free Pro</li>
                    <li>• 5% revenue share</li>
                  </ul>
                </div>
                <div className="bg-zinc-800 rounded-lg p-3">
                  <div className="font-semibold text-sm mb-1">Tier 2 (20+ referrals)</div>
                  <ul className="text-zinc-400 text-xs space-y-1">
                    <li>• 3 years free Pro</li>
                    <li>• 15% revenue share</li>
                    <li>• Featured profile</li>
                  </ul>
                </div>
              </div>
              {applyResult && (
                <div className="bg-zinc-800 rounded-lg p-3 text-sm text-zinc-300 mb-3">
                  {applyResult}
                </div>
              )}
              <button
                onClick={handleCoachApply}
                disabled={applyLoading}
                className="w-full bg-zinc-700 hover:bg-zinc-600 text-zinc-100 font-semibold py-2.5 rounded-lg text-sm transition-colors disabled:opacity-50"
              >
                {applyLoading ? 'Checking...' : 'Apply for Coach Partnership'}
              </button>
              <p className="text-zinc-600 text-xs mt-2 text-center">
                You have {status.completedReferrals} completed referral{status.completedReferrals !== 1 ? 's' : ''} (need 5 minimum)
              </p>
            </div>
          </div>
        ) : (
          <div className="text-zinc-500 text-sm">Failed to load referral data.</div>
        )}
      </div>
    </main>
  );
}

function MilestoneRow({ count, reward, current }: { count: number; reward: string; current: number }) {
  const achieved = current >= count;
  const progress = Math.min(current / count, 1);

  return (
    <div className={`rounded-lg p-3 border ${achieved ? 'bg-amber-500/10 border-amber-500/20' : 'bg-zinc-800 border-zinc-700'}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {achieved ? <span className="text-amber-400">✓</span> : <span className="text-zinc-600">○</span>}
          <span className="text-sm font-medium">{count} referrals → {reward}</span>
        </div>
        <span className="text-xs text-zinc-400">{Math.min(current, count)}/{count}</span>
      </div>
      <div className="w-full bg-zinc-700 rounded-full h-1.5">
        <div
          className={`h-1.5 rounded-full transition-all ${achieved ? 'bg-amber-500' : 'bg-zinc-500'}`}
          style={{ width: `${progress * 100}%` }}
        />
      </div>
    </div>
  );
}

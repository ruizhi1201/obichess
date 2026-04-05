'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

interface ReferralStatus {
  referralCode: string;
  referralLink: string;
  totalReferrals: number;
  paidReferrals: number;
  freeReferrals: number;
  membershipFreeUntil: string | null;
  membershipFreePlan: string | null;
  monthMilestoneGranted: boolean;
  yearMilestoneGranted: boolean;
  lastYearGrantedAt: string | null;
  nextMilestone: number | null;
  nextReward: string | null;
}

interface AffiliateStatus {
  isAffiliate: boolean;
  status?: string;
  affiliateCode?: string;
  affiliateLink?: string;
  totalPaidReferrals?: number;
  balanceCents?: number;
  lifetimePaidCents?: number;
}

export default function ReferralsPage() {
  const [referralStatus, setReferralStatus] = useState<ReferralStatus | null>(null);
  const [affiliateStatus, setAffiliateStatus] = useState<AffiliateStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [copiedReferral, setCopiedReferral] = useState(false);
  const [copiedAffiliate, setCopiedAffiliate] = useState(false);
  const [affiliateApplying, setAffiliateApplying] = useState(false);
  const [affiliateMessage, setAffiliateMessage] = useState<string | null>(null);
  const [user, setUser] = useState<{ email?: string } | null>(null);

  useEffect(() => {
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        window.location.href = '/dashboard';
        return;
      }

      setUser({ email: session.user.email });

      const headers = { Authorization: `Bearer ${session.access_token}` };

      const [referralRes, affiliateRes] = await Promise.all([
        fetch('/api/referral/status', { headers }),
        fetch('/api/affiliate/status', { headers }),
      ]);

      const [referralData, affiliateData] = await Promise.all([
        referralRes.json(),
        affiliateRes.json(),
      ]);

      setReferralStatus(referralData);
      setAffiliateStatus(affiliateData);
      setLoading(false);
    };

    load();
  }, []);

  const copyLink = (link: string, type: 'referral' | 'affiliate') => {
    navigator.clipboard.writeText(link);
    if (type === 'referral') {
      setCopiedReferral(true);
      setTimeout(() => setCopiedReferral(false), 2000);
    } else {
      setCopiedAffiliate(true);
      setTimeout(() => setCopiedAffiliate(false), 2000);
    }
  };

  const handleAffiliateApply = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    setAffiliateApplying(true);
    setAffiliateMessage(null);

    const res = await fetch('/api/affiliate/apply', {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const data = await res.json();
    setAffiliateMessage(data.message || data.error);

    if (data.success) {
      // Refresh affiliate status
      const statusRes = await fetch('/api/affiliate/status', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const statusData = await statusRes.json();
      setAffiliateStatus(statusData);
    }

    setAffiliateApplying(false);
  };

  const formatCents = (cents: number) => `$${(cents / 100).toFixed(2)}`;

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

        <h1 className="text-2xl font-bold mb-2">Share & Earn</h1>
        <p className="text-zinc-400 text-sm mb-8">
          Invite friends to Obi-Chess and unlock free memberships. Power users can join our affiliate program and earn real cash.
        </p>

        {loading ? (
          <div className="text-zinc-500 text-sm">Loading...</div>
        ) : (
          <div className="space-y-8">

            {/* ── REFERRAL PROGRAM ── */}
            <section>
              <div className="flex items-center gap-2 mb-4">
                <span className="text-lg">🎁</span>
                <h2 className="text-lg font-bold">Referral Program</h2>
                <span className="text-xs text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded-full">Free to join</span>
              </div>

              {referralStatus ? (
                <div className="space-y-4">
                  {/* Referral Link */}
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                    <div className="text-sm text-zinc-400 mb-2 font-medium">Your referral link</div>
                    <div className="flex gap-2">
                      <input
                        readOnly
                        value={referralStatus.referralLink || ''}
                        className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-300 font-mono min-w-0"
                      />
                      <button
                        onClick={() => copyLink(referralStatus.referralLink, 'referral')}
                        className="bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold px-4 py-2 rounded-lg text-sm transition-colors shrink-0"
                      >
                        {copiedReferral ? '✓ Copied!' : 'Copy'}
                      </button>
                    </div>
                    <p className="text-zinc-600 text-xs mt-2">
                      Both free and paid signups count toward your milestones.
                    </p>
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">
                      <div className="text-2xl font-bold text-amber-400">{referralStatus.totalReferrals}</div>
                      <div className="text-zinc-400 text-xs mt-1">Total Referrals</div>
                      <div className="text-zinc-600 text-xs mt-0.5">
                        {referralStatus.paidReferrals} paid · {referralStatus.freeReferrals} free
                      </div>
                    </div>
                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">
                      <div className="text-2xl font-bold text-emerald-400">
                        {referralStatus.membershipFreeUntil
                          ? new Date(referralStatus.membershipFreeUntil) > new Date()
                            ? '✓ Active'
                            : 'Expired'
                          : 'None yet'}
                      </div>
                      <div className="text-zinc-400 text-xs mt-1">Free Membership</div>
                      {referralStatus.membershipFreeUntil && new Date(referralStatus.membershipFreeUntil) > new Date() && (
                        <div className="text-zinc-600 text-xs mt-0.5 capitalize">
                          {referralStatus.membershipFreePlan} · until {new Date(referralStatus.membershipFreeUntil).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Milestones */}
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                    <h3 className="font-semibold text-sm mb-4">Reward Milestones</h3>
                    <div className="space-y-3">
                      <MilestoneRow
                        count={3}
                        reward="1 month free single membership"
                        current={referralStatus.totalReferrals}
                        granted={referralStatus.monthMilestoneGranted}
                        badge="🥈"
                      />
                      <MilestoneRow
                        count={20}
                        reward="1 year free family membership"
                        current={referralStatus.totalReferrals}
                        granted={referralStatus.yearMilestoneGranted}
                        badge="👑"
                        repeatable
                        lastGrantedAt={referralStatus.lastYearGrantedAt}
                      />
                    </div>
                    {referralStatus.nextMilestone && (
                      <p className="text-zinc-500 text-xs mt-4">
                        {referralStatus.nextMilestone - referralStatus.totalReferrals} more referral{referralStatus.nextMilestone - referralStatus.totalReferrals !== 1 ? 's' : ''} to earn {referralStatus.nextReward}
                      </p>
                    )}
                    {!referralStatus.nextMilestone && referralStatus.nextReward && (
                      <p className="text-zinc-500 text-xs mt-4">{referralStatus.nextReward}</p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-zinc-500 text-sm">Failed to load referral data.</div>
              )}
            </section>

            {/* Divider */}
            <div className="border-t border-zinc-800" />

            {/* ── AFFILIATE PROGRAM ── */}
            <section>
              <div className="flex items-center gap-2 mb-4">
                <span className="text-lg">💰</span>
                <h2 className="text-lg font-bold">Affiliate Program</h2>
                <span className="text-xs text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded-full">10% commission</span>
              </div>

              {affiliateStatus?.isAffiliate && affiliateStatus.status === 'active' ? (
                <div className="space-y-4">
                  {/* Active affiliate */}
                  <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-emerald-400 font-semibold text-sm">✓ Active Affiliate</span>
                    </div>
                    <p className="text-zinc-400 text-xs">
                      You earn 10% of each referred paid subscriber's monthly payment. Payouts coming soon.
                    </p>
                  </div>

                  {/* Affiliate link */}
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                    <div className="text-sm text-zinc-400 mb-2 font-medium">Your affiliate link</div>
                    <div className="flex gap-2">
                      <input
                        readOnly
                        value={affiliateStatus.affiliateLink || ''}
                        className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-300 font-mono min-w-0"
                      />
                      <button
                        onClick={() => copyLink(affiliateStatus.affiliateLink!, 'affiliate')}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold px-4 py-2 rounded-lg text-sm transition-colors shrink-0"
                      >
                        {copiedAffiliate ? '✓ Copied!' : 'Copy'}
                      </button>
                    </div>
                    <p className="text-zinc-600 text-xs mt-2">
                      Code: <span className="font-mono text-zinc-400">{affiliateStatus.affiliateCode}</span>
                    </p>
                  </div>

                  {/* Quick stats */}
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: 'Paid Referrals', value: affiliateStatus.totalPaidReferrals || 0, color: 'text-amber-400' },
                      { label: 'Balance', value: formatCents(affiliateStatus.balanceCents || 0), color: 'text-emerald-400' },
                      { label: 'Lifetime Earned', value: formatCents(affiliateStatus.lifetimePaidCents || 0), color: 'text-zinc-300' },
                    ].map((s) => (
                      <div key={s.label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">
                        <div className={`text-xl font-bold ${s.color}`}>{s.value}</div>
                        <div className="text-zinc-500 text-xs mt-1">{s.label}</div>
                      </div>
                    ))}
                  </div>

                  {/* Link to full dashboard */}
                  <Link
                    href="/dashboard/affiliate"
                    className="flex items-center justify-between w-full bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-xl p-4 transition-colors group"
                  >
                    <div>
                      <div className="font-medium text-sm">Full Affiliate Dashboard</div>
                      <div className="text-zinc-500 text-xs mt-0.5">Referral history, earnings breakdown, payouts</div>
                    </div>
                    <span className="text-zinc-600 group-hover:text-zinc-400 transition-colors">→</span>
                  </Link>
                </div>
              ) : affiliateStatus?.isAffiliate && affiliateStatus.status === 'pending' ? (
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-amber-400">⏳</span>
                    <span className="font-semibold text-sm">Application Pending</span>
                  </div>
                  <p className="text-zinc-400 text-sm">Your affiliate application is under review. We'll notify you when it's approved.</p>
                </div>
              ) : (
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                  <p className="text-zinc-400 text-sm mb-4">
                    Earn <strong className="text-zinc-200">10% commission</strong> on every monthly payment from users you refer. No minimum referral requirement — apply and start earning immediately.
                  </p>
                  <div className="grid grid-cols-3 gap-3 mb-5">
                    {[
                      { icon: '🔗', title: 'Unique link', desc: 'Get your own affiliate link' },
                      { icon: '📊', title: 'Dashboard', desc: 'Track referrals & earnings' },
                      { icon: '💸', title: '10% forever', desc: 'Recurring monthly commission' },
                    ].map((f) => (
                      <div key={f.title} className="bg-zinc-800 rounded-lg p-3 text-center">
                        <div className="text-xl mb-1">{f.icon}</div>
                        <div className="text-xs font-semibold mb-0.5">{f.title}</div>
                        <div className="text-zinc-500 text-xs">{f.desc}</div>
                      </div>
                    ))}
                  </div>
                  {affiliateMessage && (
                    <div className="bg-zinc-800 rounded-lg p-3 text-sm text-zinc-300 mb-3">
                      {affiliateMessage}
                    </div>
                  )}
                  <button
                    onClick={handleAffiliateApply}
                    disabled={affiliateApplying}
                    className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors disabled:opacity-50"
                  >
                    {affiliateApplying ? 'Applying...' : 'Apply for Affiliate Program'}
                  </button>
                  <p className="text-zinc-600 text-xs mt-2 text-center">
                    Free to join · No fees · Payouts coming soon
                  </p>
                </div>
              )}
            </section>

          </div>
        )}
      </div>
    </main>
  );
}

function MilestoneRow({
  count,
  reward,
  current,
  granted,
  badge,
  repeatable,
  lastGrantedAt,
}: {
  count: number;
  reward: string;
  current: number;
  granted: boolean;
  badge: string;
  repeatable?: boolean;
  lastGrantedAt?: string | null;
}) {
  const progress = Math.min(current / count, 1);

  // For repeatable milestones, show next eligibility
  const now = new Date();
  const lastGrant = lastGrantedAt ? new Date(lastGrantedAt) : null;
  const nextEligible = lastGrant ? new Date(lastGrant.getTime() + 365 * 24 * 60 * 60 * 1000) : null;
  const isEligibleAgain = !lastGrant || (lastGrant && nextEligible && nextEligible <= now);

  const isActive = granted && (!repeatable || isEligibleAgain !== false);

  return (
    <div className={`rounded-lg p-3 border ${granted ? 'bg-amber-500/10 border-amber-500/20' : 'bg-zinc-800 border-zinc-700'}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-base">{badge}</span>
          <div>
            <div className="text-sm font-medium">
              {count} referrals → {reward}
            </div>
            {repeatable && (
              <div className="text-xs text-zinc-500 mt-0.5">
                {granted
                  ? nextEligible && nextEligible > now
                    ? `Next eligible: ${nextEligible.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`
                    : 'Eligible again!'
                  : 'Repeatable every 12 months'
                }
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-400">{Math.min(current, count)}/{count}</span>
          {granted && <span className="text-amber-400 text-sm">✓</span>}
        </div>
      </div>
      <div className="w-full bg-zinc-700 rounded-full h-1.5">
        <div
          className={`h-1.5 rounded-full transition-all ${granted ? 'bg-amber-500' : 'bg-zinc-500'}`}
          style={{ width: `${progress * 100}%` }}
        />
      </div>
    </div>
  );
}

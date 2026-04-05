'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

interface AffiliateDashboard {
  affiliate: {
    code: string;
    link: string;
    status: string;
    appliedAt: string;
    approvedAt: string | null;
  };
  stats: {
    totalRegistered: number;
    totalPaid: number;
    balanceCents: number;
    lifetimePaidCents: number;
    totalRevenueCents: number;
    commissionRate: number;
  };
  referrals: Array<{
    registeredAt: string;
    isPaid: boolean;
    becamePaidAt: string | null;
    monthlyAmountCents: number;
  }>;
  earningsByMonth: Record<string, number>;
  recentEarnings: Array<{
    month: string;
    commissionCents: number;
    invoiceAmountCents: number;
    status: string;
    date: string;
  }>;
  payouts: Array<{
    amountCents: number;
    status: string;
    requestedAt: string | null;
    processedAt: string | null;
  }>;
}

export default function AffiliateDashboardPage() {
  const [data, setData] = useState<AffiliateDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [user, setUser] = useState<{ email?: string } | null>(null);

  useEffect(() => {
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        window.location.href = '/dashboard';
        return;
      }

      setUser({ email: session.user.email });

      const res = await fetch('/api/affiliate/dashboard', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (res.status === 403) {
        setError('not-affiliate');
        setLoading(false);
        return;
      }

      if (!res.ok) {
        setError('error');
        setLoading(false);
        return;
      }

      const json = await res.json();
      setData(json);
      setLoading(false);
    };

    load();
  }, []);

  const copyLink = () => {
    if (data?.affiliate.link) {
      navigator.clipboard.writeText(data.affiliate.link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const formatCents = (cents: number) => `$${(cents / 100).toFixed(2)}`;
  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

  const sortedMonths = data
    ? Object.keys(data.earningsByMonth).sort().reverse().slice(0, 6)
    : [];

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

      <div className="flex-1 max-w-3xl mx-auto w-full px-6 py-12">
        <div className="mb-8">
          <Link href="/dashboard/referrals" className="text-zinc-500 hover:text-zinc-300 text-sm transition-colors">
            ← Back to Share & Earn
          </Link>
        </div>

        <div className="flex items-center gap-3 mb-2">
          <span className="text-2xl">💰</span>
          <h1 className="text-2xl font-bold">Affiliate Dashboard</h1>
          {data && (
            <span className="text-xs bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full font-medium">
              Active
            </span>
          )}
        </div>
        <p className="text-zinc-400 text-sm mb-8">
          Track your referrals, earnings, and commission balance.
        </p>

        {loading ? (
          <div className="text-zinc-500 text-sm">Loading...</div>
        ) : error === 'not-affiliate' ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
            <div className="text-4xl mb-4">🔒</div>
            <h2 className="text-lg font-bold mb-2">Not an Affiliate</h2>
            <p className="text-zinc-400 text-sm mb-6">
              You haven't joined the affiliate program yet. Apply to get your unique link and start earning 10% commission.
            </p>
            <Link
              href="/dashboard/referrals"
              className="inline-block bg-emerald-600 hover:bg-emerald-500 text-white font-semibold px-6 py-2.5 rounded-lg text-sm transition-colors"
            >
              Apply for Affiliate Program
            </Link>
          </div>
        ) : error ? (
          <div className="text-zinc-500 text-sm">Failed to load dashboard data.</div>
        ) : data ? (
          <div className="space-y-6">
            {/* Affiliate Link */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold">Your Affiliate Link</h2>
                <span className="text-xs text-zinc-500 font-mono">{data.affiliate.code}</span>
              </div>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={data.affiliate.link}
                  className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-300 font-mono min-w-0"
                />
                <button
                  onClick={copyLink}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold px-4 py-2 rounded-lg text-sm transition-colors shrink-0"
                >
                  {copied ? '✓ Copied!' : 'Copy'}
                </button>
              </div>
              <p className="text-zinc-600 text-xs mt-2">
                Earn {data.stats.commissionRate}% of every monthly payment from users you refer.
              </p>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                {
                  label: 'Registered',
                  value: data.stats.totalRegistered,
                  sub: 'total signups',
                  color: 'text-zinc-300',
                },
                {
                  label: 'Paid Users',
                  value: data.stats.totalPaid,
                  sub: 'active subscribers',
                  color: 'text-amber-400',
                },
                {
                  label: 'Balance',
                  value: formatCents(data.stats.balanceCents),
                  sub: 'pending payout',
                  color: 'text-emerald-400',
                },
                {
                  label: 'Lifetime Earned',
                  value: formatCents(data.stats.lifetimePaidCents),
                  sub: 'all time',
                  color: 'text-zinc-300',
                },
              ].map((s) => (
                <div key={s.label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <div className={`text-xl font-bold ${s.color}`}>{s.value}</div>
                  <div className="text-zinc-400 text-sm font-medium mt-1">{s.label}</div>
                  <div className="text-zinc-600 text-xs mt-0.5">{s.sub}</div>
                </div>
              ))}
            </div>

            {/* Monthly Earnings */}
            {sortedMonths.length > 0 && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                <h2 className="font-semibold mb-4">Monthly Earnings</h2>
                <div className="space-y-2">
                  {sortedMonths.map((month) => {
                    const cents = data.earningsByMonth[month];
                    const maxCents = Math.max(...Object.values(data.earningsByMonth));
                    const pct = maxCents > 0 ? (cents / maxCents) * 100 : 0;
                    const [year, mon] = month.split('-');
                    const label = new Date(parseInt(year), parseInt(mon) - 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

                    return (
                      <div key={month} className="flex items-center gap-3">
                        <div className="text-zinc-400 text-xs w-20 shrink-0">{label}</div>
                        <div className="flex-1 bg-zinc-800 rounded-full h-2">
                          <div
                            className="h-2 rounded-full bg-emerald-500 transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <div className="text-zinc-300 text-xs font-medium w-16 text-right shrink-0">
                          {formatCents(cents)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Referral List */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
              <h2 className="font-semibold mb-4">
                Referrals
                <span className="text-zinc-500 font-normal text-sm ml-2">
                  ({data.stats.totalRegistered} total, {data.stats.totalPaid} paid)
                </span>
              </h2>
              {data.referrals.length === 0 ? (
                <div className="text-zinc-500 text-sm text-center py-6">
                  No referrals yet. Share your link to get started.
                </div>
              ) : (
                <div className="space-y-2">
                  {data.referrals.slice(0, 20).map((ref, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between py-2.5 border-b border-zinc-800 last:border-0"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full shrink-0 ${ref.isPaid ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
                        <div>
                          <div className="text-sm text-zinc-300">
                            {ref.isPaid ? 'Paid subscriber' : 'Free user'}
                          </div>
                          <div className="text-xs text-zinc-500">
                            Joined {formatDate(ref.registeredAt)}
                            {ref.becamePaidAt && ` · Subscribed ${formatDate(ref.becamePaidAt)}`}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        {ref.isPaid ? (
                          <div className="text-emerald-400 text-sm font-medium">
                            {formatCents(Math.round(ref.monthlyAmountCents * 0.1))}/mo
                          </div>
                        ) : (
                          <div className="text-zinc-600 text-xs">Not yet paid</div>
                        )}
                      </div>
                    </div>
                  ))}
                  {data.referrals.length > 20 && (
                    <p className="text-zinc-600 text-xs text-center pt-2">
                      Showing 20 of {data.referrals.length} referrals
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Recent Earnings */}
            {data.recentEarnings.length > 0 && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                <h2 className="font-semibold mb-4">Recent Earnings</h2>
                <div className="space-y-2">
                  {data.recentEarnings.map((e, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between py-2 border-b border-zinc-800 last:border-0"
                    >
                      <div>
                        <div className="text-sm text-zinc-300">{e.month} commission</div>
                        <div className="text-xs text-zinc-500">
                          {formatCents(e.invoiceAmountCents)} subscriber payment · {formatDate(e.date)}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          e.status === 'paid'
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : 'bg-zinc-700 text-zinc-400'
                        }`}>
                          {e.status}
                        </span>
                        <span className="text-emerald-400 font-medium text-sm">
                          +{formatCents(e.commissionCents)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Cash-out section (coming soon) */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold">Payout</h2>
                <span className="text-xs text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded-full">Coming soon</span>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-2xl font-bold text-emerald-400">
                    {formatCents(data.stats.balanceCents)}
                  </div>
                  <div className="text-zinc-500 text-xs mt-1">Available balance</div>
                </div>
                <button
                  disabled
                  className="bg-zinc-700 text-zinc-400 font-semibold px-5 py-2.5 rounded-lg text-sm cursor-not-allowed opacity-60"
                >
                  Request Payout
                </button>
              </div>
              <p className="text-zinc-600 text-xs mt-3">
                Cash-out via Stripe Connect is coming soon. Your balance is accruing and will be available to withdraw.
              </p>
            </div>

            {/* Payout History */}
            {data.payouts.length > 0 && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                <h2 className="font-semibold mb-4">Payout History</h2>
                <div className="space-y-2">
                  {data.payouts.map((p, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between py-2 border-b border-zinc-800 last:border-0"
                    >
                      <div>
                        <div className="text-sm text-zinc-300">{formatCents(p.amountCents)}</div>
                        {p.requestedAt && (
                          <div className="text-xs text-zinc-500">Requested {formatDate(p.requestedAt)}</div>
                        )}
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        p.status === 'paid'
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : p.status === 'processing'
                            ? 'bg-amber-500/20 text-amber-400'
                            : 'bg-zinc-700 text-zinc-400'
                      }`}>
                        {p.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </main>
  );
}

'use client';

import { useState, useEffect } from 'react';
import { type AnalyzedMove, type MoveClassification } from '@/lib/chess-utils';

interface GameSummaryProps {
  moves: AnalyzedMove[];
  whiteName?: string;
  blackName?: string;
  currentMoveIndex: number;
  onSelectMove: (index: number) => void;
  onStartReview: () => void;
  userColor?: 'w' | 'b';
}

function calcAccuracy(moves: AnalyzedMove[], color: 'w' | 'b'): number {
  const playerMoves = moves.filter(m => m.color === color);
  if (playerMoves.length === 0) return 100;
  const totalCPLoss = playerMoves.reduce((sum, m) => {
    const loss = Math.max(0, (m.winPercentBefore ?? 50) - (m.winPercentAfter ?? 50));
    return sum + loss;
  }, 0);
  const avgLoss = totalCPLoss / playerMoves.length;
  return Math.max(0, Math.min(100, 100 - avgLoss * 2));
}

function countClassification(moves: AnalyzedMove[], color: 'w' | 'b', cls: MoveClassification): number {
  return moves.filter(m => m.color === color && m.classification === cls).length;
}

function accuracyColor(acc: number): string {
  if (acc >= 80) return '#22c55e';
  if (acc >= 60) return '#fbbf24';
  return '#f97316';
}

const CLASSIFICATIONS: { key: MoveClassification; label: string; icon: string; color: string }[] = [
  { key: 'best',       label: 'Best',       icon: '✅', color: '#22c55e' },
  { key: 'good',       label: 'Good',       icon: '👍', color: '#86efac' },
  { key: 'inaccuracy', label: 'Inaccuracy', icon: '⚠️', color: '#fbbf24' },
  { key: 'mistake',    label: 'Mistake',    icon: '❓', color: '#f97316' },
  { key: 'blunder',    label: 'Blunder',    icon: '❌', color: '#ef4444' },
];

function parseInsightSections(text: string): { wellDone: string; improve: string; topics: string } {
  const wellDoneMatch = text.match(/✅[^\n]*:\s*([\s\S]*?)(?=📈|$)/);
  const improveMatch = text.match(/📈[^\n]*:\s*([\s\S]*?)(?=📚|$)/);
  const topicsMatch = text.match(/📚[^\n]*:\s*([\s\S]*?)$/);
  return {
    wellDone: wellDoneMatch?.[1]?.trim() ?? '',
    improve: improveMatch?.[1]?.trim() ?? '',
    topics: topicsMatch?.[1]?.trim() ?? '',
  };
}

export default function GameSummary({
  moves,
  whiteName = 'White',
  blackName = 'Black',
  onStartReview,
  userColor = 'w',
}: GameSummaryProps) {
  const [insights, setInsights] = useState<string | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insightsError, setInsightsError] = useState(false);

  const whiteAcc = calcAccuracy(moves, 'w');
  const blackAcc = calcAccuracy(moves, 'b');

  const whiteCounts = {
    best: countClassification(moves, 'w', 'best'),
    good: countClassification(moves, 'w', 'good'),
    inaccuracy: countClassification(moves, 'w', 'inaccuracy'),
    mistake: countClassification(moves, 'w', 'mistake'),
    blunder: countClassification(moves, 'w', 'blunder'),
  };
  const blackCounts = {
    best: countClassification(moves, 'b', 'best'),
    good: countClassification(moves, 'b', 'good'),
    inaccuracy: countClassification(moves, 'b', 'inaccuracy'),
    mistake: countClassification(moves, 'b', 'mistake'),
    blunder: countClassification(moves, 'b', 'blunder'),
  };

  const fetchInsights = async () => {
    if (insightsLoading || insights) return;
    setInsightsLoading(true);
    setInsightsError(false);
    try {
      const res = await fetch('/api/game-insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          whiteAcc,
          blackAcc,
          whiteCounts,
          blackCounts,
          userColor,
          whiteName,
          blackName,
          totalMoves: moves.length,
          moves: moves.map(m => ({
            moveNumber: m.moveNumber,
            color: m.color,
            san: m.san,
            classification: m.classification ?? 'unknown',
            bestMoveSan: m.bestMoveSan,
          })),
        }),
      });
      const data = await res.json();
      if (data.insights) setInsights(data.insights);
      else setInsightsError(true);
    } catch (e) {
      console.error('Failed to fetch insights:', e);
      setInsightsError(true);
    } finally {
      setInsightsLoading(false);
    }
  };

  // Auto-load insights when analysis is complete (moves have classifications)
  useEffect(() => {
    const hasClassifications = moves.some(m => m.classification && m.classification !== 'unknown');
    if (hasClassifications && !insights && !insightsLoading) {
      fetchInsights();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moves]);

  const parsedInsights = insights ? parseInsightSections(insights) : null;

  return (
    <div className="flex flex-col gap-4 p-4 overflow-y-auto h-full">
      {/* Player accuracy rows */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2 py-2 px-3 bg-zinc-900 rounded-lg border border-zinc-800">
          <span className="text-base">♔</span>
          <span className="text-sm text-zinc-300 flex-1 truncate font-medium" title={whiteName}>
            {whiteName}
          </span>
          <span className="text-sm font-bold tabular-nums shrink-0" style={{ color: accuracyColor(whiteAcc) }}>
            {whiteAcc.toFixed(1)}%
          </span>
        </div>
        <div className="flex items-center gap-2 py-2 px-3 bg-zinc-900 rounded-lg border border-zinc-800">
          <span className="text-base">♚</span>
          <span className="text-sm text-zinc-300 flex-1 truncate font-medium" title={blackName}>
            {blackName}
          </span>
          <span className="text-sm font-bold tabular-nums shrink-0" style={{ color: accuracyColor(blackAcc) }}>
            {blackAcc.toFixed(1)}%
          </span>
        </div>
      </div>

      {/* Move classification breakdown */}
      <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
        <div className="grid grid-cols-[1fr_auto_auto] border-b border-zinc-800">
          <div className="px-3 py-1.5 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Type</div>
          <div className="px-3 py-1.5 text-[10px] font-semibold text-zinc-500 text-center w-10 uppercase tracking-wider">♔</div>
          <div className="px-3 py-1.5 text-[10px] font-semibold text-zinc-500 text-center w-10 uppercase tracking-wider">♚</div>
        </div>

        {CLASSIFICATIONS.map(({ key, label, icon, color }) => {
          const wCount = countClassification(moves, 'w', key);
          const bCount = countClassification(moves, 'b', key);
          return (
            <div
              key={key}
              className="grid grid-cols-[1fr_auto_auto] border-b border-zinc-800/50 last:border-b-0 hover:bg-zinc-800/30 transition-colors"
            >
              <div className="px-3 py-2 flex items-center gap-2">
                <span className="text-xs">{icon}</span>
                <span className="text-xs font-medium" style={{ color }}>{label}</span>
              </div>
              <div className="px-3 py-2 text-sm font-bold text-center w-10 tabular-nums" style={{ color: wCount > 0 ? color : '#52525b' }}>
                {wCount}
              </div>
              <div className="px-3 py-2 text-sm font-bold text-center w-10 tabular-nums" style={{ color: bCount > 0 ? color : '#52525b' }}>
                {bCount}
              </div>
            </div>
          );
        })}
      </div>

      {/* AI Insights - auto loads, shows spinner while loading */}
      {!insights && insightsLoading && (
        <div className="w-full bg-zinc-900 border border-zinc-700 rounded-xl p-4 flex items-center gap-3 text-sm text-zinc-400">
          <span className="animate-spin text-violet-400">⏳</span>
          <span>Generating AI insights...</span>
        </div>
      )}
      {!insights && !insightsLoading && insightsError && (
        <button
          onClick={fetchInsights}
          className="w-full bg-violet-600 hover:bg-violet-500 text-white font-bold py-2.5 px-4 rounded-xl transition-colors text-sm"
        >
          ✨ Retry AI Insights
        </button>
      )}

      {parsedInsights && (
        <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-4 flex flex-col gap-3 text-sm">
          <div className="text-xs font-bold text-violet-400 uppercase tracking-wider">✨ AI Game Insights</div>
          {parsedInsights.wellDone && (
            <div>
              <div className="font-semibold text-green-400 mb-1">✅ What you did well</div>
              <p className="text-zinc-300 text-xs leading-relaxed">{parsedInsights.wellDone}</p>
            </div>
          )}
          {parsedInsights.improve && (
            <div>
              <div className="font-semibold text-amber-400 mb-1">📈 What to improve</div>
              <p className="text-zinc-300 text-xs leading-relaxed">{parsedInsights.improve}</p>
            </div>
          )}
          {parsedInsights.topics && (
            <div>
              <div className="font-semibold text-blue-400 mb-1">📚 Suggested study topics</div>
              <p className="text-zinc-300 text-xs leading-relaxed">{parsedInsights.topics}</p>
            </div>
          )}
        </div>
      )}

      {/* Review Game button */}
      <button
        onClick={onStartReview}
        className="w-full bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold py-3 px-4 rounded-xl transition-colors text-sm tracking-wide"
      >
        Review Game →
      </button>
    </div>
  );
}

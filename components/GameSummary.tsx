'use client';

import EvalChart from '@/components/EvalChart';
import { type AnalyzedMove, type MoveClassification } from '@/lib/chess-utils';

interface GameSummaryProps {
  moves: AnalyzedMove[];
  whiteName?: string;
  blackName?: string;
  currentMoveIndex: number;
  onSelectMove: (index: number) => void;
  onStartReview: () => void;
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
  if (acc >= 90) return '#22c55e';   // green
  if (acc >= 75) return '#86efac';   // light green
  if (acc >= 60) return '#fbbf24';   // yellow
  if (acc >= 45) return '#f97316';   // orange
  return '#ef4444';                   // red
}

const CLASSIFICATIONS: { key: MoveClassification; label: string; icon: string; color: string }[] = [
  { key: 'best',       label: 'Best',       icon: '✅', color: '#22c55e' },
  { key: 'good',       label: 'Good',       icon: '👍', color: '#86efac' },
  { key: 'inaccuracy', label: 'Inaccuracy', icon: '⚠️', color: '#fbbf24' },
  { key: 'mistake',    label: 'Mistake',    icon: '❓', color: '#f97316' },
  { key: 'blunder',    label: 'Blunder',    icon: '❌', color: '#ef4444' },
];

export default function GameSummary({
  moves,
  whiteName = 'White',
  blackName = 'Black',
  currentMoveIndex,
  onSelectMove,
  onStartReview,
}: GameSummaryProps) {
  const whiteAcc = calcAccuracy(moves, 'w');
  const blackAcc = calcAccuracy(moves, 'b');

  return (
    <div className="p-4 flex flex-col gap-5">
      {/* Header */}
      <div>
        <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-400 mb-3">
          Game Summary
        </h2>

        {/* Eval chart */}
        <EvalChart
          moves={moves}
          currentIndex={currentMoveIndex}
          onSelectMove={onSelectMove}
        />
      </div>

      {/* Accuracy section */}
      <div>
        <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3">
          Accuracy
        </div>
        <div className="grid grid-cols-2 gap-3">
          {/* White */}
          <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4 flex flex-col items-center gap-2">
            <div className="text-2xl">♔</div>
            <div className="text-xs text-zinc-400 font-medium truncate max-w-full text-center" title={whiteName}>
              {whiteName}
            </div>
            <div
              className="text-3xl font-bold leading-none tabular-nums"
              style={{ color: accuracyColor(whiteAcc) }}
            >
              {whiteAcc.toFixed(1)}
            </div>
            <div className="text-xs text-zinc-600">accuracy</div>
          </div>

          {/* Black */}
          <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4 flex flex-col items-center gap-2">
            <div className="text-2xl">♚</div>
            <div className="text-xs text-zinc-400 font-medium truncate max-w-full text-center" title={blackName}>
              {blackName}
            </div>
            <div
              className="text-3xl font-bold leading-none tabular-nums"
              style={{ color: accuracyColor(blackAcc) }}
            >
              {blackAcc.toFixed(1)}
            </div>
            <div className="text-xs text-zinc-600">accuracy</div>
          </div>
        </div>
      </div>

      {/* Move classification breakdown */}
      <div>
        <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3">
          Move Breakdown
        </div>
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-[1fr_auto_auto] gap-0 border-b border-zinc-800">
            <div className="px-3 py-2 text-xs font-semibold text-zinc-500">Type</div>
            <div className="px-3 py-2 text-xs font-semibold text-zinc-500 text-center w-14">♔</div>
            <div className="px-3 py-2 text-xs font-semibold text-zinc-500 text-center w-14">♚</div>
          </div>

          {CLASSIFICATIONS.map(({ key, label, icon, color }) => {
            const wCount = countClassification(moves, 'w', key);
            const bCount = countClassification(moves, 'b', key);
            return (
              <div
                key={key}
                className="grid grid-cols-[1fr_auto_auto] gap-0 border-b border-zinc-800/50 last:border-b-0 hover:bg-zinc-800/30 transition-colors"
              >
                <div className="px-3 py-2 flex items-center gap-2">
                  <span className="text-sm">{icon}</span>
                  <span className="text-xs font-medium" style={{ color }}>
                    {label}
                  </span>
                </div>
                <div className="px-3 py-2 text-sm font-bold text-center w-14 tabular-nums" style={{ color: wCount > 0 ? color : '#52525b' }}>
                  {wCount}
                </div>
                <div className="px-3 py-2 text-sm font-bold text-center w-14 tabular-nums" style={{ color: bCount > 0 ? color : '#52525b' }}>
                  {bCount}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Start Review button */}
      <button
        onClick={onStartReview}
        className="w-full bg-green-600 hover:bg-green-500 text-white font-bold py-3 px-4 rounded-xl transition-colors text-sm tracking-wide"
      >
        Start Review →
      </button>
    </div>
  );
}

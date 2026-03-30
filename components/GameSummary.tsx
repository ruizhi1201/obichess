'use client';

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
  if (acc >= 80) return '#22c55e';   // green
  if (acc >= 60) return '#fbbf24';   // yellow
  return '#f97316';                   // orange
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
  onStartReview,
}: GameSummaryProps) {
  const whiteAcc = calcAccuracy(moves, 'w');
  const blackAcc = calcAccuracy(moves, 'b');

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Player accuracy rows — chess.com style */}
      <div className="flex flex-col gap-1">
        {/* White row */}
        <div className="flex items-center gap-2 py-2 px-3 bg-zinc-900 rounded-lg border border-zinc-800">
          <span className="text-base">♔</span>
          <span className="text-sm text-zinc-300 flex-1 truncate font-medium" title={whiteName}>
            {whiteName}
          </span>
          <span
            className="text-sm font-bold tabular-nums shrink-0"
            style={{ color: accuracyColor(whiteAcc) }}
          >
            {whiteAcc.toFixed(1)}%
          </span>
        </div>

        {/* Black row */}
        <div className="flex items-center gap-2 py-2 px-3 bg-zinc-900 rounded-lg border border-zinc-800">
          <span className="text-base">♚</span>
          <span className="text-sm text-zinc-300 flex-1 truncate font-medium" title={blackName}>
            {blackName}
          </span>
          <span
            className="text-sm font-bold tabular-nums shrink-0"
            style={{ color: accuracyColor(blackAcc) }}
          >
            {blackAcc.toFixed(1)}%
          </span>
        </div>
      </div>

      {/* Move classification breakdown — compact chess.com style */}
      <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
        {/* Table header */}
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
                <span className="text-xs font-medium" style={{ color }}>
                  {label}
                </span>
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

      {/* Review Game button — amber/gold chess.com style */}
      <button
        onClick={onStartReview}
        className="w-full bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold py-3 px-4 rounded-xl transition-colors text-sm tracking-wide"
      >
        Review Game →
      </button>
    </div>
  );
}

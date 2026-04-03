'use client';

import { useRef, useEffect } from 'react';
import { type AnalyzedMove, type MoveClassification, classificationColor } from '@/lib/chess-utils';

interface MoveNotationProps {
  moves: AnalyzedMove[];
  currentIndex: number;
  onSelectMove: (index: number) => void;
}

export default function MoveNotation({ moves, currentIndex, onSelectMove }: MoveNotationProps) {
  const activeRef = useRef<HTMLButtonElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Scroll active move into view inside the container only — never the page
  useEffect(() => {
    if (activeRef.current && containerRef.current) {
      const el = activeRef.current;
      const container = containerRef.current;
      const elTop = el.offsetTop - container.offsetTop;
      const elBottom = elTop + el.offsetHeight;
      const scrollTop = container.scrollTop;
      const scrollBottom = scrollTop + container.clientHeight;
      if (elTop < scrollTop || elBottom > scrollBottom) {
        container.scrollTop = elTop - container.clientHeight / 2 + el.offsetHeight / 2;
      }
    }
  }, [currentIndex]);

  // Build white/black pairs
  const pairs: {
    moveNumber: number;
    white?: AnalyzedMove & { index: number };
    black?: AnalyzedMove & { index: number };
  }[] = [];

  for (let i = 0; i < moves.length; i++) {
    const move = moves[i];
    if (move.color === 'w') {
      pairs.push({ moveNumber: move.moveNumber, white: { ...move, index: i } });
    } else {
      const last = pairs[pairs.length - 1];
      if (last && !last.black) {
        last.black = { ...move, index: i };
      } else {
        pairs.push({ moveNumber: move.moveNumber, black: { ...move, index: i } });
      }
    }
  }

  const badge = (cls: MoveClassification | undefined) => {
    if (!cls || cls === 'best' || cls === 'unknown') return null;
    const symbol = cls === 'blunder' ? '??' : cls === 'mistake' ? '?' : cls === 'inaccuracy' ? '?!' : null;
    if (!symbol) return null;
    return (
      <span className="text-xs ml-0.5" style={{ color: classificationColor(cls) }}>
        {symbol}
      </span>
    );
  };

  return (
    <div
      ref={containerRef}
      className="overflow-y-auto bg-zinc-900/60 border border-zinc-800 rounded-lg px-3 py-2"
      style={{ maxHeight: 160 }}
    >
      {pairs.length === 0 ? (
        <span className="text-zinc-600 text-sm">No moves yet</span>
      ) : (
        <div className="flex flex-wrap items-center gap-x-0.5 gap-y-0.5 text-sm font-mono leading-relaxed">
          {pairs.map((pair) => (
            <span key={pair.moveNumber} className="flex items-center gap-0.5">
              {/* Move number */}
              <span className="text-zinc-500 text-xs select-none">{pair.moveNumber}.</span>

              {/* White move */}
              {pair.white && (
                <button
                  ref={currentIndex === pair.white.index ? activeRef : undefined}
                  onClick={() => onSelectMove(pair.white!.index)}
                  className={`px-1.5 py-0.5 rounded transition-colors ${
                    currentIndex === pair.white.index
                      ? 'bg-amber-500/25 text-amber-300 font-semibold'
                      : 'text-zinc-300 hover:bg-zinc-700/70'
                  }`}
                >
                  {pair.white.san}
                  {badge(pair.white.classification)}
                </button>
              )}

              {/* Black move */}
              {pair.black && (
                <button
                  ref={currentIndex === pair.black.index ? activeRef : undefined}
                  onClick={() => onSelectMove(pair.black!.index)}
                  className={`px-1.5 py-0.5 rounded transition-colors ${
                    currentIndex === pair.black.index
                      ? 'bg-amber-500/25 text-amber-300 font-semibold'
                      : 'text-zinc-300 hover:bg-zinc-700/70'
                  }`}
                >
                  {pair.black.san}
                  {badge(pair.black.classification)}
                </button>
              )}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

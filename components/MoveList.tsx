'use client';

import { useRef, useEffect } from 'react';
import { type AnalyzedMove, classificationColor, classificationLabel } from '@/lib/chess-utils';

interface MoveListProps {
  moves: AnalyzedMove[];
  currentIndex: number;
  onSelectMove: (index: number) => void;
}

export default function MoveList({ moves, currentIndex, onSelectMove }: MoveListProps) {
  const activeRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Scroll active move into view within the move list container only — never the page
  useEffect(() => {
    if (activeRef.current && scrollRef.current) {
      const container = scrollRef.current;
      const el = activeRef.current;
      const elTop = el.offsetTop - container.offsetTop;
      const elBottom = elTop + el.offsetHeight;
      const containerTop = container.scrollTop;
      const containerBottom = containerTop + container.clientHeight;
      if (elTop < containerTop || elBottom > containerBottom) {
        container.scrollTop = elTop - container.clientHeight / 2 + el.offsetHeight / 2;
      }
    }
  }, [currentIndex]);

  // Group moves into pairs (white + black)
  const movePairs: { white?: AnalyzedMove & { index: number }; black?: AnalyzedMove & { index: number }; moveNumber: number }[] = [];

  for (let i = 0; i < moves.length; i++) {
    const move = moves[i];
    if (move.color === 'w') {
      movePairs.push({
        moveNumber: move.moveNumber,
        white: { ...move, index: i },
      });
    } else {
      const lastPair = movePairs[movePairs.length - 1];
      if (lastPair && !lastPair.black) {
        lastPair.black = { ...move, index: i };
      } else {
        movePairs.push({
          moveNumber: move.moveNumber,
          black: { ...move, index: i },
        });
      }
    }
  }

  return (
    <div className="flex flex-col min-h-0 flex-1">
      <div className="px-3 py-3 border-b border-zinc-800 text-xs font-semibold text-zinc-500 uppercase tracking-wider shrink-0">
        Moves
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto min-h-0 py-1">
        {movePairs.length === 0 && (
          <div className="text-center text-zinc-600 text-sm py-8">No moves</div>
        )}
        {movePairs.map((pair) => (
          <div
            key={pair.moveNumber}
            ref={pair.white?.index === currentIndex || pair.black?.index === currentIndex ? activeRef : undefined}
            className="flex items-stretch text-sm"
          >
            <div className="w-8 text-zinc-600 text-xs flex items-center justify-center shrink-0 border-r border-zinc-800/50">
              {pair.moveNumber}
            </div>
            <div className="flex flex-1">
              {pair.white && (
                <MoveButton
                  move={pair.white}
                  isActive={currentIndex === pair.white.index}
                  onClick={() => onSelectMove(pair.white!.index)}
                />
              )}
              {pair.black && (
                <MoveButton
                  move={pair.black}
                  isActive={currentIndex === pair.black.index}
                  onClick={() => onSelectMove(pair.black!.index)}
                />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MoveButton({
  move,
  isActive,
  onClick,
}: {
  move: AnalyzedMove & { index: number };
  isActive: boolean;
  onClick: () => void;
}) {
  const color = move.classification ? classificationColor(move.classification) : undefined;
  const label = move.classification ? classificationLabel(move.classification) : '';

  return (
    <button
      onClick={onClick}
      title={label}
      className={`flex-1 px-2 py-1.5 text-left font-mono text-sm transition-colors relative group ${
        isActive
          ? 'bg-amber-500/20 text-amber-300'
          : 'hover:bg-zinc-800 text-zinc-300'
      }`}
    >
      <span>{move.san}</span>
      {move.classification && move.classification !== 'best' && move.classification !== 'unknown' && (
        <span
          className="ml-1 text-xs"
          style={{ color }}
        >
          {move.classification === 'blunder' ? '??' :
           move.classification === 'mistake' ? '?' :
           move.classification === 'inaccuracy' ? '?!' : ''}
        </span>
      )}
      {/* Tooltip */}
      {label && (
        <div className="absolute left-full top-0 ml-1 bg-zinc-800 text-zinc-200 text-xs px-2 py-1 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
          {label}
        </div>
      )}
    </button>
  );
}

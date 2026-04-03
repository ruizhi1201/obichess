'use client';

import { Chessboard } from 'react-chessboard';
import type { Arrow } from 'react-chessboard';
import { type AnalyzedMove } from '@/lib/chess-utils';
import { useMemo } from 'react';

interface ChessBoardProps {
  fen: string;
  lastMove?: AnalyzedMove | null;
  bestMove?: string; // UCI notation e.g. "e2e4"
  showArrows?: boolean;
  onMove?: (from: string, to: string) => boolean | Promise<boolean>;
}

function uciToSquares(uci: string): { from: string; to: string } | null {
  if (!uci || uci.length < 4) return null;
  return { from: uci.slice(0, 2), to: uci.slice(2, 4) };
}

export default function ChessBoard({
  fen,
  lastMove,
  bestMove,
  showArrows = false,
  onMove,
}: ChessBoardProps) {
  const squareStyles = useMemo(() => {
    const styles: Record<string, React.CSSProperties> = {};

    if (lastMove) {
      const from = lastMove.uci.slice(0, 2);
      const to = lastMove.uci.slice(2, 4);
      styles[from] = { backgroundColor: 'rgba(251, 191, 36, 0.3)' };
      styles[to] = { backgroundColor: 'rgba(251, 191, 36, 0.5)' };
    }

    return styles;
  }, [lastMove]);

  const arrows = useMemo(() => {
    const arrowList: Arrow[] = [];

    if (showArrows && bestMove) {
      const sq = uciToSquares(bestMove);
      if (sq) {
        arrowList.push({ startSquare: sq.from, endSquare: sq.to, color: '#22c55e' });
      }
    }

    return arrowList;
  }, [showArrows, bestMove]);

  return (
    <div className="chess-board-container w-full">
      <Chessboard
        options={{
          position: fen,
          squareStyles,
          arrows,
          darkSquareStyle: { backgroundColor: '#4a3728' },
          lightSquareStyle: { backgroundColor: '#d4a574' },
          allowDragging: !!onMove,
          animationDurationInMs: 150,
          onPieceDrop: onMove
            ? ({ sourceSquare, targetSquare }) => {
                if (!targetSquare) return false;
                const result = onMove(sourceSquare, targetSquare);
                if (result instanceof Promise) {
                  // async handler — optimistically return true; the handler updates state when done
                  result.catch(() => {});
                  return true;
                }
                return result;
              }
            : undefined,
        }}
      />
    </div>
  );
}

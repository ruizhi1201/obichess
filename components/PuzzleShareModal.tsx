'use client';

import { useState, useEffect, useCallback } from 'react';
import { Chessboard } from 'react-chessboard';
import { Chess } from 'chess.js';

interface PuzzleShareModalProps {
  puzzles: Array<{
    fen: string;
    solution: string[];
    san: string;
    playerName: string;
    playerElo: number;
    opponentName: string;
    difficulty: number;
    difficultyScore: number;
    cpSwing: number;
    isTactical: boolean;
    isCheck: boolean;
    pattern?: string;
  }>;
  onShare: (puzzleIndex: number) => void;
  onSkip: () => void;
}

export default function PuzzleShareModal({
  puzzles,
  onShare,
  onSkip,
}: PuzzleShareModalProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isSharing, setIsSharing] = useState(false);

  const puzzle = puzzles[selectedIndex];
  if (!puzzle) return null;

  const handleShare = async () => {
    setIsSharing(true);
    try {
      await onShare(selectedIndex);
    } finally {
      setIsSharing(false);
    }
  };

  const difficultyStars = '★'.repeat(puzzle.difficulty) + '☆'.repeat(5 - puzzle.difficulty);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl">
        {/* Header */}
        <div className="text-center mb-4">
          <h2 className="text-xl font-bold text-white mb-1">
            🎉 Share Your Best Moment!
          </h2>
          <p className="text-sm text-slate-400">
            We found {puzzles.length} puzzle-worthy moves in your game
          </p>
        </div>

        {/* Puzzle preview */}
        <div className="bg-slate-800 rounded-xl p-4 mb-4">
          {/* Board preview */}
          <div className="flex justify-center mb-3">
            <div className="w-48 h-48">
              <Chessboard
                options={{
                  position: puzzle.fen,
                  boardOrientation: 'white',
                  allowDragging: false,
                  boardStyle: {
                    borderRadius: '8px',
                  },
                }}
              />
            </div>
          </div>

          {/* Move info */}
          <div className="text-center mb-3">
            <div className="text-lg font-mono text-amber-400">{puzzle.san}</div>
            <div className="text-xs text-slate-400 mt-1">
              {puzzle.isTactical && (
                <span className="text-purple-400 mr-2">⚡ {puzzle.pattern}</span>
              )}
              {puzzle.isCheck && (
                <span className="text-red-400 mr-2">+ Check</span>
              )}
              <span>±{Math.round(puzzle.cpSwing)} cp</span>
            </div>
          </div>

          {/* Difficulty + meta */}
          <div className="flex justify-between items-center text-xs text-slate-400">
            <span className="text-amber-400 text-sm">{difficultyStars}</span>
            <span>{puzzle.playerName} ({puzzle.playerElo})</span>
          </div>

          {/* Carousel dots */}
          {puzzles.length > 1 && (
            <div className="flex justify-center gap-2 mt-3">
              {puzzles.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setSelectedIndex(i)}
                  className={`w-2 h-2 rounded-full transition-all ${
                    i === selectedIndex
                      ? 'bg-amber-400 w-4'
                      : 'bg-slate-600 hover:bg-slate-500'
                  }`}
                />
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={handleShare}
            disabled={isSharing}
            className="flex-1 bg-amber-500 hover:bg-amber-400 disabled:bg-amber-700 text-black font-semibold py-3 px-4 rounded-xl transition-colors"
          >
            {isSharing ? 'Generating link...' : '🚀 Share This Puzzle'}
          </button>
          <button
            onClick={onSkip}
            className="px-4 py-3 text-slate-400 hover:text-slate-300 transition-colors"
          >
            Skip
          </button>
        </div>
      </div>
    </div>
  );
}

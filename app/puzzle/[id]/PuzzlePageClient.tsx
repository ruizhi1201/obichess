'use client';

import { useState, useMemo } from 'react';
import { Chessboard } from 'react-chessboard';
import { Chess } from 'chess.js';

interface PuzzleData {
  id: string;
  fen: string;
  solution: string[];
  player_name: string;
  player_elo: number | null;
  difficulty: number;
  difficulty_score: number | null;
  opponent_name: string | null;
  tournament: string | null;
  explanation: string;
}

type SolveState = 'playing' | 'correct' | 'wrong' | 'revealed';

export default function PuzzlePageClient({ puzzle }: { puzzle: PuzzleData }) {
  const [boardFen, setBoardFen] = useState(puzzle.fen);
  const [solveState, setSolveState] = useState<SolveState>('playing');
  const [attemptCount, setAttemptCount] = useState(0);
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);

  const chess = useMemo(() => {
    try {
      const c = new Chess(puzzle.fen);
      return c;
    } catch {
      return new Chess();
    }
  }, [puzzle.fen]);

  const turn = chess.turn();
  const turnLabel = turn === 'w' ? 'White' : 'Black';
  const solutionSan = puzzle.solution[0]; // UCI of the solution move

  // Convert UCI to SAN for display
  const solutionSanDisplay = useMemo(() => {
    try {
      const from = solutionSan?.slice(0, 2);
      const to = solutionSan?.slice(2, 4);
      const promotion = solutionSan?.length > 4 ? solutionSan.slice(4) : undefined;
      const move = chess.move({ from, to, promotion: promotion as any });
      if (move) {
        chess.undo();
        return move.san;
      }
    } catch {}
    return solutionSan;
  }, [solutionSan]);

  const difficultyStars = '★'.repeat(puzzle.difficulty) + '☆'.repeat(5 - puzzle.difficulty);

  const handlePieceDrop = (sourceSquare: string, targetSquare: string): boolean => {
    try {
      const move = chess.move({
        from: sourceSquare,
        to: targetSquare,
        promotion: 'q',
      });

      if (!move) return false;

      const uciAttempt = sourceSquare + targetSquare;

      if (uciAttempt === solutionSan) {
        // Correct!
        setSolveState('correct');
        setBoardFen(chess.fen());
        return true;
      } else {
        // Wrong move
        chess.undo();
        setSolveState('wrong');
        setLastMove({ from: sourceSquare, to: targetSquare });
        setAttemptCount((c) => c + 1);

        // Reset wrong state after animation
        setTimeout(() => {
          setSolveState('playing');
          setLastMove(null);
        }, 800);

        return false;
      }
    } catch {
      return false;
    }
  };

  const handleGiveUp = () => {
    // Show the solution
    try {
      const from = solutionSan?.slice(0, 2);
      const to = solutionSan?.slice(2, 4);
      const promotion = solutionSan?.length > 4 ? solutionSan.slice(4) : undefined;
      chess.move({ from, to, promotion: promotion as any });
      setBoardFen(chess.fen());
    } catch {}
    setSolveState('revealed');
  };

  const handleShare = () => {
    const url = `${window.location.origin}/puzzle/${puzzle.id}`;
    if (navigator.share) {
      navigator.share({
        title: `Can you find ${puzzle.player_name}'s winning move?`,
        text: `Try this chess puzzle by ${puzzle.player_name} (${puzzle.player_elo || '?'}) — ${difficultyStars}`,
        url,
      });
    } else {
      navigator.clipboard.writeText(url);
      alert('Link copied! Share it with your friends.');
    }
  };

  const isSolved = solveState === 'correct' || solveState === 'revealed';

  return (
    <div className="min-h-screen bg-slate-950">
      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-white mb-2">
            ♟ Puzzle from {puzzle.player_name}
          </h1>
          <div className="flex items-center justify-center gap-4 text-sm text-slate-400">
            <span>
              {puzzle.player_name} ({puzzle.player_elo || '?'})
              {puzzle.opponent_name && (
                <> vs {puzzle.opponent_name}</>
              )}
            </span>
            <span className="text-amber-400">{difficultyStars}</span>
          </div>
          {puzzle.tournament && (
            <div className="text-xs text-slate-500 mt-1">
              {puzzle.tournament}
            </div>
          )}
        </div>

        {/* Board */}
        <div className="flex justify-center mb-4">
          <div className="w-full max-w-md">
            <Chessboard
              options={{
                position: boardFen,
                boardOrientation: turn === 'w' ? 'white' : 'black',
                allowDragging: solveState === 'playing',
                animationDurationInMs: 150,
                onPieceDrop: solveState === 'playing'
                  ? ({ sourceSquare, targetSquare }: { sourceSquare: string; targetSquare: string | null }) => {
                      if (!targetSquare) return false;
                      return handlePieceDrop(sourceSquare, targetSquare);
                    }
                  : undefined,
                boardStyle: {
                  borderRadius: '12px',
                  boxShadow: '0 4px 24px rgba(0, 0, 0, 0.5)',
                },
                darkSquareStyle: { backgroundColor: '#4a5568' },
                lightSquareStyle: { backgroundColor: '#e2e8f0' },
              }}
            />
          </div>
        </div>

        {/* Status */}
        <div className="text-center mb-4">
          {solveState === 'playing' && (
            <p className="text-slate-300 text-lg">
              {turnLabel} to move — find the winning idea
            </p>
          )}
          {solveState === 'wrong' && lastMove && (
            <p className="text-red-400 animate-pulse text-lg">
              ❌ {lastMove.from}-{lastMove.to} is not the answer. Try again!
            </p>
          )}
          {solveState === 'correct' && (
            <div className="space-y-2">
              <p className="text-green-400 text-lg font-bold">✅ Correct!</p>
              <p className="text-slate-300">{solutionSanDisplay} is the winning move!</p>
            </div>
          )}
          {solveState === 'revealed' && (
            <div className="space-y-2">
              <p className="text-amber-400 text-lg font-bold">
                The answer is {solutionSanDisplay}
              </p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-center gap-3 mb-8">
          {!isSolved && (
            <button
              onClick={handleGiveUp}
              className="px-6 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl border border-slate-600 transition-colors"
            >
              💡 I give up — show answer
            </button>
          )}
          {isSolved && (
            <button
              onClick={handleShare}
              className="px-6 py-2 bg-amber-500 hover:bg-amber-400 text-black font-semibold rounded-xl transition-colors"
            >
              🚀 Share this puzzle
            </button>
          )}
        </div>

        {/* Explanation (after solving) */}
        {isSolved && puzzle.explanation && (
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 mb-8">
            <h3 className="text-sm font-semibold text-slate-400 uppercase mb-2">
              Why this move works
            </h3>
            <p className="text-slate-300 leading-relaxed whitespace-pre-wrap">
              {puzzle.explanation}
            </p>
          </div>
        )}

        {/* CTA */}
        {isSolved && (
          <div className="bg-gradient-to-br from-amber-900/30 to-slate-900 border border-amber-700/50 rounded-xl p-6 text-center">
            <h3 className="text-lg font-bold text-white mb-2">
              Want puzzles from YOUR games?
            </h3>
            <p className="text-slate-400 text-sm mb-4">
              Upload your PGN and get AI-powered analysis — plus sharable puzzles from your best moves.
            </p>
            <a
              href="/signup"
              className="inline-block bg-amber-500 hover:bg-amber-400 text-black font-semibold py-3 px-8 rounded-xl transition-colors"
            >
              Analyze your first 5 games free →
            </a>
            <p className="text-xs text-slate-500 mt-3">
              Puzzle from {puzzle.player_name}&apos;s game • Analyzed by{' '}
              <span className="text-amber-400">ObiChess</span>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

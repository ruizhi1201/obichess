'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { parsePGN, type ParsedGame, type AnalyzedMove, classifyMove } from '@/lib/chess-utils';
import MoveList from '@/components/MoveList';
import AnalysisPanel from '@/components/AnalysisPanel';
import ChatPanel from '@/components/ChatPanel';
import PGNUploader from '@/components/PGNUploader';

// Dynamic import — react-chessboard requires browser
const ChessBoard = dynamic(() => import('@/components/ChessBoard'), { ssr: false });

export default function AnalyzePage() {
  const [game, setGame] = useState<ParsedGame | null>(null);
  const [currentMoveIndex, setCurrentMoveIndex] = useState(-1); // -1 = starting position
  const [moves, setMoves] = useState<AnalyzedMove[]>([]);
  const [selectedMove, setSelectedMove] = useState<AnalyzedMove | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);

  const currentFen = currentMoveIndex === -1
    ? 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
    : moves[currentMoveIndex]?.fenAfter || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

  const handlePGNLoaded = useCallback(async (pgn: string) => {
    const parsed = parsePGN(pgn);
    if (!parsed) {
      alert('Invalid PGN — please check your game notation.');
      return;
    }

    setGame(parsed);
    setMoves(parsed.moves);
    setCurrentMoveIndex(-1);
    setSelectedMove(null);
    setIsAnalyzing(true);
    setAnalysisProgress(0);

    // Run Stockfish analysis on all positions
    try {
      const { analyzePosition } = await import('@/lib/stockfish');
      const analyzedMoves = [...parsed.moves];

      // First get evals for all positions (before move)
      const evals: number[] = [];
      
      for (let i = 0; i < analyzedMoves.length; i++) {
        try {
          const result = await analyzePosition(analyzedMoves[i].fenBefore, 16);
          evals.push(result.eval);
          
          setAnalysisProgress(Math.round(((i + 1) / analyzedMoves.length) * 100));
        } catch {
          evals.push(0);
        }
      }

      // Get eval after the last move too
      if (analyzedMoves.length > 0) {
        try {
          const lastResult = await analyzePosition(
            analyzedMoves[analyzedMoves.length - 1].fenAfter, 16
          );
          
          for (let i = 0; i < analyzedMoves.length; i++) {
            const evalBefore = evals[i];
            const evalAfter = i < analyzedMoves.length - 1 ? evals[i + 1] : lastResult.eval;
            
            // Get best move for this position
            const posResult = await analyzePosition(analyzedMoves[i].fenBefore, 16);
            
            analyzedMoves[i] = {
              ...analyzedMoves[i],
              evalBefore,
              evalAfter,
              bestMove: posResult.bestMove,
              classification: classifyMove(evalBefore, evalAfter, analyzedMoves[i].color),
            };
          }
        } catch {
          // fallback without last eval
        }
      }

      setMoves(analyzedMoves);
    } catch (e) {
      console.error('Stockfish analysis failed:', e);
    } finally {
      setIsAnalyzing(false);
    }
  }, []);

  const handleMoveSelect = useCallback((index: number) => {
    setCurrentMoveIndex(index);
    setSelectedMove(moves[index] || null);
  }, [moves]);

  const goToStart = () => { setCurrentMoveIndex(-1); setSelectedMove(null); };
  const goToPrev = () => {
    if (currentMoveIndex > -1) {
      const newIdx = currentMoveIndex - 1;
      setCurrentMoveIndex(newIdx);
      setSelectedMove(newIdx >= 0 ? moves[newIdx] : null);
    }
  };
  const goToNext = () => {
    if (currentMoveIndex < moves.length - 1) {
      const newIdx = currentMoveIndex + 1;
      setCurrentMoveIndex(newIdx);
      setSelectedMove(moves[newIdx]);
    }
  };
  const goToEnd = () => {
    const lastIdx = moves.length - 1;
    setCurrentMoveIndex(lastIdx);
    setSelectedMove(lastIdx >= 0 ? moves[lastIdx] : null);
  };

  const lastMove = currentMoveIndex >= 0 ? moves[currentMoveIndex] : null;

  return (
    <main className="min-h-screen flex flex-col">
      {/* Nav */}
      <nav className="border-b border-zinc-800 px-6 py-4 flex items-center justify-between shrink-0">
        <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
          <span className="text-xl">♟️</span>
          <span className="font-bold tracking-tight">Obi-Chess</span>
        </Link>
        {game && (
          <div className="text-sm text-zinc-400">
            {game.headers['White']} vs {game.headers['Black']}
            {game.headers['Event'] && <span className="ml-2 text-zinc-600">— {game.headers['Event']}</span>}
          </div>
        )}
        <Link href="/dashboard" className="text-zinc-400 hover:text-zinc-100 text-sm transition-colors">
          My Games
        </Link>
      </nav>

      <div className="flex-1 flex overflow-hidden">
        {!game ? (
          // Upload screen
          <div className="flex-1 flex items-center justify-center p-8">
            <PGNUploader onLoad={handlePGNLoaded} />
          </div>
        ) : (
          // Analysis layout
          <div className="flex-1 flex gap-0 overflow-hidden">
            {/* Left: Board + controls */}
            <div className="flex flex-col items-center justify-start p-6 gap-4 min-w-0 flex-1">
              {isAnalyzing && (
                <div className="w-full max-w-[560px] bg-zinc-900 rounded-lg p-3 text-sm text-zinc-400 flex items-center gap-3">
                  <div className="w-full bg-zinc-700 rounded-full h-1.5">
                    <div
                      className="bg-amber-500 h-1.5 rounded-full transition-all duration-300"
                      style={{ width: `${analysisProgress}%` }}
                    />
                  </div>
                  <span className="shrink-0">Analyzing {analysisProgress}%</span>
                </div>
              )}

              <div className="w-full max-w-[560px]">
                <ChessBoard
                  fen={currentFen}
                  lastMove={lastMove}
                  bestMove={lastMove?.bestMove}
                  showArrows={true}
                />
              </div>

              {/* Navigation controls */}
              <div className="flex items-center gap-2">
                <button onClick={goToStart} className="chess-nav-btn" title="Start">⏮</button>
                <button onClick={goToPrev} className="chess-nav-btn" title="Previous">◀</button>
                <span className="text-zinc-500 text-sm px-2">
                  {currentMoveIndex === -1 ? 'Start' : `Move ${Math.floor(currentMoveIndex / 2) + 1}${currentMoveIndex % 2 === 0 ? '.' : '...'}`}
                </span>
                <button onClick={goToNext} className="chess-nav-btn" title="Next">▶</button>
                <button onClick={goToEnd} className="chess-nav-btn" title="End">⏭</button>
              </div>

              {/* Chat panel below board */}
              <div className="w-full max-w-[560px]">
                <ChatPanel currentFen={currentFen} />
              </div>
            </div>

            {/* Center: Move list */}
            <div className="w-56 border-l border-r border-zinc-800 overflow-y-auto shrink-0">
              <MoveList
                moves={moves}
                currentIndex={currentMoveIndex}
                onSelectMove={handleMoveSelect}
              />
            </div>

            {/* Right: Analysis panel */}
            <div className="w-80 overflow-y-auto shrink-0">
              <AnalysisPanel
                move={selectedMove}
                currentFen={currentFen}
              />
            </div>
          </div>
        )}
      </div>

      <style jsx global>{`
        .chess-nav-btn {
          background: #27272a;
          border: 1px solid #3f3f46;
          color: #a1a1aa;
          width: 36px;
          height: 36px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          font-size: 14px;
          transition: all 0.15s;
        }
        .chess-nav-btn:hover {
          background: #3f3f46;
          color: #f4f4f5;
        }
      `}</style>
    </main>
  );
}

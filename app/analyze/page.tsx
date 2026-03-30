'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { parsePGN, type ParsedGame, type AnalyzedMove, classifyMove, cpToWinPercent } from '@/lib/chess-utils';
import MoveList from '@/components/MoveList';
import AnalysisPanel from '@/components/AnalysisPanel';
import ChatPanel from '@/components/ChatPanel';
import PGNUploader from '@/components/PGNUploader';
import EvalChart from '@/components/EvalChart';
import GameSummary from '@/components/GameSummary';
import { supabase, isUserPro } from '@/lib/supabase';
import type { User } from '@supabase/supabase-js';

// Dynamic import — react-chessboard requires browser
const ChessBoard = dynamic(() => import('@/components/ChessBoard'), { ssr: false });

const GUEST_ANALYSIS_LIMIT = 2;  // no login required
const FREE_ANALYSIS_LIMIT = 5;   // total per month (after login)

function getGuestMonthKey() {
  const d = new Date();
  return `analyses_guest_${d.getFullYear()}_${d.getMonth()}`;
}

function getUserMonthKey(userId: string) {
  const d = new Date();
  return `analyses_${userId}_${d.getFullYear()}_${d.getMonth()}`;
}

function getGuestAnalysisCount(): number {
  if (typeof window === 'undefined') return 0;
  return parseInt(localStorage.getItem(getGuestMonthKey()) || '0', 10);
}

function getUserAnalysisCount(userId: string): number {
  if (typeof window === 'undefined') return 0;
  return parseInt(localStorage.getItem(getUserMonthKey(userId)) || '0', 10);
}

function incrementGuestCount(): number {
  if (typeof window === 'undefined') return 0;
  const count = getGuestAnalysisCount() + 1;
  localStorage.setItem(getGuestMonthKey(), String(count));
  return count;
}

function incrementUserCount(userId: string): number {
  if (typeof window === 'undefined') return 0;
  const count = getUserAnalysisCount(userId) + 1;
  localStorage.setItem(getUserMonthKey(userId), String(count));
  return count;
}

// Sign-in modal component
function SignInModal({ onClose }: { onClose: () => void }) {
  const handleSignIn = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/analyze` },
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="relative bg-zinc-900 border border-zinc-700 rounded-2xl p-8 max-w-sm w-full mx-4 text-center shadow-2xl">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-zinc-500 hover:text-zinc-300 text-sm transition-colors"
          aria-label="Close"
        >
          ✕ close
        </button>

        <div className="text-4xl mb-4">♟️</div>
        <h2 className="text-xl font-bold mb-2">Keep analyzing for free</h2>
        <p className="text-zinc-400 text-sm mb-6">
          You&apos;ve used your {GUEST_ANALYSIS_LIMIT} free guest analyses. Sign in for free to get{' '}
          {FREE_ANALYSIS_LIMIT} analyses per month — no credit card needed.
        </p>

        <div className="flex flex-col gap-3">
          <button
            onClick={handleSignIn}
            className="bg-white hover:bg-zinc-100 text-zinc-900 font-semibold px-6 py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Sign in with Google
          </button>
          <Link
            href="/pricing"
            className="bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold px-6 py-3 rounded-xl transition-colors"
          >
            Upgrade to Pro →
          </Link>
        </div>

        <p className="text-zinc-600 text-xs mt-4">
          Already signed in? Refresh the page
        </p>
      </div>
    </div>
  );
}

export default function AnalyzePage() {
  const [game, setGame] = useState<ParsedGame | null>(null);
  const [currentMoveIndex, setCurrentMoveIndex] = useState(-1); // -1 = starting position
  const [moves, setMoves] = useState<AnalyzedMove[]>([]);
  const [selectedMove, setSelectedMove] = useState<AnalyzedMove | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [isPro, setIsPro] = useState<boolean | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [guestCount, setGuestCount] = useState(0);
  const [userCount, setUserCount] = useState(0);
  const [showUpgradeGate, setShowUpgradeGate] = useState(false);
  const [showSignInModal, setShowSignInModal] = useState(false);
  const [analysisComplete, setAnalysisComplete] = useState(false);
  const moveListRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setGuestCount(getGuestAnalysisCount());
    const loadUser = async () => {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (currentUser) {
        setUser(currentUser);
        setUserCount(getUserAnalysisCount(currentUser.id));
        const pro = await isUserPro(currentUser.id);
        setIsPro(pro);
      } else {
        setUser(null);
        setIsPro(false);
      }
    };
    loadUser();
  }, []);

  const currentFen = currentMoveIndex === -1
    ? 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
    : moves[currentMoveIndex]?.fenAfter || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

  const handlePGNLoaded = useCallback(async (pgn: string) => {
    // === GATING LOGIC ===
    if (isPro) {
      // Pro users: unlimited, fall through
    } else if (!user) {
      // Not logged in
      if (guestCount >= GUEST_ANALYSIS_LIMIT) {
        setShowSignInModal(true);
        return;
      }
      // Allow — will increment below
    } else {
      // Logged in, free user
      if (userCount >= FREE_ANALYSIS_LIMIT) {
        setShowUpgradeGate(true);
        return;
      }
      // Allow — will increment below
    }

    const parsed = parsePGN(pgn);
    if (!parsed) {
      alert('Invalid PGN — please check your game notation.');
      return;
    }

    // Increment the appropriate counter
    if (!isPro) {
      if (!user) {
        const newCount = incrementGuestCount();
        setGuestCount(newCount);
      } else {
        const newCount = incrementUserCount(user.id);
        setUserCount(newCount);
      }
    }

    setGame(parsed);
    setMoves(parsed.moves);
    setCurrentMoveIndex(-1);
    setSelectedMove(null);
    setIsAnalyzing(true);
    setAnalysisProgress(0);
    setAnalysisComplete(false);

    // Run Stockfish analysis on all positions
    try {
      const { analyzePosition } = await import('@/lib/stockfish');
      const analyzedMoves = [...parsed.moves];

      // Single pass — one Stockfish call per position (gets both eval AND bestMove)
      const results: Awaited<ReturnType<typeof analyzePosition>>[] = [];

      for (let i = 0; i < analyzedMoves.length; i++) {
        try {
          const result = await analyzePosition(analyzedMoves[i].fenBefore, 16);
          results.push(result);
          setAnalysisProgress(Math.round(((i + 1) / (analyzedMoves.length + 1)) * 100));
        } catch {
          results.push({ bestMove: '', eval: 0, depth: 0, pv: '', mate: null });
        }
      }

      // Get eval after last move
      let lastEval = 0;
      try {
        const lastResult = await analyzePosition(analyzedMoves[analyzedMoves.length - 1].fenAfter, 16);
        lastEval = lastResult.eval;
      } catch {}

      // Build analyzedMoves with win%
      if (analyzedMoves.length > 0) {
        for (let i = 0; i < analyzedMoves.length; i++) {
          const evalBefore = results[i].eval;
          const evalAfter = i < analyzedMoves.length - 1 ? results[i + 1].eval : lastEval;

          let mate: number | null = null;
          if (Math.abs(evalAfter) >= 900) {
            mate = evalAfter > 0 ? Math.ceil(1000 - evalAfter) : -Math.ceil(1000 + evalAfter);
          }

          analyzedMoves[i] = {
            ...analyzedMoves[i],
            evalBefore,
            evalAfter,
            winPercentBefore: cpToWinPercent(evalBefore),
            winPercentAfter: cpToWinPercent(evalAfter),
            mate,
            bestMove: results[i].bestMove,
            classification: classifyMove(evalBefore, evalAfter, analyzedMoves[i].color),
          };
        }
      }

      setMoves(analyzedMoves);
      setAnalysisComplete(true);
    } catch (e) {
      console.error('Stockfish analysis failed:', e);
    } finally {
      setIsAnalyzing(false);
    }
  }, [isPro, user, guestCount, userCount]);

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

  const whiteName = game?.headers['White'] || 'White';
  const blackName = game?.headers['Black'] || 'Black';

  const handleStartReview = useCallback(() => {
    // Jump to first move and scroll move list into view
    if (moves.length > 0) {
      setCurrentMoveIndex(0);
      setSelectedMove(moves[0]);
    }
    moveListRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [moves]);

  // Compute remaining analyses hint for the upload screen
  const remainingHint = (() => {
    if (isPro) return null;
    if (!user) {
      const remaining = GUEST_ANALYSIS_LIMIT - guestCount;
      if (remaining <= 0) return null; // modal will show instead
      return `${remaining} free guest ${remaining === 1 ? 'analysis' : 'analyses'} remaining · Sign in for ${FREE_ANALYSIS_LIMIT}/month`;
    }
    const remaining = FREE_ANALYSIS_LIMIT - userCount;
    if (remaining <= 0) return null;
    return `${remaining} free ${remaining === 1 ? 'analysis' : 'analyses'} remaining this month`;
  })();

  return (
    <main className="min-h-screen flex flex-col">
      {/* Sign-in modal */}
      {showSignInModal && <SignInModal onClose={() => setShowSignInModal(false)} />}

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
        {showUpgradeGate ? (
          // Upgrade prompt for free users who hit limit
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="max-w-md w-full text-center">
              <div className="text-5xl mb-4">🔒</div>
              <h2 className="text-2xl font-bold mb-2">Monthly limit reached</h2>
              <p className="text-zinc-400 mb-2">
                Free accounts get {FREE_ANALYSIS_LIMIT} game analyses per month.
              </p>
              <p className="text-zinc-400 mb-8">
                Upgrade to Pro for unlimited analyses, AI voice coaching, and more.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Link
                  href="/pricing"
                  className="bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold px-6 py-3 rounded-xl transition-colors"
                >
                  Upgrade to Pro →
                </Link>
                <button
                  onClick={() => setShowUpgradeGate(false)}
                  className="border border-zinc-700 hover:border-zinc-500 text-zinc-300 px-6 py-3 rounded-xl transition-colors"
                >
                  Maybe later
                </button>
              </div>
            </div>
          </div>
        ) : !game ? (
          // Upload screen
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="w-full max-w-2xl">
              {!isPro && remainingHint && (
                <div className="mb-4 text-center">
                  <span className="text-sm text-zinc-500">
                    {remainingHint}
                    {' · '}
                    <Link href="/pricing" className="text-amber-400 hover:underline">Upgrade for unlimited</Link>
                  </span>
                </div>
              )}
              <PGNUploader onLoad={handlePGNLoaded} />
            </div>
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

              {/* Eval chart — shows after analysis has any winPercent data */}
              {moves.some(m => m.winPercentAfter !== undefined) && (
                <div className="w-full max-w-[560px]">
                  <EvalChart
                    moves={moves}
                    currentIndex={currentMoveIndex}
                    onSelectMove={handleMoveSelect}
                  />
                </div>
              )}

              {/* Chat panel below board */}
              <div className="w-full max-w-[560px]">
                <ChatPanel currentFen={currentFen} />
              </div>
            </div>

            {/* Center: Move list */}
            <div ref={moveListRef} className="w-56 border-l border-r border-zinc-800 overflow-y-auto shrink-0">
              <MoveList
                moves={moves}
                currentIndex={currentMoveIndex}
                onSelectMove={handleMoveSelect}
              />
            </div>

            {/* Right: Game Summary (after analysis) or Analysis Panel (during review) */}
            <div className="w-80 overflow-y-auto shrink-0">
              {analysisComplete && !selectedMove ? (
                <GameSummary
                  moves={moves}
                  whiteName={whiteName ?? 'White'}
                  blackName={blackName ?? 'Black'}
                  currentMoveIndex={currentMoveIndex}
                  onSelectMove={handleMoveSelect}
                  onStartReview={handleStartReview}
                />
              ) : (
                <AnalysisPanel
                  move={selectedMove}
                  currentFen={currentFen}
                />
              )}
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

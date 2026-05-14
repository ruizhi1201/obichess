'use client';

import { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { Chess } from 'chess.js';
import { parsePGN, type ParsedGame, type AnalyzedMove, type MoveInsight, classifyMove, cpToWinPercent } from '@/lib/chess-utils';
import { analyzeGame } from '@/lib/game-analysis-client';
import { evaluateMaterial, materialDelta } from '@/lib/material';
import { detectTactics, isInTactic, detectPatterns } from '@/lib/tactics';
import { detectTrap } from '@/lib/trap-engine';
import MoveNotation from '@/components/MoveNotation';
import CoachPanel from '@/components/CoachPanel';
import PGNUploader from '@/components/PGNUploader';
import EvalChart from '@/components/EvalChart';
import GameSummary from '@/components/GameSummary';
import PlayerProfileModal from '@/components/PlayerProfileModal';
import { supabase, isUserPro } from '@/lib/supabase';
import type { User } from '@supabase/supabase-js';
import { type PlayerProfile } from '@/lib/player-profiles';

const ChessBoard = dynamic(() => import('@/components/ChessBoard'), { ssr: false });

const GUEST_ANALYSIS_LIMIT = 2;
const FREE_ANALYSIS_LIMIT = 5;

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

// ── Modals ──────────────────────────────────────────────────────────────────

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
        <button onClick={onClose} className="absolute top-4 right-4 text-zinc-500 hover:text-zinc-300 text-sm">✕ close</button>
        <div className="text-4xl mb-4">♟️</div>
        <h2 className="text-xl font-bold mb-2">Keep analyzing for free</h2>
        <p className="text-zinc-400 text-sm mb-6">
          You&apos;ve used your {GUEST_ANALYSIS_LIMIT} free guest analyses. Sign in for free to get{' '}
          {FREE_ANALYSIS_LIMIT} analyses per month — no credit card needed.
        </p>
        <div className="flex flex-col gap-3">
          <button
            onClick={handleSignIn}
            className="bg-white hover:bg-zinc-100 text-zinc-900 font-semibold px-6 py-3 rounded-xl flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Sign in with Google
          </button>
          <Link href="/pricing" className="bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold px-6 py-3 rounded-xl text-center">
            Upgrade to Pro →
          </Link>
        </div>
        <p className="text-zinc-600 text-xs mt-4">Already signed in? Refresh the page</p>
      </div>
    </div>
  );
}

// Ask which color the user played
function ColorPickerModal({ onSelect, whiteName, blackName }: {
  onSelect: (color: 'w' | 'b') => void;
  whiteName: string;
  blackName: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-8 max-w-sm w-full mx-4 text-center shadow-2xl">
        <div className="text-4xl mb-4">♟️</div>
        <h2 className="text-xl font-bold mb-2">Which side are you?</h2>
        <p className="text-zinc-400 text-sm mb-6">
          Obi will analyze the game from your perspective.
        </p>
        <div className="flex gap-4 justify-center">
          <button
            onClick={() => onSelect('w')}
            className="flex flex-col items-center gap-2 bg-white hover:bg-zinc-100 text-zinc-900 font-bold px-8 py-5 rounded-2xl transition-colors"
          >
            <span className="text-4xl">♔</span>
            <span>{whiteName}</span>
          </button>
          <button
            onClick={() => onSelect('b')}
            className="flex flex-col items-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 font-bold px-8 py-5 rounded-2xl transition-colors border border-zinc-600"
          >
            <span className="text-4xl">♚</span>
            <span>{blackName}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// Full-screen loading overlay
function AnalyzingOverlay({ progress }: { progress: number }) {
  return (
    <div className="fixed inset-0 z-40 flex flex-col items-center justify-center bg-black/75 backdrop-blur-sm">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 max-w-sm w-full mx-4 text-center shadow-2xl">
        <div className="text-4xl mb-4 animate-pulse">⚙️</div>
        <h2 className="text-xl font-bold mb-1">Analyzing your game</h2>
        <p className="text-zinc-400 text-sm mb-6">Stockfish is reviewing every move...</p>
        <div className="w-full bg-zinc-700 rounded-full h-3 mb-2">
          <div
            className="bg-amber-500 h-3 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-zinc-400 text-sm font-mono">{progress}%</p>
      </div>
    </div>
  );
}

// Vertical win bar alongside the board
function VerticalWinBar({ moves, currentIndex, userColor, overrideEval }: {
  moves: AnalyzedMove[];
  currentIndex: number;
  userColor: 'w' | 'b';
  overrideEval?: number | null; // used in explore mode
}) {
  const move = currentIndex >= 0 ? moves[currentIndex] : null;
  const evalScore = overrideEval ?? move?.evalAfter ?? 0;
  const clampedEval = Math.max(-600, Math.min(600, evalScore));
  // whitePercent = how much white is winning (top = white side)
  const whitePercent = 50 + (clampedEval / 600) * 50;

  // If user is black, flip so their color is at bottom

  return (
    <div className="flex flex-col items-center gap-1 h-full py-1 select-none">
      <span className="text-xs text-zinc-500">{userColor === 'w' ? '♚' : '♔'}</span>
      <div className="flex-1 w-4 bg-zinc-700 rounded-full overflow-hidden flex flex-col relative">
        {/* When user=white: black section at top, white fills from bottom */}
        {/* When user=black: white section at top, black fills from bottom */}
        {userColor === 'w' ? (
          <>
            <div className="w-full bg-zinc-900" style={{ height: `${100 - whitePercent}%` }} />
            <div className="w-full bg-white transition-all duration-500 flex-1" />
          </>
        ) : (
          <>
            <div className="w-full bg-white transition-all duration-500" style={{ height: `${whitePercent}%` }} />
            <div className="w-full bg-zinc-900 flex-1" />
          </>
        )}
      </div>
      <span className="text-xs text-zinc-500">{userColor === 'w' ? '♔' : '♚'}</span>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function AnalyzePage() {
  const [game, setGame] = useState<ParsedGame | null>(null);
  const [currentMoveIndex, setCurrentMoveIndex] = useState(-1);
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
  const [pendingPGN, setPendingPGN] = useState<string | null>(null);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [userColor, setUserColor] = useState<'w' | 'b'>('w');
  const [playerProfile, setPlayerProfile] = useState<PlayerProfile | null>(null);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [pendingWhiteName, setPendingWhiteName] = useState('White');
  const [pendingBlackName, setPendingBlackName] = useState('Black');
  const [trainingFocus, setTrainingFocus] = useState<string | undefined>(undefined);
  const [exploreMode, setExploreMode] = useState(false);
  const [exploreFen, setExploreFen] = useState<string | null>(null);
  const [exploreMoveEval, setExploreMoveEval] = useState<{ eval: number; bestMove: string } | null>(null);
  const [exploreLastMoveSan, setExploreLastMoveSan] = useState<string | null>(null);
  const [exploreBranch, setExploreBranch] = useState<{ san: string; eval: number | null }[]>([]); // branch notation
  const [explanationCache, setExplanationCache] = useState<Map<string, MoveInsight>>(new Map());
  const [gameInsights, setGameInsights] = useState<{ greeting: string; wellDone: string; improve: string; topics: string } | null>(null);


  useEffect(() => {
    setGuestCount(getGuestAnalysisCount());
    const loadUser = async () => {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (currentUser) {
        setUser(currentUser);
        setUserCount(getUserAnalysisCount(currentUser.id));
        setIsPro(await isUserPro(currentUser.id));
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

  // Step 1: PGN loaded → check gates → show profile modal
  const handlePGNLoaded = useCallback(async (pgn: string, focus?: string) => {
    if (isPro) {
      // fall through
    } else if (!user) {
      if (guestCount >= GUEST_ANALYSIS_LIMIT) { setShowSignInModal(true); return; }
    } else {
      if (userCount >= FREE_ANALYSIS_LIMIT) { setShowUpgradeGate(true); return; }
    }
    setPendingPGN(pgn);
    setTrainingFocus(focus);
    setShowProfileModal(true);
  }, [isPro, user, guestCount, userCount]);

  // Step 1b: Profile selected → show color picker (extract names from PGN)
  const handleProfileSelected = useCallback((profile: PlayerProfile) => {
    setPlayerProfile(profile);
    setShowProfileModal(false);
    // Parse PGN headers to get player names for the color picker
    if (pendingPGN) {
      const parsed = parsePGN(pendingPGN);
      const wName = parsed?.headers['White'] || 'White';
      const bName = parsed?.headers['Black'] || 'Black';
      // Store names for color picker
      setPendingWhiteName(wName);
      setPendingBlackName(bName);
    }
    setShowColorPicker(true);
  }, [pendingPGN]);

  // Step 2: Color picked → run analysis
  const handleColorSelected = useCallback(async (color: 'w' | 'b') => {
    setUserColor(color);
    setShowColorPicker(false);
    if (!pendingPGN) return;

    const parsed = parsePGN(pendingPGN);
    if (!parsed) { alert('Invalid PGN — please check your game notation.'); return; }

    if (!isPro) {
      if (!user) { const c = incrementGuestCount(); setGuestCount(c); }
      else { const c = incrementUserCount(user.id); setUserCount(c); }
    }

    setGame(parsed);
    setMoves(parsed.moves);
    setCurrentMoveIndex(-1);
    setSelectedMove(null);
    setIsAnalyzing(true);
    setAnalysisProgress(0);
    setAnalysisComplete(false);

    try {
      const { analyzePosition } = await import('@/lib/stockfish');
      const analyzedMoves = [...parsed.moves];
      const results: Awaited<ReturnType<typeof analyzePosition>>[] = [];

      for (let i = 0; i < analyzedMoves.length; i++) {
        try {
          const result = await analyzePosition(analyzedMoves[i].fenBefore, 22);
          results.push(result);
          setAnalysisProgress(Math.round(((i + 1) / (analyzedMoves.length + 1)) * 100));
        } catch {
          results.push({ bestMove: '', eval: 0, depth: 0, pv: '', mate: null });
        }
      }

      let lastEval = 0;
      try {
        const lastResult = await analyzePosition(analyzedMoves[analyzedMoves.length - 1].fenAfter, 22);
        lastEval = lastResult.eval;
      } catch {}

      if (analyzedMoves.length > 0) {
        for (let i = 0; i < analyzedMoves.length; i++) {
          const evalBefore = results[i].eval;
          const evalAfter = i < analyzedMoves.length - 1 ? results[i + 1].eval : lastEval;
          let mate: number | null = null;
          if (Math.abs(evalAfter) >= 900) {
            mate = evalAfter > 0 ? Math.ceil(1000 - evalAfter) : -Math.ceil(1000 + evalAfter);
          }

          // Material analysis
          const matBefore = evaluateMaterial(analyzedMoves[i].fenBefore);
          const matAfter = evaluateMaterial(analyzedMoves[i].fenAfter);
          const matDelta = materialDelta(analyzedMoves[i].fenBefore, analyzedMoves[i].fenAfter, analyzedMoves[i].color);

          analyzedMoves[i] = {
            ...analyzedMoves[i],
            evalBefore,
            evalAfter,
            winPercentBefore: cpToWinPercent(evalBefore),
            winPercentAfter: cpToWinPercent(evalAfter),
            mate,
            bestMove: results[i].bestMove,
            classification: classifyMove(evalBefore, evalAfter, analyzedMoves[i].color),
            materialBefore: matBefore.advantage,
            materialAfter: matAfter.advantage,
            capturedPiece: matDelta.capturedPiece,
          };
        }

        // Tactic detection
        const tacticInput = analyzedMoves.map((m, idx) => ({
          fenBefore: m.fenBefore,
          fenAfter: m.fenAfter,
          san: m.san,
          color: m.color,
          evalBefore: m.evalBefore!,
          evalAfter: m.evalAfter!,
          moveIndex: idx,
        }));
        const tactics = detectTactics(tacticInput);

        // Annotate moves inside tactics
        for (let i = 0; i < analyzedMoves.length; i++) {
          const tactic = isInTactic(i, tactics);
          if (tactic) {
            analyzedMoves[i].inTactic = tactic.summary;
          }
        }

        // ── Pattern detection: board-level tactical patterns ──
        for (let i = 0; i < analyzedMoves.length; i++) {
          const m = analyzedMoves[i];
          const patterns = detectPatterns(m.fenBefore, m.fenAfter, m.color, m.uci);
          if (patterns.length > 0) {
            analyzedMoves[i].tacticalPatterns = patterns.map(p => p.pattern);
            // Check for subtle traps (good move + patterns + small eval swing)
            const trap = detectTrap(m, patterns);
            if (trap) {
              analyzedMoves[i].isTrap = true;
              analyzedMoves[i].trapDescription = trap.description;
            }
          }
        }
      }

      setMoves(analyzedMoves);
      setAnalysisComplete(true);
      setIsAnalyzing(false); // ← unblock UI immediately after Stockfish is done

      // ── Opening Explorer: fetch top 3 variations for first 10 half-moves ──
      (async () => {
        const { fetchOpeningExplorer } = await import('@/lib/opening-explorer');
        const enriched = [...analyzedMoves];
        let updates = 0;
        for (let i = 0; i < Math.min(10, enriched.length); i++) {
          try {
            const result = await fetchOpeningExplorer(enriched[i].fenBefore);
            if (result && result.total > 0) {
              enriched[i] = { ...enriched[i], openingExplorer: result };
              updates++;
            }
          } catch { /* skip on error */ }
        }
        if (updates > 0) {
          setMoves(enriched);
          // Also update explanation cache with opening data
          const cacheWithOpenings = new Map<string, MoveInsight>(explanationCache);
          for (let i = 0; i < enriched.length; i++) {
            const m = enriched[i];
            if (m.openingExplorer && m.openingExplorer.topMoves.length > 0) {
              const existing = cacheWithOpenings.get(m.uci);
              if (existing && !existing.opening) {
                cacheWithOpenings.set(m.uci, {
                  ...existing,
                  opening: {
                    name: `Position stats: ${m.openingExplorer.total.toLocaleString()} games`,
                    continuations: m.openingExplorer.topMoves.map(
                      mv => `${mv.san} (W:${mv.whiteRate.toFixed(0)}% B:${mv.blackRate.toFixed(0)}% D:${mv.drawRate.toFixed(0)}%)`
                    ),
                  },
                });
              }
            }
          }
          setExplanationCache(cacheWithOpenings);
        }
      })();

      // ── Single AI call: generates BOTH game summary + per-move notes ──
      const { getSkillStep } = await import('@/lib/player-profiles');
      const skillPayload = playerProfile
        ? (() => {
            const s = getSkillStep(playerProfile.uscfEquivalent);
            return { skillStep: { step: s.step, label: s.label, uscfEquivalent: playerProfile.uscfEquivalent }, focusAreas: s.focusAreas };
          })()
        : {};

      (async () => {
        try {
          console.log('[AI] Starting game analysis...');
          const result = await analyzeGame({
            moves: analyzedMoves.map((m, i) => ({
              moveIndex: i,
              moveNumber: m.moveNumber,
              color: m.color,
              san: m.san,
              uci: m.uci,
              classification: m.classification ?? 'unknown',
              bestMoveSan: m.bestMoveSan,
              winPercentBefore: m.winPercentBefore,
              winPercentAfter: m.winPercentAfter,
              evalBefore: m.evalBefore,
              evalAfter: m.evalAfter,
              tacticalPatterns: m.tacticalPatterns,
              isTrap: m.isTrap,
              trapDescription: m.trapDescription,
            })),
            userColor: color,
            whiteName: parsed.headers['White'] || 'White',
            blackName: parsed.headers['Black'] || 'Black',
            trainingFocus,
            ...skillPayload,
          });
          
          console.log('[AI] Result received. gameSummary:', !!result.gameSummary, 'moveNotes:', Object.keys(result.moveNotes||{}).length);
          if (result.gameSummary) {
            setGameInsights(result.gameSummary);
          }
          
          if (result.moveNotes) {
            const cache = new Map<string, MoveInsight>(explanationCache);
            for (const [idxStr, note] of Object.entries(result.moveNotes)) {
              const idx = parseInt(idxStr, 10);
              if (idx >= 0 && idx < analyzedMoves.length) {
                const m = analyzedMoves[idx];
                const n = note as any;
                cache.set(m.uci, {
                  explanation: n.explanation || '',
                  winOddsChange: m.winPercentAfter !== undefined && m.winPercentBefore !== undefined
                    ? `${((userColor === 'b' ? (100 - m.winPercentAfter) : m.winPercentAfter) - (userColor === 'b' ? (100 - m.winPercentBefore) : m.winPercentBefore)).toFixed(1)}%`
                    : '0.0%',
                  alternatives: [],
                  opening: n.opening || undefined,
                });
              }
            }
            // Fill remaining moves with auto-generated explanations from eval data
            for (let i = 0; i < analyzedMoves.length; i++) {
              const m = analyzedMoves[i];
              if (!cache.has(m.uci)) {
                const wpBefore = userColor === 'b' ? (100 - (m.winPercentBefore ?? 50)) : (m.winPercentBefore ?? 50);
                const wpAfter = userColor === 'b' ? (100 - (m.winPercentAfter ?? 50)) : (m.winPercentAfter ?? 50);
                const delta = wpAfter - wpBefore;
                let explanation = '';
                if (m.trapDescription) {
                  explanation = m.trapDescription;
                } else if (m.tacticalPatterns && m.tacticalPatterns.length > 0) {
                  const p = m.tacticalPatterns[0];
                  if (p === 'fork') explanation = 'A fork! Your piece attacks two opponent pieces.';
                  else if (p === 'pin') explanation = 'A pin restricts the opponent\'s mobility.';
                  else if (p === 'discovered') explanation = 'A discovered attack unleashes hidden pressure.';
                  else if (p === 'skewer') explanation = 'A skewer forces the opponent to lose material.';
                  else if (p === 'hanging') explanation = 'An opponent piece is undefended — free capture!';
                  else explanation = 'Tactical opportunity present.';
                } else if (m.classification === 'best') explanation = 'Solid move, maintains the position.';
                else if (m.classification === 'good') explanation = 'Good developing move.';
                else if (m.classification === 'inaccuracy') explanation = 'A slight inaccuracy.';
                else if (m.classification === 'mistake' || m.classification === 'blunder') explanation = 'This cost some advantage.';
                else explanation = 'Position is stable.';
                cache.set(m.uci, {
                  explanation,
                  winOddsChange: `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}%`,
                  alternatives: [],
                });
              }
            }
            setExplanationCache(cache);
          }
        } catch (e) {
          console.error('AI game analysis failed:', e);
        }
      })();
    } catch (e) {
      console.error('Stockfish analysis failed:', e);
      setIsAnalyzing(false);
    }
  }, [pendingPGN, isPro, user, playerProfile]);

  const handleMoveSelect = useCallback((index: number) => {
    setCurrentMoveIndex(index);
    setSelectedMove(moves[index] || null);
  }, [moves]);

  const goToStart = () => { setCurrentMoveIndex(-1); setSelectedMove(null); };
  const goToPrev = () => {
    if (currentMoveIndex > -1) {
      const i = currentMoveIndex - 1;
      setCurrentMoveIndex(i);
      setSelectedMove(i >= 0 ? moves[i] : null);
    }
  };
  const goToNext = () => {
    if (currentMoveIndex < moves.length - 1) {
      const i = currentMoveIndex + 1;
      setCurrentMoveIndex(i);
      setSelectedMove(moves[i]);
    }
  };
  const goToEnd = () => {
    const i = moves.length - 1;
    setCurrentMoveIndex(i);
    setSelectedMove(i >= 0 ? moves[i] : null);
  };

  const lastMove = currentMoveIndex >= 0 ? moves[currentMoveIndex] : null;
  const whiteName = game?.headers['White'] || 'White';
  const blackName = game?.headers['Black'] || 'Black';

  const handleStartReview = useCallback(() => {
    if (moves.length > 0) { setCurrentMoveIndex(0); setSelectedMove(moves[0]); }
  }, [moves]);

  const handleExploreToggle = useCallback(() => {
    if (exploreMode) {
      setExploreMode(false);
      setExploreFen(null);
      setExploreMoveEval(null);
      setExploreLastMoveSan(null);
      setExploreBranch([]);
    } else {
      setExploreMode(true);
      setExploreFen(null);
      setExploreMoveEval(null);
      setExploreLastMoveSan(null);
      setExploreBranch([]);
    }
  }, [exploreMode]);

  const handleExploreMove = useCallback(async (from: string, to: string): Promise<boolean> => {
    const baseFen = exploreFen ?? currentFen;
    try {
      const chess = new Chess(baseFen);
      // Reject if the piece being moved doesn't belong to the current turn
      const piece = chess.get(from as Parameters<typeof chess.get>[0]);
      if (!piece || piece.color !== chess.turn()) {
        return false; // wrong color — illegal in chess
      }

      const result = chess.move({ from, to, promotion: 'q' });
      if (!result) return false;
      const newFen = chess.fen();
      setExploreFen(newFen);
      setExploreLastMoveSan(result.san);
      let evalResult: number | null = null;
      try {
        const { analyzePosition } = await import('@/lib/stockfish');
        const analysis = await analyzePosition(newFen, 14);
        setExploreMoveEval({ eval: analysis.eval, bestMove: analysis.bestMove });
        evalResult = analysis.eval;
      } catch {
        // ignore stockfish errors
      }
      setExploreBranch(prev => [...prev, { san: result.san, eval: evalResult }]);
      return true;
    } catch {
      return false;
    }
  }, [exploreFen, currentFen]);

  const remainingHint = (() => {
    if (isPro) return null;
    if (!user) {
      const r = GUEST_ANALYSIS_LIMIT - guestCount;
      if (r <= 0) return null;
      return `${r} free guest ${r === 1 ? 'analysis' : 'analyses'} remaining · Sign in for ${FREE_ANALYSIS_LIMIT}/month`;
    }
    const r = FREE_ANALYSIS_LIMIT - userCount;
    if (r <= 0) return null;
    return `${r} free ${r === 1 ? 'analysis' : 'analyses'} remaining this month`;
  })();

  return (
    <main className="h-screen flex flex-col overflow-hidden">
      {/* Modals */}
      {showSignInModal && <SignInModal onClose={() => setShowSignInModal(false)} />}
      {showProfileModal && (
        <PlayerProfileModal
          onSelect={handleProfileSelected}
          onClose={() => setShowProfileModal(false)}
        />
      )}
      {showColorPicker && (
        <ColorPickerModal
          onSelect={handleColorSelected}
          whiteName={pendingWhiteName}
          blackName={pendingBlackName}
        />
      )}
      {isAnalyzing && <AnalyzingOverlay progress={analysisProgress} />}

      {/* Nav */}
      <nav className="border-b border-zinc-800 px-6 py-4 flex items-center justify-between shrink-0">
        <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
          <span className="text-xl">♟️</span>
          <span className="font-bold tracking-tight">Obi-Chess</span>
        </Link>
        {game && (
          <div className="text-sm text-zinc-400 flex items-center gap-3">
            <span>{game.headers['White']} vs {game.headers['Black']}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full ${userColor === 'w' ? 'bg-white/10 text-white' : 'bg-zinc-700 text-zinc-300'}`}>
              You: {userColor === 'w' ? '♔ White' : '♚ Black'}
            </span>
          </div>
        )}
        <div className="flex items-center gap-4">
          {!user && (
            <Link href="/signup" className="text-amber-400 hover:text-amber-300 text-sm font-medium transition-colors">
              Sign In
            </Link>
          )}
          <Link href="/dashboard" className="text-zinc-400 hover:text-zinc-100 text-sm transition-colors">
            My Games
          </Link>
        </div>
      </nav>

      <div className="flex-1 flex overflow-hidden min-h-0">
        {showUpgradeGate ? (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="max-w-md w-full text-center">
              <div className="text-5xl mb-4">🔒</div>
              <h2 className="text-2xl font-bold mb-2">Monthly limit reached</h2>
              <p className="text-zinc-400 mb-2">Free accounts get {FREE_ANALYSIS_LIMIT} game analyses per month.</p>
              <p className="text-zinc-400 mb-8">Upgrade to Pro for unlimited analyses, AI voice coaching, and more.</p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Link href="/pricing" className="bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold px-6 py-3 rounded-xl">Upgrade to Pro →</Link>
                <button onClick={() => setShowUpgradeGate(false)} className="border border-zinc-700 hover:border-zinc-500 text-zinc-300 px-6 py-3 rounded-xl">Maybe later</button>
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
                    {remainingHint} · <Link href="/pricing" className="text-amber-400 hover:underline">Upgrade for unlimited</Link>
                  </span>
                </div>
              )}
              <PGNUploader onLoad={handlePGNLoaded} />
            </div>
          </div>
        ) : (
          // ── Main analysis layout: LEFT | RIGHT (notation under board) ──
          <div className="flex-1 flex overflow-hidden h-full min-h-0">

            {/* LEFT: Board + win bar + notation + controls */}
            <div className="flex flex-col items-center justify-start p-4 gap-3 w-1/2 min-w-0 overflow-hidden flex-shrink-0">
              {/* Board row: win bar + chessboard */}
              <div className="flex gap-3 w-full items-center justify-center">
                {/* Vertical win bar */}
                <div style={{ height: 480, width: 20 }} className="shrink-0">
                  <VerticalWinBar
                    moves={moves}
                    currentIndex={currentMoveIndex}
                    userColor={userColor}
                    overrideEval={exploreMode && exploreMoveEval ? exploreMoveEval.eval : null}
                  />
                </div>

                {/* Chessboard */}
                <div className="flex-1 max-w-[480px]">
                  <ChessBoard
                    fen={exploreMode ? (exploreFen ?? currentFen) : currentFen}
                    lastMove={exploreMode ? null : lastMove}
                    bestMove={exploreMode ? undefined : lastMove?.bestMove}
                    showArrows={!exploreMode}
                    onMove={exploreMode ? handleExploreMove : undefined}
                    boardOrientation={userColor === 'b' ? 'black' : 'white'}
                  />
                </div>
              </div>

              {/* Explore mode: banner + branch notation + eval */}
              {exploreMode && (
                <div className="w-full max-w-[500px] flex flex-col gap-2">
                  {/* Header bar */}
                  <div className="bg-violet-900/40 border border-violet-700 rounded-lg px-3 py-2 flex items-center justify-between text-sm">
                    <span className="text-violet-200">🔍 Explore mode — drag pieces to test ideas.</span>
                    <button onClick={handleExploreToggle} className="text-violet-400 hover:text-violet-200 font-bold ml-2 text-xs border border-violet-600 rounded px-2 py-0.5">✕ Back</button>
                  </div>

                  {/* Branch notation — shows moves played in explore mode */}
                  {exploreBranch.length > 0 && (
                    <div className="bg-zinc-900 border border-violet-800/50 rounded-lg px-3 py-2">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[10px] text-violet-400 font-semibold uppercase tracking-wider">Explore branch</span>
                        <button
                          onClick={() => { setExploreBranch([]); setExploreFen(null); setExploreMoveEval(null); setExploreLastMoveSan(null); }}
                          className="text-[10px] text-zinc-500 hover:text-red-400 transition-colors"
                        >
                          🗑 Clear branch
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {exploreBranch.map((m, i) => {
                          const wp = m.eval !== null ? (50 + Math.max(-50, Math.min(50, m.eval / 12))) : null;
                          const evalStr = m.eval !== null ? `${m.eval >= 0 ? '+' : ''}${(m.eval / 100).toFixed(1)}` : '';
                          return (
                            <span key={i} className="inline-flex items-center gap-1 bg-zinc-800 border border-violet-800/30 rounded px-1.5 py-0.5 text-xs">
                              <span className="text-violet-300 font-mono font-bold">{m.san}</span>
                              {evalStr && <span className="text-amber-400 text-[10px]">{evalStr}</span>}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Stockfish eval for last explore move */}
                  {exploreMoveEval && (
                    <div className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm font-mono text-zinc-300 flex items-center gap-2">
                      <span className="text-violet-300 font-bold">{exploreLastMoveSan}</span>
                      <span className="text-zinc-500">→</span>
                      <span>Stockfish: <span className="text-amber-400 font-bold">{exploreMoveEval.eval >= 0 ? '+' : ''}{(exploreMoveEval.eval / 100).toFixed(2)}</span></span>
                      {exploreMoveEval.bestMove && (
                        <span className="text-zinc-400 text-xs">Best: <span className="text-green-400">{exploreMoveEval.bestMove}</span></span>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Notation strip — under board, full width */}
              {!exploreMode && (
                <div className="w-full max-w-[500px]">
                  <MoveNotation
                    moves={moves}
                    currentIndex={currentMoveIndex}
                    onSelectMove={handleMoveSelect}
                  />
                </div>
              )}

              {/* Nav controls */}
              <div className="flex items-center gap-2">
                {!exploreMode && (
                  <>
                    <button onClick={goToStart} className="chess-nav-btn" title="Start">⏮</button>
                    <button onClick={goToPrev} className="chess-nav-btn" title="Previous">◀</button>
                    <span className="text-zinc-500 text-sm px-2">
                      {currentMoveIndex === -1 ? 'Start' : `Move ${Math.floor(currentMoveIndex / 2) + 1}${currentMoveIndex % 2 === 0 ? '.' : '...'}`}
                    </span>
                    <button onClick={goToNext} className="chess-nav-btn" title="Next">▶</button>
                    <button onClick={goToEnd} className="chess-nav-btn" title="End">⏭</button>
                  </>
                )}
                <button
                  onClick={handleExploreToggle}
                  className={`chess-nav-btn px-3 text-sm ${exploreMode ? 'bg-violet-700 border-violet-500 text-white' : ''}`}
                  title="Explore mode"
                  style={{ width: 'auto' }}
                >
                  🔍 Explore
                </button>
              </div>
            </div>

            {/* RIGHT: Eval chart + Coach panel (unified) */}
            <div className="flex flex-col w-1/2 min-w-0 overflow-hidden h-full border-l border-zinc-800">
              {/* EvalChart — top of right panel */}
              {moves.some(m => m.winPercentAfter !== undefined) && (
                <div className="p-3 pb-0 shrink-0">
                  <EvalChart
                    moves={moves}
                    currentIndex={currentMoveIndex}
                    onSelectMove={handleMoveSelect}
                    whiteName={whiteName ?? 'White'}
                    blackName={blackName ?? 'Black'}
                  />
                </div>
              )}

              {/* Game summary OR coach panel */}
              <div className="flex-1 overflow-hidden min-h-0">
                {analysisComplete && !selectedMove ? (
                  <GameSummary
                    moves={moves}
                    whiteName={whiteName ?? 'White'}
                    blackName={blackName ?? 'Black'}
                    currentMoveIndex={currentMoveIndex}
                    onSelectMove={handleMoveSelect}
                    onStartReview={handleStartReview}
                    userColor={userColor}
                    playerProfile={playerProfile}
                    trainingFocus={trainingFocus}
                    precomputedInsights={gameInsights}
                  />
                ) : (
                  <CoachPanel
                    move={selectedMove}
                    currentFen={currentFen}
                    userColor={userColor}
                    playerProfile={playerProfile}
                    insightCache={explanationCache}
                  />
                )}
              </div>
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

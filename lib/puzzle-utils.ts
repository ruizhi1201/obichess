/**
 * Puzzle extraction & difficulty rating utilities.
 *
 * Puzzle candidates are identified from analyzed game data,
 * scored by tactical significance, filtered by ELO range,
 * and returned as shareable puzzle objects.
 */

import type { AnalyzedMove } from './chess-utils';

// ── Types ──────────────────────────────────────────────

export interface PuzzleCandidate {
  fen: string;
  solution: string[]; // UCI moves
  san: string;
  playerName: string;
  playerElo: number;
  opponentName: string;
  moveNumber: number;
  score: number;
  difficulty: number; // 1–5 stars
  difficultyScore: number; // actual ELO estimate
  cpSwing: number;
  isTactical: boolean;
  isCheck: boolean;
  pattern?: string; // fork, pin, discovered, etc.
}

export interface Puzzle {
  id?: string;
  fen: string;
  solution: string[];
  playerName: string;
  playerElo: number;
  difficulty: number;
  difficultyScore: number;
  opponentName: string;
  tournament?: string;
  explanation: string;
  gameId?: string;
  creatorUserId?: string;
}

// ── Constants ──────────────────────────────────────────

/** Don't extract puzzles from opening theory. Skip first N half-moves per side. */
const OPENING_SKIP_HALF_MOVES = 6;

/** Minimum centipawn swing to consider a move "puzzle-worthy". */
const MIN_CP_SWING = 50;

/** ELO range: show puzzles within [player - 100, player + 300]. */
const ELO_FLOOR_OFFSET = -100;
const ELO_CEILING_OFFSET = 300;

/** Max candidates to return. */
const MAX_CANDIDATES = 5;

// ── Extraction ─────────────────────────────────────────

/**
 * Extract puzzle candidates from analyzed game data.
 * Returns up to MAX_CANDIDATES candidates sorted by score descending.
 */
export function extractPuzzleCandidates(
  analyzedMoves: AnalyzedMove[],
  playerName: string,
  playerElo: number,
  opponentName: string,
): PuzzleCandidate[] {
  const candidates: PuzzleCandidate[] = [];

  for (let i = OPENING_SKIP_HALF_MOVES; i < analyzedMoves.length; i++) {
    const move = analyzedMoves[i];
    if (!move.fenBefore || !move.bestMove) continue;
    if (move.evalBefore == null || move.evalAfter == null) continue;

    const swing = Math.abs(move.evalBefore - move.evalAfter);
    if (swing < MIN_CP_SWING) continue;

    const isTactical =
      !!move.tacticalPatterns && move.tacticalPatterns.length > 0;
    const isCheck = move.san?.includes('+') ?? false;
    const isCapture = move.san?.includes('x') ?? false;

    // Score the move
    let score = 0;
    if (swing > 200) score += 4;
    else if (swing > 100) score += 3;
    else if (swing > 50) score += 2;

    if (move.san !== move.bestMoveSan) score += 2; // human found something different
    if (isTactical) score += 3; // fork/pin/discovered = high interest
    if (isCheck) score += 1;
    if (isCapture) score += 1;

    // Penalize trivial moves
    if (swing < 60 && !isTactical && !isCheck) score -= 2;

    const [difficulty, difficultyScore] = estimateDifficulty(
      swing,
      isTactical,
      isCheck,
      move,
    );

    const pattern = move.tacticalPatterns?.[0];

    candidates.push({
      fen: move.fenBefore,
      solution: [move.bestMove],
      san: move.san || move.bestMove,
      playerName,
      playerElo,
      opponentName,
      moveNumber: i + 1,
      score,
      difficulty,
      difficultyScore,
      cpSwing: swing,
      isTactical,
      isCheck,
      pattern,
    });
  }

  // Sort by score descending, take top candidates
  candidates.sort((a, b) => b.score - a.score);
  return candidates.slice(0, MAX_CANDIDATES);
}

// ── Difficulty Estimation ──────────────────────────────

function estimateDifficulty(
  swing: number,
  isTactical: boolean,
  isCheck: boolean,
  move: AnalyzedMove,
): [number, number] {
  // Base difficulty from centipawn swing
  let raw = 0;
  if (swing > 300) raw = 8;
  else if (swing > 200) raw = 6;
  else if (swing > 100) raw = 4;
  else if (swing > 50) raw = 3;
  else raw = 2;

  // Tactical pattern adds difficulty
  if (isTactical) raw += 1;

  // Counter-intuitive quiet moves are harder
  if (!isCheck && !move.san?.includes('x') && swing > 100) raw += 1;

  // Map to 1–5 stars
  let difficulty: number;
  if (raw >= 7) difficulty = 5;
  else if (raw >= 5) difficulty = 4;
  else if (raw >= 3) difficulty = 3;
  else difficulty = 2;

  // Map to ELO score
  const difficultyScore =
    difficulty === 5
      ? 2000
      : difficulty === 4
        ? 1700
        : difficulty === 3
          ? 1400
          : 1100;

  return [difficulty, difficultyScore];
}

// ── ELO-Aware Filtering ────────────────────────────────

/**
 * Filter candidates to those within [playerElo - 100, playerElo + 300].
 * Returns empty array if none qualify → trigger Best Moment Card fallback.
 */
export function filterByElo(
  candidates: PuzzleCandidate[],
  playerElo: number,
): PuzzleCandidate[] {
  const floor = playerElo + ELO_FLOOR_OFFSET;
  const ceiling = playerElo + ELO_CEILING_OFFSET;

  return candidates.filter((c) => {
    const displayDifficulty = Math.max(c.difficultyScore, playerElo);
    return displayDifficulty >= floor && displayDifficulty <= ceiling;
  });
}

/**
 * Check if we need to fall back to Best Moment Card.
 * Returns true when no candidate passes ELO filter AND
 * there are candidates that were too easy (below floor).
 */
export function shouldFallbackToBestMoment(
  candidates: PuzzleCandidate[],
  playerElo: number,
): boolean {
  const eligible = filterByElo(candidates, playerElo);
  return eligible.length === 0 && candidates.length > 0;
}

/**
 * Get the best moment from candidates for the fallback card.
 */
export function getBestMoment(
  candidates: PuzzleCandidate[],
): PuzzleCandidate | null {
  if (candidates.length === 0) return null;
  return candidates.reduce((best, c) => (c.score > best.score ? c : best));
}

// ── Display Difficulty ─────────────────────────────────

/**
 * The displayed difficulty badge should never be below the player's own ELO.
 * This ensures a 1700 player never shares a "★★☆☆☆" puzzle that looks too easy.
 */
export function displayDifficulty(
  candidate: PuzzleCandidate,
  playerElo: number,
): number {
  const score = Math.max(candidate.difficultyScore, playerElo);
  if (score >= 1800) return 5;
  if (score >= 1500) return 4;
  if (score >= 1200) return 3;
  return 2;
}

/**
 * Get difficulty label from stars.
 */
export function difficultyLabel(stars: number): string {
  const labels: Record<number, string> = {
    1: 'Beginner',
    2: 'Intermediate',
    3: 'Advanced',
    4: 'Expert',
    5: 'Master',
  };
  return labels[stars] || 'Intermediate';
}

/**
 * Trap move detection engine.
 *
 * A "trap" is a move that:
 * 1. Has minimal eval/win-odds swing (<1% — looks quiet)
 * 2. Is classified "best" or "good" by Stockfish
 * 3. Creates tactical patterns (fork, pin, discovered attack, etc.)
 *    — OR creates a threat that limits opponent responses
 *
 * The insight: a move that creates real threats but barely changes
 * the eval means the opponent has defensive resources, but must find
 * them precisely. These are the most instructive moments to highlight.
 */

import type { AnalyzedMove } from './chess-utils';
import type { PatternResult, TacticalPattern } from './tactics';

export interface TrapResult {
  /** Human-readable trap description */
  description: string;
  /** What threat does this move create */
  threatDescription: string;
  /** Why is this subtle (eval barely moved) */
  subtletyReason: string;
  /** Tactical patterns present */
  patterns: TacticalPattern[];
  /** Estimated number of "good" replies for opponent */
  goodReplyCount: number;
}

/**
 * Detect if a move is a subtle trap based on context.
 *
 * @param move — the analyzed move with eval data
 * @param patterns — tactical patterns detected on fenAfter
 */
export function detectTrap(
  move: AnalyzedMove,
  patterns: PatternResult[]
): TrapResult | null {
  // Must be classified well by Stockfish
  if (move.classification !== 'best' && move.classification !== 'good') {
    return null;
  }

  // Must have eval data
  if (move.winPercentBefore === undefined || move.winPercentAfter === undefined) {
    return null;
  }

  // Eval swing must be small (subtle)
  const swing = Math.abs(move.winPercentAfter - move.winPercentBefore);
  if (swing > 2.5) {
    return null; // Too significant — the advantage is already clear
  }

  // Must have tactical patterns present
  if (patterns.length === 0) {
    return null;
  }

  // Must be the player's turn (not a defensive move against opponent's threat)
  const playerPerspective = move.color;
  const patternsForPlayer = patterns.filter(p => {
    // Check if the pattern describes an advantage for the player
    const desc = p.description.toLowerCase();
    return desc.includes(playerPerspective === 'w' ? 'white' : 'black');
  });

  if (patternsForPlayer.length === 0) {
    return null;
  }

  // Build response
  const patternList = patternsForPlayer.map(p => p.pattern);

  const threatParts = patternsForPlayer.map(p => p.description);
  const threatDescription = threatParts.join('. ');

  // Estimate good replies (heuristic based on pattern types)
  // Fork: usually 1-2 good replies (escape both attacks)
  // Pin: usually 2-3 (move the pinned piece, block, or counter)
  // Discovered: usually 1-2 (avoid the discovered line)
  let goodReplyCount = 3;
  if (patternList.includes('fork')) goodReplyCount = 2;
  if (patternList.includes('discovered')) goodReplyCount = 1;
  if (patternList.includes('pin')) goodReplyCount = Math.min(goodReplyCount, 2);

  let description: string;
  const moveTag = move.san;

  if (patternList.includes('discovered')) {
    description = `Trap! ${moveTag} sets up a discovered attack — looks quiet but threatens to unleash hidden firepower.`;
  } else if (patternList.includes('fork')) {
    description = `Trap! ${moveTag} creates a subtle fork — the opponent must navigate carefully to avoid material loss.`;
  } else if (patternList.includes('pin')) {
    description = `Trap! ${moveTag} pins a key piece — the opponent has limited good responses to break free.`;
  } else if (patternList.includes('skewer')) {
    description = `Trap! ${moveTag} sets up a skewer — the opponent's piece alignment is vulnerable.`;
  } else if (patternList.includes('hanging')) {
    description = `Trap! ${moveTag} leaves a piece seemingly hanging, but capturing it leads to trouble.`;
  } else {
    description = `Trap! ${moveTag} looks quiet but creates hidden tactical threats.`;
  }

  return {
    description,
    threatDescription,
    subtletyReason: `Win odds barely changed (${swing.toFixed(1)}% swing) but creates real tactical pressure.`,
    patterns: patternList,
    goodReplyCount,
  };
}

/**
 * Provide a fallback explanation for a move that has tactical context
 * but wasn't highlighted by the AI.
 */
export function tacticalFallback(
  move: AnalyzedMove,
  patterns: PatternResult[],
  isTrap: boolean
): string | null {
  if (isTrap) return null; // Trap engine provides its own description

  if (patterns.length === 0) return null;

  const desc = patterns[0].description;

  if (patterns[0].pattern === 'fork') {
    return `A fork! ${desc}.`;
  }
  if (patterns[0].pattern === 'pin') {
    return `${desc} — restricting the opponent's mobility.`;
  }
  if (patterns[0].pattern === 'discovered') {
    return `${desc} — unleashing hidden pressure.`;
  }
  if (patterns[0].pattern === 'skewer') {
    return `${desc} — forcing the opponent to lose material.`;
  }
  if (patterns[0].pattern === 'hanging') {
    return `${desc} — a free piece to capture!`;
  }

  return null;
}

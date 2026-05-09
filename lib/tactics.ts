/**
 * Tactic detection engine.
 *
 * Core idea: if a move captures material but the Stockfish eval doesn't
 * change proportionally, a tactic (multi-move sequence) is in progress.
 *
 * A capture "wins" N centipawns of material.  If the actual eval change
 * is much smaller, or goes the opposite direction, the sides are trading
 * — the capture is part of a deeper sequence.  Group consecutive captures
 * into tactic blocks and evaluate them as a whole.
 */

import { materialDelta, pieceValue } from './material';

export interface TacticMove {
  /** Index in the analyzedMoves array */
  moveIndex: number;
  san: string;
  color: 'w' | 'b';
  /** Material delta in pawn-equivalents from this move's capture */
  materialGain: number;
  /** What piece was captured (p/n/b/r/q), null if not a capture */
  capturedPiece: string | null;
  /** Stockfish eval change in centipawns (from moving player's perspective) */
  evalChange: number;
  /** Expected eval change if this were a free capture (captured_piece_value × 100) */
  expectedGain: number;
  /** Is this move part of a tactic? */
  isTactic: boolean;
}

export interface TacticSequence {
  /** Moves belonging to this tactic (indices into analyzedMoves) */
  moves: TacticMove[];
  /** Total material gained/lost across the whole tactic (pawn-equivalents) */
  netMaterial: number;
  /** Total eval change from before tactic to after tactic (centipawns, moving side perspective) */
  netEvalChange: number;
  /** Who gained advantage from the completed tactic */
  advantageFor: 'white' | 'black' | 'equal' | 'unfinished';
  /** Start and end move indices (inclusive) */
  startIndex: number;
  endIndex: number;
  /** Human-readable summary */
  summary: string;
}

/**
 * Detect tactics in a game.
 *
 * @param moves - array of { fenBefore, fenAfter, san, color, evalBefore, evalAfter }
 * @returns list of tactic sequences found
 */
export function detectTactics(
  moves: Array<{
    fenBefore: string;
    fenAfter: string;
    san: string;
    color: 'w' | 'b';
    evalBefore: number;
    evalAfter: number;
    moveIndex: number;
  }>
): TacticSequence[] {
  const tacticMoves: TacticMove[] = [];

  for (const m of moves) {
    const { delta: materialGain, capturedPiece } = materialDelta(
      m.fenBefore,
      m.fenAfter,
      m.color
    );

    const evalChange = m.evalAfter - m.evalBefore; // raw cp change (white's perspective)

    // Convert eval to moving player's perspective
    const playerEvalChange = m.color === 'w' ? evalChange : -evalChange;

    // Expected gain = captured piece value × 100 cp
    const expectedGain = capturedPiece
      ? pieceValue(capturedPiece) * 100
      : 0;

    // A move is tactical if:
    // 1. Material was captured (materialGain > 0)
    // 2. The eval change is significantly less than expected
    //    (> 50 cp smaller, or opposite direction)
    const isTactic =
      capturedPiece !== null &&
      materialGain > 0 &&
      (playerEvalChange < expectedGain - 50);

    tacticMoves.push({
      moveIndex: m.moveIndex,
      san: m.san,
      color: m.color,
      materialGain,
      capturedPiece,
      evalChange: playerEvalChange,
      expectedGain,
      isTactic,
    });
  }

  // Group consecutive tactic moves into sequences
  const sequences: TacticSequence[] = [];
  let current: TacticMove[] = [];

  for (const tm of tacticMoves) {
    if (tm.isTactic) {
      current.push(tm);
    } else {
      if (current.length >= 2) {
        sequences.push(buildSequence(current, tacticMoves));
      }
      current = [];
    }
  }
  // Don't miss the last one
  if (current.length >= 2) {
    sequences.push(buildSequence(current, tacticMoves));
  }

  return sequences;
}

function buildSequence(
  seq: TacticMove[],
  allMoves: TacticMove[]
): TacticSequence {
  const netMaterial = seq.reduce((sum, m) => sum + m.materialGain, 0);
  const netEvalChange = seq.reduce((sum, m) => sum + m.evalChange, 0);

  // Who gained: look at net eval from white perspective
  // Reconstruct eval change from white's perspective
  let whiteEvalChange = 0;
  for (const m of seq) {
    whiteEvalChange += m.color === 'w' ? m.evalChange : -m.evalChange;
  }

  let advantageFor: TacticSequence['advantageFor'] = 'equal';
  if (whiteEvalChange > 50) advantageFor = 'white';
  else if (whiteEvalChange < -50) advantageFor = 'black';

  // Build summary
  const pieces: string[] = [];
  for (const m of seq) {
    if (m.capturedPiece) {
      const name: Record<string, string> = {
        p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen',
      };
      pieces.push(`${m.color === 'w' ? 'White' : 'Black'} ${name[m.capturedPiece] || m.capturedPiece}`);
    }
  }

  const netName = netMaterial > 0
    ? `+${netMaterial.toFixed(0)} material`
    : `${netMaterial.toFixed(0)} material`;
  const evalStr = netEvalChange > 0
    ? `+${(netEvalChange / 100).toFixed(1)} pawns`
    : `${(netEvalChange / 100).toFixed(1)} pawns`;

  const summary = `${seq.length}-move tactic: ${pieces.join(' → ')}. Net: ${netName}, eval ${evalStr}. ${advantageFor === 'equal' ? 'Even trade.' : advantageFor === 'white' ? 'White gained.' : 'Black gained.'}`;

  return {
    moves: seq,
    netMaterial,
    netEvalChange,
    advantageFor,
    startIndex: seq[0].moveIndex,
    endIndex: seq[seq.length - 1].moveIndex,
    summary,
  };
}

/**
 * Check if a given move index is inside a tactic sequence.
 */
export function isInTactic(
  moveIndex: number,
  tactics: TacticSequence[]
): TacticSequence | null {
  return tactics.find(
    (t) => moveIndex >= t.startIndex && moveIndex <= t.endIndex
  ) || null;
}

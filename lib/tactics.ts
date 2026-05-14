/**
 * Tactic detection engine.
 *
 * Two subsystems:
 * 1. Capture-sequence detection — compares material gain vs eval swing
 *    to group captures into multi-move tactic blocks (original).
 * 2. Board-level pattern detection — forks, pins, discovered attacks,
 *    skewers, hanging pieces (new).
 */

import { Chess } from 'chess.js';
import { materialDelta, pieceValue } from './material';

// ── Types ────────────────────────────────────────────────────────────────────

export type TacticalPattern =
  | 'fork'
  | 'pin'
  | 'discovered'
  | 'skewer'
  | 'hanging'
  | 'trade';

export interface PatternResult {
  pattern: TacticalPattern;
  /** Description for the player who made the move (e.g., "Your knight forks queen and rook") */
  description: string;
  /** Which piece squares are involved */
  squares: string[];
}

export interface TacticMove {
  moveIndex: number;
  san: string;
  color: 'w' | 'b';
  materialGain: number;
  capturedPiece: string | null;
  evalChange: number;
  expectedGain: number;
  isTactic: boolean;
}

export interface TacticSequence {
  moves: TacticMove[];
  netMaterial: number;
  netEvalChange: number;
  advantageFor: 'white' | 'black' | 'equal' | 'unfinished';
  startIndex: number;
  endIndex: number;
  summary: string;
}

// ── Piece ordering for fork/value comparisons ────────────────────────────────

const PIECE_RANK: Record<string, number> = { p: 0, n: 1, b: 2, r: 3, q: 4, k: 5 };
const PIECE_NAME: Record<string, string> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };

function pieceAt(fen: string, square: string): { type: string; color: 'w' | 'b' } | null {
  const chess = new Chess(fen);
  const p = chess.get(square as any);
  if (!p) return null;
  return { type: p.type, color: p.color };
}

// ── Pattern detection helpers ───────────────────────────────────────────────

/**
 * Detect forks: a piece that attacks 2+ higher-value opponent pieces
 * simultaneously. Ran AFTER a move is made (on fenAfter).
 */
function detectFork(fen: string, color: 'w' | 'b'): PatternResult | null {
  const chess = new Chess(fen);
  const opponent = color === 'w' ? 'b' : 'w';
  const squares = chess.board().flat().filter(Boolean) as { square: string; type: string; color: 'w' | 'b' }[];

  // For each piece of the player's color, check how many higher-value opponent pieces it attacks
  for (const piece of squares) {
    if (piece.color !== color) continue;
    const attackerRank = PIECE_RANK[piece.type] ?? 0;
    const moves = chess.moves({ square: piece.square as any, verbose: true });

    const attacked: { square: string; type: string; rank: number }[] = [];
    for (const m of moves) {
      if (!m.captured) continue;
      const target = pieceAt(fen, m.to);
      if (!target || target.color !== opponent) continue;
      const targetRank = PIECE_RANK[target.type] ?? 0;
      if (targetRank > attackerRank) {
        attacked.push({ square: m.to, type: target.type, rank: targetRank });
      }
    }

    if (attacked.length >= 2) {
      // Sort by value descending
      attacked.sort((a, b) => b.rank - a.rank);
      const targets = attacked.map(a => `${PIECE_NAME[a.type]} on ${a.square}`).join(' and ');
      const pieceName = PIECE_NAME[piece.type];
      return {
        pattern: 'fork',
        description: `${color === 'w' ? 'White' : 'Black'} ${pieceName} forks ${targets}`,
        squares: [piece.square, ...attacked.map(a => a.square)],
      };
    }
  }

  return null;
}

/**
 * Detect absolute pins: a sliding piece (bishop/rook/queen) attacks an opponent
 * piece that is shielding a king behind it on the same line.
 */
function detectPin(fen: string, color: 'w' | 'b'): PatternResult | null {
  const chess = new Chess(fen);
  const opponent = color === 'w' ? 'b' : 'w';

  // Find opponent king
  const board = chess.board().flat().filter(Boolean) as { square: string; type: string; color: 'w' | 'b' }[];
  const oppKing = board.find(p => p.type === 'k' && p.color === opponent);
  if (!oppKing) return null;

  const slidingPieces = board.filter(p => p.color === color && ['b', 'r', 'q'].includes(p.type));

  for (const piece of slidingPieces) {
    const sq = piece.square;
    const file1 = sq.charCodeAt(0);
    const rank1 = parseInt(sq[1]);

    // Check if it's on same file/rank/diagonal as opponent king
    const kFile = oppKing.square.charCodeAt(0);
    const kRank = parseInt(oppKing.square[1]);
    const sameFile = file1 === kFile;
    const sameRank = rank1 === kRank;
    const sameDiag = Math.abs(file1 - kFile) === Math.abs(rank1 - kRank);

    // Bishop: only diagonals; Rook: only files/ranks; Queen: all
    if (piece.type === 'b' && !sameDiag) continue;
    if (piece.type === 'r' && !(sameFile || sameRank)) continue;
    if (!(sameFile || sameRank || sameDiag)) continue;

    // Direction from attacker to king
    const dFile = Math.sign(kFile - file1);
    const dRank = Math.sign(kRank - rank1);

    // Walk from attacker toward king, count pieces in between
    let pinnedPiece: { square: string; type: string } | null = null;
    let steps = 0;
    let f = file1 + dFile;
    let r = rank1 + dRank;

    while (f >= 'a'.charCodeAt(0) && f <= 'h'.charCodeAt(0) && r >= 1 && r <= 8 && steps < 7) {
      const sq2 = String.fromCharCode(f) + r;
      const p = pieceAt(fen, sq2);
      if (p) {
        if (p.type === 'k' && p.color === opponent) {
          // Found king — there must be exactly one piece between attacker and king
          if (pinnedPiece) {
            return {
              pattern: 'pin',
              description: `${color === 'w' ? 'White' : 'Black'} ${PIECE_NAME[piece.type]} on ${sq} pins ${PIECE_NAME[pinnedPiece.type]} on ${pinnedPiece.square}`,
              squares: [sq, pinnedPiece.square, sq2],
            };
          }
        } else if (p.color === opponent && !pinnedPiece) {
          // First opponent piece in line — potential pin victim
          pinnedPiece = { square: sq2, type: p.type };
        } else {
          break; // friendly piece or second piece — breaks the pin line
        }
      }
      f += dFile;
      r += dRank;
      steps++;
    }
  }

  return null;
}

/**
 * Detect discovered attacks: comparing before/after FEN, if the moved piece
 * wasn't the one creating a new attack, it's a discovered attack.
 */
function detectDiscovered(
  fenBefore: string,
  fenAfter: string,
  color: 'w' | 'b',
  uci: string
): PatternResult | null {
  const chessBefore = new Chess(fenBefore);
  const chessAfter = new Chess(fenAfter);
  const opponent = color === 'w' ? 'b' : 'w';

  const fromSquare = uci.slice(0, 2);
  const toSquare = uci.slice(2, 4);

  // Find attacks that exist AFTER but didn't exist BEFORE (excluding moved piece)
  const afterAttacks: { from: string; to: string; piece: string }[] = [];
  const boardAfter = chessAfter.board().flat().filter(Boolean) as { square: string; type: string; color: 'w' | 'b' }[];

  for (const piece of boardAfter) {
    if (piece.color !== color) continue;
    if (piece.square === toSquare) continue; // skip the moved piece itself

    const moves = chessAfter.moves({ square: piece.square as any, verbose: true });
    for (const m of moves) {
      if (!m.captured) continue;
      const target = pieceAt(fenAfter, m.to);
      if (!target || target.color !== opponent) continue;

      // Check if this attack existed BEFORE (not discovered)
      const pieceBefore = pieceAt(fenBefore, piece.square);
      if (!pieceBefore || pieceBefore.type !== piece.type) continue;

      const chessBefore2 = new Chess(fenBefore);
      try {
        chessBefore2.move({ from: piece.square as any, to: m.to });
      } catch {
        // Move not legal before = clearly discovered, or piece was blocked
        const targetVal = PIECE_RANK[target.type] ?? 0;
        if (targetVal >= 1) { // at least knight or higher
          return {
            pattern: 'discovered',
            description: `${color === 'w' ? 'White' : 'Black'} ${PIECE_NAME[piece.type]} on ${piece.square} discovers an attack on ${PIECE_NAME[target.type]} on ${m.to}`,
            squares: [fromSquare, piece.square, m.to],
          };
        }
      }
    }
  }

  return null;
}

/**
 * Detect skewers: sliding piece attacks a high-value piece that's in front
 * of a lower-value piece on the same line.
 */
function detectSkewer(fen: string, color: 'w' | 'b'): PatternResult | null {
  const chess = new Chess(fen);
  const opponent = color === 'w' ? 'b' : 'w';
  const board = chess.board().flat().filter(Boolean) as { square: string; type: string; color: 'w' | 'b' }[];

  const slidingPieces = board.filter(p => p.color === color && ['b', 'r', 'q'].includes(p.type));

  for (const piece of slidingPieces) {
    const sq = piece.square;
    const file1 = sq.charCodeAt(0);
    const rank1 = parseInt(sq[1]);

    const directions = [
      [0, 1], [0, -1], [1, 0], [-1, 0],   // rook/queen
      [1, 1], [1, -1], [-1, 1], [-1, -1], // bishop/queen
    ];

    for (const [df, dr] of directions) {
      const isDiag = df !== 0 && dr !== 0;
      if (piece.type === 'b' && !isDiag) continue;
      if (piece.type === 'r' && isDiag) continue;

      let f = file1 + df;
      let r = rank1 + dr;
      let firstPiece: { square: string; type: string; rank: number } | null = null;

      while (f >= 'a'.charCodeAt(0) && f <= 'h'.charCodeAt(0) && r >= 1 && r <= 8) {
        const sq2 = String.fromCharCode(f) + r;
        const p = pieceAt(fen, sq2);

        if (p) {
          if (p.color === color) break; // friendly piece blocks

          if (p.color === opponent) {
            if (!firstPiece) {
              firstPiece = { square: sq2, type: p.type, rank: PIECE_RANK[p.type] ?? 0 };
            } else {
              // Second opponent piece found — if first is higher value, it's a skewer
              const secondRank = PIECE_RANK[p.type] ?? 0;
              if (firstPiece.rank > secondRank) {
                return {
                  pattern: 'skewer',
                  description: `${color === 'w' ? 'White' : 'Black'} ${PIECE_NAME[piece.type]} skewers ${PIECE_NAME[firstPiece.type]} through to ${PIECE_NAME[p.type]} on ${sq2}`,
                  squares: [sq, firstPiece.square, sq2],
                };
              }
              break;
            }
          }
        }

        f += df;
        r += dr;
      }
    }
  }

  return null;
}

/**
 * Detect hanging pieces: undefended opponent pieces that the player can capture.
 */
function detectHanging(fen: string, color: 'w' | 'b'): PatternResult | null {
  const chess = new Chess(fen);
  const opponent = color === 'w' ? 'b' : 'w';
  const board = chess.board().flat().filter(Boolean) as { square: string; type: string; color: 'w' | 'b' }[];

  // For each opponent piece, check if it's attacked AND if it's defended
  const opponentPieces = board.filter(p => p.color === opponent);

  let bestHanging: { square: string; type: string; rank: number } | null = null;
  let hangingRank = -1;

  for (const p of opponentPieces) {
    if (p.type === 'k') continue; // can't "hang" a king

    // Is it attacked by any of our pieces?
    const attackers = board.filter(ap => ap.color === color).filter(ap => {
      const moves = chess.moves({ square: ap.square as any, verbose: true });
      return moves.some(m => m.captured && m.to === p.square);
    });

    if (attackers.length === 0) continue;

    // Is it defended?
    const defenders = board.filter(dp => dp.color === opponent).filter(dp => {
      const moves = chess.moves({ square: dp.square as any, verbose: true });
      return moves.some(m => m.to === p.square);
    });

    if (defenders.length === 0) {
      const rank = PIECE_RANK[p.type] ?? 0;
      if (rank > hangingRank) {
        hangingRank = rank;
        bestHanging = { square: p.square, type: p.type, rank };
      }
    }
  }

  if (bestHanging) {
    return {
      pattern: 'hanging',
      description: `${color === 'w' ? 'Black' : 'White'} ${PIECE_NAME[bestHanging.type]} on ${bestHanging.square} is hanging`,
      squares: [bestHanging.square],
    };
  }

  return null;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Detect all tactical patterns present on the board after a move.
 * Checks patterns relevant to BOTH sides (what the player gained, and what the opponent left).
 */
export function detectPatterns(
  fenBefore: string,
  fenAfter: string,
  color: 'w' | 'b',   // who made the move
  uci: string
): PatternResult[] {
  const patterns: PatternResult[] = [];

  // 1. Fork — check if the moved piece created a fork
  const fork = detectFork(fenAfter, color);
  if (fork) patterns.push(fork);

  // 2. Pin — check if player created a pin against opponent
  const pin = detectPin(fenAfter, color);
  if (pin) patterns.push(pin);

  // 3. Discovered attack — check if moving one piece revealed another
  const discovered = detectDiscovered(fenBefore, fenAfter, color, uci);
  if (discovered) patterns.push(discovered);

  // 4. Skewer — check if player has a skewer against opponent
  const skewer = detectSkewer(fenAfter, color);
  if (skewer) patterns.push(skewer);

  // 5. Hanging pieces — check opponent's hanging pieces (opportunity)
  const hanging = detectHanging(fenAfter, color);
  if (hanging) patterns.push(hanging);

  return patterns;
}

// ── Capture-sequence tactic detection (original, unchanged) ──────────────────

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

    const evalChange = m.evalAfter - m.evalBefore;
    const playerEvalChange = m.color === 'w' ? evalChange : -evalChange;

    const expectedGain = capturedPiece
      ? pieceValue(capturedPiece) * 100
      : 0;

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

  let whiteEvalChange = 0;
  for (const m of seq) {
    whiteEvalChange += m.color === 'w' ? m.evalChange : -m.evalChange;
  }

  let advantageFor: TacticSequence['advantageFor'] = 'equal';
  if (whiteEvalChange > 50) advantageFor = 'white';
  else if (whiteEvalChange < -50) advantageFor = 'black';

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

export function isInTactic(
  moveIndex: number,
  tactics: TacticSequence[]
): TacticSequence | null {
  return tactics.find(
    (t) => moveIndex >= t.startIndex && moveIndex <= t.endIndex
  ) || null;
}

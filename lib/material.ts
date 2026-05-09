/**
 * Material evaluation engine.
 * Uses standard piece values: P=1, N=3, B=3, R=5, Q=9, K=100
 * K is included for complete accounting but typically offsetting.
 */

const PIECE_VALUES: Record<string, number> = {
  p: 1, n: 3, b: 3, r: 5, q: 9, k: 100,
};

export interface MaterialCount {
  p: number; n: number; b: number; r: number; q: number; k: number;
}

export interface MaterialScore {
  white: MaterialCount;
  black: MaterialCount;
  whiteTotal: number;
  blackTotal: number;
  /** Positive = white material advantage (in pawn equivalents) */
  advantage: number;
  advantageSide: 'white' | 'black' | 'equal';
}

function emptyCount(): MaterialCount {
  return { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 };
}

/**
 * Parse FEN and return material score.
 * FEN format: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
 */
export function evaluateMaterial(fen: string): MaterialScore {
  const board = fen.split(' ')[0];
  const white = emptyCount();
  const black = emptyCount();

  for (const char of board) {
    if (char === '/' || char.match(/[1-8]/)) continue;
    const piece = char.toLowerCase();
    const value = PIECE_VALUES[piece] || 0;
    if (char === char.toUpperCase()) {
      (white as any)[piece] = ((white as any)[piece] || 0) + 1;
    } else {
      (black as any)[piece] = ((black as any)[piece] || 0) + 1;
    }
  }

  const whiteTotal =
    white.p * 1 + white.n * 3 + white.b * 3 + white.r * 5 + white.q * 9 + white.k * 100;
  const blackTotal =
    black.p * 1 + black.n * 3 + black.b * 3 + black.r * 5 + black.q * 9 + black.k * 100;

  const advantage = whiteTotal - blackTotal;
  const absAdv = Math.abs(advantage);

  return {
    white,
    black,
    whiteTotal,
    blackTotal,
    advantage,
    advantageSide: absAdv < 0.5 ? 'equal' : advantage > 0 ? 'white' : 'black',
  };
}

/**
 * Get total material difference in pawn-equivalents between two FENs.
 * Positive = more material after the move (for the side that moved it's a gain).
 * Returns { delta: number, capturedPiece: string | null }
 */
export function materialDelta(
  fenBefore: string,
  fenAfter: string,
  color: 'w' | 'b'
): { delta: number; capturedPiece: string | null } {
  const before = evaluateMaterial(fenBefore);
  const after = evaluateMaterial(fenAfter);

  // Calculate what was captured
  const captured: string[] = [];
  const pieces: (keyof MaterialCount)[] = ['p', 'n', 'b', 'r', 'q'];

  for (const p of pieces) {
    const lost = (color === 'w' ? after.black[p] : after.white[p]);
    const had = (color === 'w' ? before.black[p] : before.white[p]);
    const diff = had - lost;
    for (let i = 0; i < diff; i++) captured.push(p);
  }

  const capturedPiece = captured.length > 0 ? captured[0] : null;

  // Delta from the perspective of the moving side
  const movingBefore = color === 'w' ? before.whiteTotal : before.blackTotal;
  const movingAfter = color === 'w' ? after.whiteTotal : after.blackTotal;
  const opponentBefore = color === 'w' ? before.blackTotal : before.whiteTotal;
  const opponentAfter = color === 'w' ? after.blackTotal : after.whiteTotal;

  // Net advantage change for the moving player
  const netBefore = movingBefore - opponentBefore;
  const netAfter = movingAfter - opponentAfter;
  const delta = netAfter - netBefore;

  return { delta, capturedPiece };
}

/** Return the material value of a given piece type in pawn-equivalents */
export function pieceValue(piece: string): number {
  return PIECE_VALUES[piece.toLowerCase()] || 0;
}

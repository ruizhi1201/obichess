import { Chess } from 'chess.js';

export type MoveClassification = 'best' | 'good' | 'inaccuracy' | 'mistake' | 'blunder' | 'unknown';

export interface AnalyzedMove {
  san: string;
  uci: string;
  fenBefore: string;
  fenAfter: string;
  moveNumber: number;
  color: 'w' | 'b';
  classification?: MoveClassification;
  evalBefore?: number;
  evalAfter?: number;
  winPercentBefore?: number;
  winPercentAfter?: number;
  mate?: number | null;
  bestMove?: string;
  bestMoveSan?: string;
  /** Material advantage (in pawn-equivalents) before this move. Positive = white ahead. */
  materialBefore?: number;
  /** Material advantage after this move */
  materialAfter?: number;
  /** Piece captured on this move (p/n/b/r/q), null if no capture */
  capturedPiece?: string | null;
  /** If non-null, this move is inside a tactic sequence. Contains the tactic summary. */
  inTactic?: string | null;
}

export interface ParsedGame {
  moves: AnalyzedMove[];
  headers: Record<string, string | null>;
  pgn: string;
}

export function parsePGN(pgn: string): ParsedGame | null {
  try {
    const chess = new Chess();
    chess.loadPgn(pgn);

    const headers = chess.header();
    const history = chess.history({ verbose: true });

    // Replay game to get FEN at each position
    const replayChess = new Chess();
    const moves: AnalyzedMove[] = [];

    for (let i = 0; i < history.length; i++) {
      const fenBefore = replayChess.fen();
      const move = history[i];
      replayChess.move(move.san);
      const fenAfter = replayChess.fen();

      moves.push({
        san: move.san,
        uci: move.from + move.to + (move.promotion || ''),
        fenBefore,
        fenAfter,
        moveNumber: Math.floor(i / 2) + 1,
        color: move.color,
      });
    }

    return { moves, headers, pgn };
  } catch {
    return null;
  }
}

export function classifyMove(evalBefore: number, evalAfter: number, color: 'w' | 'b'): MoveClassification {
  // Convert to the perspective of the player who moved
  // evalBefore and evalAfter are always from white's perspective (positive = white better)
  const playerEvalBefore = color === 'w' ? evalBefore : -evalBefore;
  const playerEvalAfter = color === 'w' ? evalAfter : -evalAfter;
  
  // How much did the eval change for the player who moved?
  // Negative means they lost eval (played poorly), positive means they gained
  const delta = playerEvalAfter - playerEvalBefore;

  if (delta >= -10) return 'best';      // within 0.1 pawn
  if (delta >= -25) return 'good';       // within 0.25 pawn
  if (delta >= -75) return 'inaccuracy'; // within 0.75 pawn
  if (delta >= -150) return 'mistake';   // within 1.5 pawns
  return 'blunder';                       // worse than -1.5 pawns
}

export function classificationColor(c: MoveClassification): string {
  switch (c) {
    case 'best': return '#22c55e';      // green
    case 'good': return '#86efac';      // light green
    case 'inaccuracy': return '#fbbf24'; // yellow
    case 'mistake': return '#f97316';   // orange
    case 'blunder': return '#ef4444';   // red
    default: return '#6b7280';          // gray
  }
}

export function classificationLabel(c: MoveClassification): string {
  switch (c) {
    case 'best': return '✓ Best';
    case 'good': return '✓ Good';
    case 'inaccuracy': return '?! Inaccuracy';
    case 'mistake': return '? Mistake';
    case 'blunder': return '?? Blunder';
    default: return '';
  }
}

export function cpToWinPercent(cp: number): number {
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}

export function formatEval(cp: number): string {
  if (Math.abs(cp) > 900) {
    const mateIn = Math.ceil((1000 - Math.abs(cp)) / 1);
    return cp > 0 ? `M${mateIn}` : `-M${mateIn}`;
  }
  const pawns = cp / 100;
  return pawns > 0 ? `+${pawns.toFixed(2)}` : pawns.toFixed(2);
}

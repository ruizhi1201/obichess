import { NextRequest, NextResponse } from 'next/server';

// Use Lichess Cloud Eval API — free, no key needed, real Stockfish at high depth
// Docs: https://lichess.org/api#tag/Analysis/operation/apiCloudEval

// Material values in centipawns
const PIECE_VALUES: Record<string, number> = {
  p: 100, n: 320, b: 330, r: 500, q: 900, k: 0
};

function materialEval(fen: string): number {
  // Parse just the piece placement part of FEN
  const piecePlacement = fen.split(' ')[0];
  let score = 0;
  for (const char of piecePlacement) {
    if (char === char.toUpperCase() && char.match(/[PNBRQK]/)) {
      // White piece
      score += PIECE_VALUES[char.toLowerCase()] || 0;
    } else if (char === char.toLowerCase() && char.match(/[pnbrqk]/)) {
      // Black piece
      score -= PIECE_VALUES[char] || 0;
    }
  }
  return score; // positive = white advantage, in centipawns
}

export async function POST(req: NextRequest) {
  const { fen } = await req.json();

  if (!fen) {
    return NextResponse.json({ error: 'FEN required' }, { status: 400 });
  }

  try {
    const result = await analyzeWithLichess(fen);
    return NextResponse.json(result);
  } catch (error) {
    console.error('[Analyze API] Error:', error);
    return NextResponse.json({ error: 'Analysis failed' }, { status: 500 });
  }
}

async function analyzeWithLichess(fen: string): Promise<{
  bestMove: string;
  eval: number;
  mate: number | null;
  depth: number;
}> {
  try {
    const encodedFen = encodeURIComponent(fen);
    const url = `https://lichess.org/api/cloud-eval?fen=${encodedFen}&multiPv=1`;

    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      next: { revalidate: 3600 }, // cache for 1 hour
    });

    if (response.ok) {
      const data = await response.json();
      const pv = data.pvs?.[0];
      if (pv) {
        const bestMove = pv.moves?.split(' ')[0] || '';
        const evalScore: number = pv.cp ?? (pv.mate != null ? (pv.mate > 0 ? 30000 - pv.mate : -30000 - Math.abs(pv.mate)) : 0);
        const mateScore: number | null = pv.mate ?? null;

        console.log(`[Lichess Eval] FEN: ${fen.substring(0, 30)}... → cp=${evalScore}, bestMove=${bestMove}, depth=${data.depth}`);

        return {
          bestMove,
          eval: evalScore,
          mate: mateScore,
          depth: data.depth ?? 0,
        };
      }
    }

    // Fallback: material balance (Lichess 404 or no PV data)
    const matEval = materialEval(fen);
    console.log(`[Material Fallback] FEN: ${fen.substring(0, 30)}... → material cp=${matEval}`);
    return { bestMove: '', eval: matEval, mate: null, depth: 0 };
  } catch {
    const matEval = materialEval(fen);
    console.log(`[Material Fallback] FEN: ${fen.substring(0, 30)}... → material cp=${matEval}`);
    return { bestMove: '', eval: matEval, mate: null, depth: 0 };
  }
}

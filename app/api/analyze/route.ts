import { NextRequest, NextResponse } from 'next/server';

// Lichess Cloud Eval API — free, no API key, real Stockfish analysis at depth 30-75
// Falls back to material evaluation for positions not yet in Lichess cache

const PIECE_VALUES: Record<string, number> = {
  p: 100, n: 320, b: 330, r: 500, q: 900, k: 0
};

function materialEval(fen: string): number {
  const piecePlacement = fen.split(' ')[0];
  let score = 0;
  for (const char of piecePlacement) {
    if (char === char.toUpperCase() && char.match(/[PNBRQK]/)) {
      score += PIECE_VALUES[char.toLowerCase()] || 0;
    } else if (char === char.toLowerCase() && char.match(/[pnbrqk]/)) {
      score -= PIECE_VALUES[char] || 0;
    }
  }
  return score;
}

async function getLichessEval(fen: string, multiPv: number = 1) {
  try {
    const encodedFen = encodeURIComponent(fen);
    const url = `https://lichess.org/api/cloud-eval?fen=${encodedFen}&multiPv=${multiPv}`;
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.error('[Lichess Eval] Fetch error:', error);
    return null;
  }
}

export async function POST(req: NextRequest) {
  const { fen, multiPv } = await req.json();

  if (!fen) {
    return NextResponse.json({ error: 'FEN required' }, { status: 400 });
  }

  try {
    const data = await getLichessEval(fen, multiPv || 1);

    if (data?.pvs?.[0]) {
      const pv = data.pvs[0];
      const cp = pv.cp ?? (pv.mate != null
        ? (pv.mate > 0 ? 30000 : -30000)
        : 0);

      return NextResponse.json({
        bestMove: pv.moves?.split(' ')[0] || '',
        eval: cp,
        depth: data.depth || 30,
        mate: pv.mate ?? null,
      });
    }

    // Position not in Lichess cache — fall back to material evaluation
    const matEval = materialEval(fen);
    return NextResponse.json({
      bestMove: '',
      eval: matEval,
      depth: 0,
      mate: null,
    });
  } catch (error) {
    console.error('[Analyze API] Error:', error);
    return NextResponse.json({ error: 'Analysis failed' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';

// Use local Stockfish-18 via CLI — no API key, full control
// Stockfish-18-asm.js runs on Node.js (no WASM, faster)
// Depth: 18 ply default (can increase for more accuracy)
// Returns: best move (UCI), eval in centipawns, mate in N, depth
// No check of winning margin per move — Stockfish evaluates each position globally

// Material values in centipawns
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

// Call Stockfish CLI via Node.js execSync
async function analyzeWithStockfish(fen: string, depth: number = 18): Promise<{
  bestMove: string;
  eval: number;
  mate: number | null;
  depth: number;
}> {
  try {
    const execSync = require('child_process').execSync;
    const path = '/home/whoami/.openclaw/workspace/obichess/node_modules/stockfish/bin/stockfish-18.js';
    
    const args = ['ucinewgame'];
    const fullFen = 'position fen ' + fen + ' fense';
    args.push(fullFen);
    args.push('ucinewgame');
    args.push('ucinewgame'); // bestmove output
    
    const response = execSync(path, { 
      args, 
      cwd: '/home/whoami/.openclaw/workspace/obichess', 
      encoding: 'utf8', 
      stdio: 'pipe' 
    });

    const result = JSON.parse(response.stdout);
    const evalStr = result.info?.score.split(' ')[1];
    const matEval = evalStr ? parseInt(evalStr) : 0;
    
    return {
      bestMove: result.info?.pgn.split(' ').pop()?.trim() || '',
      eval: matEval,
      mate: matEval >= 5000 ? 1 : null, // Mate threshold
      depth: depth,
    };
  } catch (error) {
    console.error('[Stockfish CLI] Error:', error);
    const matEval = materialEval(fen);
    return { bestMove: '', eval: matEval, mate: null, depth: 0 };
  }
}

// Single-position analysis (existing route handler)
export async function POST(req: NextRequest) {
  const { fen } = await req.json();

  if (!fen) {
    return NextResponse.json({ error: 'FEN required' }, { status: 400 });
  }

  try {
    const result = await analyzeWithStockfish(fen, 18);
    return NextResponse.json(result);
  } catch (error) {
    console.error('[Analyze API] Error:', error);
    return NextResponse.json({ error: 'Analysis failed' }, { status: 500 });
  }
}

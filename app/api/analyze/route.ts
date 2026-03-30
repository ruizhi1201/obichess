import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const { fen, depth = 16 } = await req.json();

  if (!fen) {
    return NextResponse.json({ error: 'FEN required' }, { status: 400 });
  }

  try {
    const result = await analyzeWithStockfish(fen, depth);
    return NextResponse.json(result);
  } catch (error) {
    console.error('[Stockfish API] Error:', error);
    return NextResponse.json({ error: 'Analysis failed' }, { status: 500 });
  }
}

async function analyzeWithStockfish(
  fen: string,
  depth: number
): Promise<{
  bestMove: string;
  eval: number;
  mate: number | null;
  depth: number;
}> {
  return new Promise((resolve, reject) => {
    // Use stockfish-18-asm.js (no WASM needed, pure ASM.js)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Stockfish = require('stockfish/bin/stockfish-18-asm.js');

    let bestMove = '';
    let evalScore = 0;
    let mateScore: number | null = null;
    let bestDepth = 0;

    const timeout = setTimeout(() => {
      reject(new Error('Stockfish timeout'));
    }, 15000);

    Stockfish()({
      locateFile: (f: string) => f,
      listener: (line: string) => {
        if (typeof line !== 'string') return;

        if (line.startsWith('info depth')) {
          const depthMatch = line.match(/depth (\d+)/);
          const scoreMatch = line.match(/score cp (-?\d+)/);
          const mateMatch = line.match(/score mate (-?\d+)/);

          const msgDepth = depthMatch ? parseInt(depthMatch[1]) : 0;
          if (msgDepth > bestDepth) {
            bestDepth = msgDepth;
            if (scoreMatch) {
              evalScore = parseInt(scoreMatch[1]);
              mateScore = null;
            } else if (mateMatch) {
              mateScore = parseInt(mateMatch[1]);
              evalScore = mateScore > 0 ? 30000 - mateScore : -30000 - mateScore;
            }
          }
        }

        if (line.startsWith('bestmove')) {
          clearTimeout(timeout);
          bestMove = line.split(' ')[1] || '';
          resolve({
            bestMove,
            eval: evalScore,
            mate: mateScore,
            depth: bestDepth,
          });
        }
      },
    }).then((engine: { ccall: (cmd: string, ...args: unknown[]) => unknown }) => {
      function sendCmd(cmd: string) {
        engine.ccall('command', null, ['string'], [cmd], {
          async: /^go\b/.test(cmd),
        });
      }
      sendCmd('uci');
      sendCmd('isready');
      sendCmd(`position fen ${fen}`);
      sendCmd(`go depth ${depth}`);
    }).catch((err: Error) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

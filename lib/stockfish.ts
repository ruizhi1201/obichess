'use client';

// Stockfish.js wrapper — runs in browser via Web Worker
// Uses stockfish.js from CDN or local public/stockfish/

export interface StockfishResult {
  bestMove: string; // UCI notation e.g. "e2e4"
  eval: number;     // centipawns from white's perspective
  depth: number;
  pv: string;       // principal variation
}

let worker: Worker | null = null;

function getWorker(): Worker {
  if (!worker) {
    // Use stockfish from CDN (nmrugg's stockfish.js)
    worker = new Worker('https://cdn.jsdelivr.net/npm/stockfish@16/src/stockfish.js');
    worker.postMessage('uci');
    worker.postMessage('isready');
  }
  return worker;
}

export async function analyzePosition(
  fen: string,
  depth: number = 18
): Promise<StockfishResult> {
  return new Promise((resolve, reject) => {
    const w = getWorker();
    let bestMove = '';
    let evalScore = 0;
    let pvLine = '';
    let bestDepth = 0;

    const timeout = setTimeout(() => {
      reject(new Error('Stockfish timeout'));
    }, 15000);

    const handler = (e: MessageEvent) => {
      const msg: string = e.data;

      if (msg.startsWith('info depth')) {
        const depthMatch = msg.match(/depth (\d+)/);
        const scoreMatch = msg.match(/score cp (-?\d+)/);
        const mateMatch = msg.match(/score mate (-?\d+)/);
        const pvMatch = msg.match(/ pv (.+)/);

        const msgDepth = depthMatch ? parseInt(depthMatch[1]) : 0;

        if (msgDepth > bestDepth) {
          bestDepth = msgDepth;
          if (scoreMatch) {
            evalScore = parseInt(scoreMatch[1]);
          } else if (mateMatch) {
            const mateIn = parseInt(mateMatch[1]);
            evalScore = mateIn > 0 ? 1000 - mateIn : -1000 + Math.abs(mateIn);
          }
          if (pvMatch) {
            pvLine = pvMatch[1].split(' ')[0];
          }
        }
      }

      if (msg.startsWith('bestmove')) {
        clearTimeout(timeout);
        w.removeEventListener('message', handler);

        const parts = msg.split(' ');
        bestMove = parts[1] || pvLine;

        // Adjust eval: if it's black's turn, stockfish reports from white's perspective
        // which is what we want
        resolve({
          bestMove,
          eval: evalScore,
          depth: bestDepth,
          pv: pvLine,
        });
      }
    };

    w.addEventListener('message', handler);

    w.postMessage(`position fen ${fen}`);
    w.postMessage(`go depth ${depth}`);
  });
}

export function terminateWorker() {
  if (worker) {
    worker.terminate();
    worker = null;
  }
}

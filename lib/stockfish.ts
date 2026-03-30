'use client';

// Stockfish.js wrapper — runs in browser via Web Worker
// Uses stockfish.js from CDN via blob URL (bypasses cross-origin worker restriction)

export interface StockfishResult {
  bestMove: string; // UCI notation e.g. "e2e4"
  eval: number;     // centipawns from white's perspective
  depth: number;
  pv: string;       // principal variation
}

let worker: Worker | null = null;

async function getWorker(): Promise<Worker> {
  if (worker) return worker;

  // Fetch the stockfish script and create a blob worker (bypasses CORS for workers)
  const response = await fetch('https://cdn.jsdelivr.net/npm/stockfish@16/src/stockfish.js');
  const scriptText = await response.text();
  const blob = new Blob([scriptText], { type: 'application/javascript' });
  const blobUrl = URL.createObjectURL(blob);

  worker = new Worker(blobUrl);

  // Wait for ready
  await new Promise<void>((resolve) => {
    const handler = (e: MessageEvent) => {
      if (e.data === 'readyok') {
        worker!.removeEventListener('message', handler);
        resolve();
      }
    };
    worker!.addEventListener('message', handler);
    worker!.postMessage('uci');
    worker!.postMessage('isready');
  });

  return worker;
}

export async function analyzePosition(
  fen: string,
  depth: number = 18
): Promise<StockfishResult> {
  const w = await getWorker();

  return new Promise((resolve, reject) => {
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

        // Debug logging — verify Stockfish is actually running
        console.log(`[Stockfish] FEN: ${fen.substring(0, 30)}... → cp=${evalScore}, bestMove=${bestMove}, depth=${bestDepth}`);

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

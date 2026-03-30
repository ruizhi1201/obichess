'use client';

// Stockfish analysis — server-side via API route
// Browser-side WASM approach was dropped (107MB WASM file too large for GitHub).
// All analysis is now performed server-side using stockfish-18-asm.js (Node.js, no WASM).

export interface StockfishResult {
  bestMove: string; // UCI notation e.g. "e2e4"
  eval: number;     // centipawns from white's perspective
  depth: number;
  mate: number | null; // mate in N moves (null if not a forced mate)
  pv?: string;      // principal variation (optional, not returned by API)
}

export async function analyzePosition(
  fen: string,
  depth: number = 16
): Promise<StockfishResult> {
  const response = await fetch('/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fen, depth }),
  });

  if (!response.ok) {
    throw new Error(`Stockfish analysis failed: ${response.status}`);
  }

  const data = await response.json();

  console.log(
    `[Stockfish] FEN: ${fen.substring(0, 30)}... → cp=${data.eval}, bestMove=${data.bestMove}, mate=${data.mate}, depth=${data.depth}`
  );

  return {
    bestMove: data.bestMove,
    eval: data.eval,
    depth: data.depth,
    mate: data.mate ?? null,
    pv: data.bestMove, // use bestMove as pv fallback
  };
}

// No-op: no worker to terminate in server-side mode
export function terminateWorker() {
  // Nothing to do — analysis runs server-side
}

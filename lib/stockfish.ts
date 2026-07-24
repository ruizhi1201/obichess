'use client';

// Stockfish analysis — browser-side Web Worker + WASM
// Uses stockfish-18-lite-single (7MB WASM) loaded in a Web Worker.
// Completely bypasses Vercel serverless limitations (no child_process, no 10s timeout).

export interface StockfishResult {
  bestMove: string;
  eval: number;
  depth: number;
  mate: number | null;
  pv?: string;
}

interface QueuedRequest {
  fen: string;
  depth: number;
  resolve: (result: StockfishResult) => void;
  reject: (err: Error) => void;
}

// --- Worker singleton state ---
let worker: Worker | null = null;
let workerReady = false;
let initPromise: Promise<void> | null = null;
let initResolve: (() => void) | null = null;

// --- Request queue ---
const requestQueue: QueuedRequest[] = [];
let isAnalyzing = false;
let currentTimeout: ReturnType<typeof setTimeout> | null = null;

// --- Current analysis state ---
let bestMove = '';
let evalCp = 0;
let depth = 0;
let mate: number | null = null;
let pv = '';

function createWorker(): Promise<void> {
  if (workerReady) return Promise.resolve();
  if (initPromise) return initPromise;

  initPromise = new Promise<void>((resolve, reject) => {
    initResolve = resolve;
    try {
      const workerUrl = '/stockfish/stockfish-18-lite-single.js';
      worker = new Worker(workerUrl);

      worker.onmessage = handleWorkerMessage;
      worker.onerror = (e) => {
        console.error('[Stockfish] Worker error:', e);
        reject(new Error('Stockfish worker failed to load'));
      };

      // Start UCI initialization
      worker.postMessage('uci');

      // Timeout for initialization
      setTimeout(() => {
        if (!workerReady) {
          reject(new Error('Stockfish initialization timed out after 30s'));
        }
      }, 30000);
    } catch (e) {
      reject(e);
    }
  });

  return initPromise;
}

function handleWorkerMessage(e: MessageEvent<string>) {
  const line = (e.data?.trim?.() || String(e.data || '').trim());
  if (!line) return;

  // Initialization phase: wait for uciok then readyok
  if (!workerReady) {
    if (line === 'uciok') {
      // Send isready to confirm engine is fully initialized
      worker?.postMessage('isready');
    } else if (line === 'readyok') {
      workerReady = true;
      initResolve?.();
      // Start processing queued requests
      setTimeout(() => processQueue(), 50);
    }
    return;
  }

  // Analysis phase: collect info and detect bestmove
  if (isAnalyzing) {
    if (line.startsWith('info')) {
      const depthMatch = line.match(/depth\s+(\d+)/);
      if (depthMatch) depth = parseInt(depthMatch[1], 10);

      const cpMatch = line.match(/score\s+cp\s+(-?\d+)/);
      const mateMatch = line.match(/score\s+mate\s+(-?\d+)/);
      if (mateMatch) {
        mate = parseInt(mateMatch[1], 10);
        evalCp = mate > 0 ? 30000 : -30000;
      } else if (cpMatch) {
        evalCp = parseInt(cpMatch[1], 10);
        mate = null;
      }

      const pvMatch = line.match(/pv\s+(.+)$/);
      if (pvMatch) pv = pvMatch[1];
    }

    if (line.startsWith('bestmove')) {
      const parts = line.split(' ');
      bestMove = parts[1] || '';

      if (currentTimeout) clearTimeout(currentTimeout);

      // Resolve with collected data
      finishAnalysis();
    }
  }
}

function finishAnalysis() {
  if (!isAnalyzing) return;
  isAnalyzing = false;

  // Get the current request from the queue (it was already shifted)
  // The resolve is stored separately
  const result: StockfishResult = {
    bestMove,
    eval: evalCp,
    depth,
    mate,
    pv: pv || bestMove,
  };

  console.log(
    `[Stockfish] → cp=${evalCp}, bestMove=${bestMove}, mate=${mate}, depth=${depth}`
  );

  // We need to track the current resolve function
  if (_currentResolve) {
    _currentResolve(result);
    _currentResolve = null;
    _currentReject = null;
  }

  // Process next in queue
  setTimeout(() => processQueue(), 0);
}

let _currentResolve: ((result: StockfishResult) => void) | null = null;
let _currentReject: ((err: Error) => void) | null = null;

function processQueue() {
  if (isAnalyzing || requestQueue.length === 0 || !workerReady) return;

  const req = requestQueue.shift()!;
  isAnalyzing = true;

  // Reset analysis state
  bestMove = '';
  evalCp = 0;
  depth = 0;
  mate = null;
  pv = '';

  _currentResolve = req.resolve;
  _currentReject = req.reject;

  // Timeout: resolve with whatever we have after 30s (per position)
  currentTimeout = setTimeout(() => {
    if (isAnalyzing) {
      worker!.postMessage('stop');
      // Give a moment for Stockfish to output bestmove
      setTimeout(() => {
        if (isAnalyzing) {
          finishAnalysis();
        }
      }, 500);
    }
  }, 30000);

  // Send position and go
  worker!.postMessage(`position fen ${req.fen}`);
  worker!.postMessage(`go depth ${req.depth}`);
}

export async function analyzePosition(
  fen: string,
  depth: number = 22
): Promise<StockfishResult> {
  await createWorker();

  return new Promise<StockfishResult>((resolve, reject) => {
    requestQueue.push({ fen, depth, resolve, reject });
    processQueue();
  });
}

export function terminateWorker() {
  if (currentTimeout) clearTimeout(currentTimeout);
  if (worker) {
    try {
      worker.postMessage('stop');
      worker.postMessage('quit');
    } catch (e) { /* ignore */ }
    worker.terminate();
    worker = null;
    workerReady = false;
    initPromise = null;
    initResolve = null;
    isAnalyzing = false;
    _currentResolve = null;
    _currentReject = null;
    requestQueue.length = 0;
  }
}

'use client';

import { useState, useRef, useCallback } from 'react';

interface ValidatedMove {
  number: number;
  white: string | null;
  black: string | null;
  whiteConfidence: 'high' | 'medium' | 'low';
  blackConfidence: 'high' | 'medium' | 'low';
  whiteValid: boolean;
  blackValid: boolean;
  whiteNeeded: boolean;   // must be filled in by human
  blackNeeded: boolean;   // must be filled in by human
}

interface GapEntry {
  number: number;
  color: 'white' | 'black';
}

interface ScoresheetResponse {
  moves: ValidatedMove[];
  white_player: string;
  black_player: string;
  gaps: GapEntry[];        // moves that MUST be filled in
  partialPGN: string;
  boardStuck: boolean;
  stuckAtMove: number;
  error?: string;
}

interface VerificationTarget {
  moveNumber: number;
  side: 'white' | 'black';
  currentValue: string | null;
  confidence: 'high' | 'medium' | 'low';
  isValid: boolean;
}

interface ScoresheetUploaderProps {
  onLoad: (pgn: string) => void;
}

function getMoveStatus(
  confidence: 'high' | 'medium' | 'low',
  valid: boolean
): 'good' | 'warn' | 'bad' {
  if (!valid) return 'bad';
  if (confidence === 'low') return 'bad';
  if (confidence === 'medium') return 'warn';
  return 'good';
}

function needsVerification(move: ValidatedMove): boolean {
  return (
    move.whiteNeeded ||
    move.blackNeeded ||
    !move.whiteValid ||
    !move.blackValid ||
    move.whiteConfidence === 'low' ||
    move.blackConfidence === 'low' ||
    move.whiteConfidence === 'medium' ||
    move.blackConfidence === 'medium' ||
    move.white === '?' ||
    move.black === '?'
  );
}

function buildPGN(
  moves: ValidatedMove[],
  whitePlayer: string,
  blackPlayer: string
): string {
  const headers = [
    whitePlayer ? `[White "${whitePlayer}"]` : '[White "?"]',
    blackPlayer ? `[Black "${blackPlayer}"]` : '[Black "?"]',
    '[Result "*"]',
  ].join('\n');

  const moveText = moves
    .map((m) => {
      const w = m.white || '?';
      const b = m.black ? ` ${m.black}` : '';
      return `${m.number}. ${w}${b}`;
    })
    .join(' ');

  return `${headers}\n\n${moveText} *`;
}

export default function ScoresheetUploader({ onLoad }: ScoresheetUploaderProps) {
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [moves, setMoves] = useState<ValidatedMove[] | null>(null);
  const [whitePlayer, setWhitePlayer] = useState('');
  const [blackPlayer, setBlackPlayer] = useState('');
  const [preview, setPreview] = useState<string | null>(null);

  // Verification modal state
  const [verifyQueue, setVerifyQueue] = useState<VerificationTarget[]>([]);
  const [currentVerifyIndex, setCurrentVerifyIndex] = useState(0);
  const [verifyInput, setVerifyInput] = useState('');
  const [showVerifyModal, setShowVerifyModal] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(async (file: File) => {
    setError(null);
    setMoves(null);
    setLoading(true);

    // Show preview
    const url = URL.createObjectURL(file);
    setPreview(url);

    try {
      const fd = new FormData();
      fd.append('image', file);

      const res = await fetch('/api/scoresheet', {
        method: 'POST',
        body: fd,
      });

      const data: ScoresheetResponse = await res.json();

      if (!res.ok || data.error) {
        setError(data.error || 'Failed to process scoresheet');
        return;
      }

      setMoves(data.moves);
      setWhitePlayer(data.white_player || '');
      setBlackPlayer(data.black_player || '');

      // Build verification queue
      const queue: VerificationTarget[] = [];
      for (const m of data.moves) {
        const whiteStatus = getMoveStatus(m.whiteConfidence, m.whiteValid);
        const blackStatus = m.black
          ? getMoveStatus(m.blackConfidence, m.blackValid)
          : 'good';

        if (whiteStatus !== 'good') {
          queue.push({
            moveNumber: m.number,
            side: 'white',
            currentValue: m.white,
            confidence: m.whiteConfidence,
            isValid: m.whiteValid,
          });
        }
        if (m.black && blackStatus !== 'good') {
          queue.push({
            moveNumber: m.number,
            side: 'black',
            currentValue: m.black,
            confidence: m.blackConfidence,
            isValid: m.blackValid,
          });
        }
      }

      // Prioritize gaps (whiteNeeded/blackNeeded) first in the queue
      const gaps = data.gaps || [];
      const gapKeys = new Set(gaps.map((g: GapEntry) => `${g.number}-${g.color}`));
      const gapQueue: VerificationTarget[] = [];
      const warnQueue: VerificationTarget[] = [];

      for (const m of data.moves) {
        // Mandatory gaps first
        if (m.whiteNeeded || gapKeys.has(`${m.number}-white`)) {
          gapQueue.push({
            moveNumber: m.number,
            side: 'white',
            currentValue: m.white ?? '?',
            confidence: m.whiteConfidence,
            isValid: m.whiteValid,
          });
        } else {
          const ws = getMoveStatus(m.whiteConfidence, m.whiteValid);
          if (ws !== 'good') {
            warnQueue.push({
              moveNumber: m.number,
              side: 'white',
              currentValue: m.white ?? '?',
              confidence: m.whiteConfidence,
              isValid: m.whiteValid,
            });
          }
        }

        if (m.blackNeeded || gapKeys.has(`${m.number}-black`)) {
          gapQueue.push({
            moveNumber: m.number,
            side: 'black',
            currentValue: m.black ?? '?',
            confidence: m.blackConfidence,
            isValid: m.blackValid,
          });
        } else if (m.black) {
          const bs = getMoveStatus(m.blackConfidence, m.blackValid);
          if (bs !== 'good') {
            warnQueue.push({
              moveNumber: m.number,
              side: 'black',
              currentValue: m.black ?? '?',
              confidence: m.blackConfidence,
              isValid: m.blackValid,
            });
          }
        }
      }

      // Gaps must be resolved first, then warnings
      const finalQueue = [...gapQueue, ...warnQueue];

      if (finalQueue.length > 0) {
        setVerifyQueue(finalQueue);
        setCurrentVerifyIndex(0);
        setVerifyInput(!finalQueue[0].currentValue || finalQueue[0].currentValue === '?' ? '' : finalQueue[0].currentValue);
        setShowVerifyModal(true);
      }
    } catch (err) {
      setError('Network error — please try again');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith('image/')) {
        processFile(file);
      } else {
        setError('Please drop an image file');
      }
    },
    [processFile]
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleVerifyConfirm = () => {
    const current = verifyQueue[currentVerifyIndex];
    const correctedValue = verifyInput.trim() || current.currentValue;

    // Apply correction to moves
    setMoves((prev) => {
      if (!prev) return prev;
      return prev.map((m) => {
        if (m.number === current.moveNumber) {
          if (current.side === 'white') {
            return { ...m, white: correctedValue, whiteConfidence: 'high', whiteValid: true };
          } else {
            return { ...m, black: correctedValue, blackConfidence: 'high', blackValid: true };
          }
        }
        return m;
      });
    });

    // Advance to next
    const nextIndex = currentVerifyIndex + 1;
    if (nextIndex < verifyQueue.length) {
      setCurrentVerifyIndex(nextIndex);
      const next = verifyQueue[nextIndex];
      setVerifyInput(!next.currentValue || next.currentValue === '?' ? '' : next.currentValue);
    } else {
      setShowVerifyModal(false);
    }
  };

  const handleVerifySkip = () => {
    const nextIndex = currentVerifyIndex + 1;
    if (nextIndex < verifyQueue.length) {
      setCurrentVerifyIndex(nextIndex);
      const next = verifyQueue[nextIndex];
      setVerifyInput(!next.currentValue || next.currentValue === '?' ? '' : next.currentValue);
    } else {
      setShowVerifyModal(false);
    }
  };

  const handleLoadGame = () => {
    if (!moves) return;
    const pgn = buildPGN(moves, whitePlayer, blackPlayer);
    onLoad(pgn);
  };

  const statusColor = {
    good: 'text-green-400',
    warn: 'text-amber-400',
    bad: 'text-red-400',
  };

  const statusIcon = {
    good: '✅',
    warn: '⚠️',
    bad: '❌',
  };

  const statusBg = {
    good: 'bg-green-950/30 border-green-800/40',
    warn: 'bg-amber-950/30 border-amber-800/40',
    bad: 'bg-red-950/30 border-red-800/40',
  };

  const currentVerify = verifyQueue[currentVerifyIndex];

  return (
    <div className="space-y-4">
      {/* Upload zone */}
      {!moves && !loading && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
            dragging
              ? 'border-amber-500 bg-amber-500/5'
              : 'border-zinc-700 hover:border-zinc-500'
          }`}
        >
          <div className="text-4xl mb-3">📷</div>
          <div className="text-zinc-300 font-medium">Click or drag to upload scoresheet photo</div>
          <div className="text-zinc-500 text-sm mt-1">JPG, PNG, WEBP — handwritten or printed</div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="hidden"
          />
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="border border-zinc-800 rounded-xl p-10 text-center">
          {preview && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview}
              alt="Scoresheet preview"
              className="max-h-48 mx-auto rounded-lg mb-6 opacity-60"
            />
          )}
          <div className="flex items-center justify-center gap-3 text-amber-400">
            <svg
              className="animate-spin h-5 w-5"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8v8H4z"
              />
            </svg>
            <span className="font-medium">Reading scoresheet with AI...</span>
          </div>
          <p className="text-zinc-500 text-sm mt-2">This may take 10–20 seconds</p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-950/40 border border-red-800/50 rounded-xl p-4 text-red-300 text-sm">
          ❌ {error}
          <button
            onClick={() => {
              setError(null);
              setPreview(null);
            }}
            className="ml-3 underline text-red-400 hover:text-red-200"
          >
            Try again
          </button>
        </div>
      )}

      {/* Move list */}
      {moves && !loading && (
        <div className="space-y-3">
          {/* Players */}
          <div className="flex gap-3 text-sm">
            <div className="flex-1 bg-zinc-800 rounded-lg px-3 py-2">
              <span className="text-zinc-500">White: </span>
              <span className="text-zinc-200 font-medium">{whitePlayer || '—'}</span>
            </div>
            <div className="flex-1 bg-zinc-800 rounded-lg px-3 py-2">
              <span className="text-zinc-500">Black: </span>
              <span className="text-zinc-200 font-medium">{blackPlayer || '—'}</span>
            </div>
          </div>

          {/* Move grid */}
          <div className="bg-zinc-800/50 rounded-xl border border-zinc-700/50 overflow-hidden">
            <div className="grid grid-cols-3 text-xs text-zinc-500 px-4 py-2 border-b border-zinc-700/50">
              <span>#</span>
              <span>White</span>
              <span>Black</span>
            </div>
            <div className="max-h-64 overflow-y-auto divide-y divide-zinc-800">
              {moves.map((m) => {
                const ws = getMoveStatus(m.whiteConfidence, m.whiteValid);
                const bs = m.black
                  ? getMoveStatus(m.blackConfidence, m.blackValid)
                  : 'good';
                return (
                  <div
                    key={m.number}
                    className={`grid grid-cols-3 px-4 py-2 text-sm ${
                      ws !== 'good' || bs !== 'good' ? statusBg[ws === 'bad' || bs === 'bad' ? 'bad' : 'warn'] : ''
                    }`}
                  >
                    <span className="text-zinc-500">{m.number}.</span>
                    <span className={ws === 'good' ? 'text-zinc-200' : statusColor[ws]}>
                      {statusIcon[ws]} {m.white || '?'}
                    </span>
                    <span className={!m.black ? 'text-zinc-600' : bs === 'good' ? 'text-zinc-200' : statusColor[bs]}>
                      {m.black ? `${statusIcon[bs]} ${m.black}` : '—'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Legend */}
          <div className="flex gap-4 text-xs text-zinc-500">
            <span className="text-green-400">✅ Verified</span>
            <span className="text-amber-400">⚠️ Needs review</span>
            <span className="text-red-400">❌ Invalid / unclear</span>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button
              onClick={handleLoadGame}
              className="flex-1 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold py-3 rounded-xl transition-colors"
            >
              Load Game →
            </button>
            <button
              onClick={() => {
                setMoves(null);
                setError(null);
                setPreview(null);
                setShowVerifyModal(false);
              }}
              className="px-4 py-3 border border-zinc-700 hover:border-zinc-500 text-zinc-400 hover:text-zinc-200 rounded-xl text-sm transition-colors"
            >
              Upload New
            </button>
          </div>

          {verifyQueue.length > 0 && !showVerifyModal && (
            <button
              onClick={() => {
                setCurrentVerifyIndex(0);
                setVerifyInput(
                  !verifyQueue[0].currentValue || verifyQueue[0].currentValue === '?' ? '' : verifyQueue[0].currentValue
                );
                setShowVerifyModal(true);
              }}
              className="w-full py-2 text-sm text-amber-400 hover:text-amber-300 border border-amber-800/50 rounded-xl transition-colors"
            >
              ⚠️ Review {verifyQueue.length} flagged move{verifyQueue.length !== 1 ? 's' : ''}
            </button>
          )}
        </div>
      )}

      {/* Verification Modal */}
      {showVerifyModal && currentVerify && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            {/* Progress */}
            <div className="flex items-center justify-between mb-5">
              <span className="text-xs text-zinc-500 uppercase tracking-wide font-medium">
                Move Verification
              </span>
              <span className="text-xs text-zinc-500">
                {currentVerifyIndex + 1} / {verifyQueue.length}
              </span>
            </div>

            {/* Progress bar */}
            <div className="h-1 bg-zinc-800 rounded-full mb-5">
              <div
                className="h-full bg-amber-500 rounded-full transition-all"
                style={{
                  width: `${((currentVerifyIndex + 1) / verifyQueue.length) * 100}%`,
                }}
              />
            </div>

            {/* Question */}
            <div className="mb-5">
              {currentVerify.currentValue === '?' || !currentVerify.isValid ? (
                <>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="bg-red-500/20 text-red-400 text-xs font-bold px-2 py-0.5 rounded">REQUIRED</span>
                    <span className="text-zinc-400 text-xs">Cannot proceed without this</span>
                  </div>
                  <p className="text-zinc-200 font-semibold mb-1">
                    Move {currentVerify.moveNumber} — <span className="capitalize text-amber-400">{currentVerify.side}</span> is missing
                  </p>
                  <p className="text-zinc-400 text-sm">
                    The AI could not read this cell. Please enter the move manually.
                  </p>
                  {!currentVerify.isValid && currentVerify.currentValue !== '?' && (
                    <p className="text-red-400 text-xs mt-2">
                      &ldquo;{currentVerify.currentValue}&rdquo; is not a legal move here.
                    </p>
                  )}
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="bg-amber-500/20 text-amber-400 text-xs font-bold px-2 py-0.5 rounded">REVIEW</span>
                    <span className="text-zinc-400 text-xs">Confirm or correct</span>
                  </div>
                  <p className="text-zinc-300 font-medium mb-1">
                    Move {currentVerify.moveNumber} — <span className="capitalize text-amber-400">{currentVerify.side}</span>
                  </p>
                  <p className="text-zinc-400 text-sm">
                    AI best guess: <span className="font-mono text-amber-300">{currentVerify.currentValue}</span>
                    {currentVerify.confidence === 'medium' ? ' (medium confidence)' : ' (low confidence)'}
                  </p>
                </>
              )}
            </div>

            {/* Input */}
            <input
              type="text"
              value={verifyInput}
              onChange={(e) => setVerifyInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleVerifyConfirm();
              }}
              placeholder="e.g. Nf3, O-O, Bxc6+"
              className="w-full bg-zinc-800 border border-zinc-600 focus:border-amber-500/50 rounded-xl px-4 py-3 text-zinc-100 placeholder-zinc-600 font-mono text-sm focus:outline-none mb-4 transition-colors"
              autoFocus
            />

            {/* Buttons */}
            <div className="flex gap-3">
              <button
                onClick={handleVerifyConfirm}
                disabled={!verifyInput.trim()}
                className="flex-1 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed text-zinc-950 font-bold py-3 rounded-xl transition-colors text-sm"
              >
                Confirm
              </button>
              <button
                onClick={handleVerifySkip}
                className="px-4 py-3 border border-zinc-700 hover:border-zinc-500 text-zinc-400 hover:text-zinc-200 rounded-xl text-sm transition-colors"
              >
                Skip
              </button>
            </div>

            <button
              onClick={() => setShowVerifyModal(false)}
              className="w-full mt-3 text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
            >
              Dismiss — review later
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

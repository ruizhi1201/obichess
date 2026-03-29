'use client';

import { useState, useEffect } from 'react';
import { type AnalyzedMove, classificationColor, classificationLabel, formatEval } from '@/lib/chess-utils';

interface AnalysisPanelProps {
  move: AnalyzedMove | null;
  currentFen: string;
}

export default function AnalysisPanel({ move, currentFen }: AnalysisPanelProps) {
  const [explanation, setExplanation] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [ttsLoading, setTtsLoading] = useState(false);
  const [ttsStub, setTtsStub] = useState(false);

  useEffect(() => {
    if (!move) {
      setExplanation('');
      return;
    }

    // Auto-fetch explanation when move is selected
    fetchExplanation();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [move?.uci, move?.fenBefore]);

  const fetchExplanation = async () => {
    if (!move) return;

    setLoading(true);
    setExplanation('');

    try {
      const res = await fetch('/api/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fenBefore: move.fenBefore,
          fenAfter: move.fenAfter,
          moveSan: move.san,
          moveUci: move.uci,
          evalBefore: move.evalBefore,
          evalAfter: move.evalAfter,
          bestMoveSan: move.bestMoveSan,
          classification: move.classification,
        }),
      });

      const data = await res.json();
      setExplanation(data.explanation || 'Could not generate explanation.');
    } catch {
      setExplanation('Failed to get explanation. Check your connection.');
    } finally {
      setLoading(false);
    }
  };

  const handleListen = async () => {
    if (!explanation) return;

    setTtsLoading(true);
    setTtsStub(false);

    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: explanation }),
      });

      const contentType = res.headers.get('Content-Type');

      if (contentType?.includes('audio')) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.play();
      } else {
        const data = await res.json();
        if (data.stub) {
          setTtsStub(true);
        }
      }
    } catch {
      console.error('TTS failed');
    } finally {
      setTtsLoading(false);
    }
  };

  // Eval bar
  const evalScore = move?.evalAfter ?? 0;
  const clampedEval = Math.max(-600, Math.min(600, evalScore));
  const whitePercent = 50 + (clampedEval / 600) * 50;

  if (!move) {
    return (
      <div className="h-full flex flex-col p-4 gap-4">
        <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Analysis</div>
        <div className="flex-1 flex items-center justify-center text-zinc-600 text-sm text-center">
          <div>
            <div className="text-3xl mb-3">🎯</div>
            <p>Click any move to see</p>
            <p>Obi&apos;s analysis</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col p-4 gap-4">
      <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Analysis</div>

      {/* Move info */}
      <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800">
        <div className="flex items-center justify-between mb-2">
          <span className="font-mono text-xl font-bold">{move.san}</span>
          {move.classification && (
            <span
              className="text-xs font-semibold px-2 py-1 rounded-full"
              style={{
                color: classificationColor(move.classification),
                backgroundColor: classificationColor(move.classification) + '20',
              }}
            >
              {classificationLabel(move.classification)}
            </span>
          )}
        </div>

        {/* Eval bar */}
        <div className="mt-3">
          <div className="flex justify-between text-xs text-zinc-500 mb-1">
            <span>White</span>
            <span className="font-mono">
              {move.evalAfter !== undefined ? formatEval(move.evalAfter) : '—'}
            </span>
            <span>Black</span>
          </div>
          <div className="h-2 rounded-full bg-zinc-700 overflow-hidden">
            <div
              className="h-full bg-white transition-all duration-500"
              style={{ width: `${whitePercent}%` }}
            />
          </div>
        </div>

        {move.bestMoveSan && move.classification !== 'best' && (
          <div className="mt-2 text-xs text-zinc-500">
            Best move: <span className="text-emerald-400 font-mono">{move.bestMoveSan}</span>
          </div>
        )}
      </div>

      {/* Coach explanation */}
      <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800 flex-1 flex flex-col">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-lg">🤖</span>
          <span className="text-sm font-semibold text-zinc-300">Obi says</span>
          <button
            onClick={fetchExplanation}
            className="ml-auto text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
            title="Refresh explanation"
          >
            ↺
          </button>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-zinc-500 text-sm">
            <div className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
            <div className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
            <div className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
        ) : explanation ? (
          <div className="flex-1 flex flex-col gap-3">
            <p className="text-zinc-300 text-sm leading-relaxed flex-1">{explanation}</p>

            <div className="flex items-center gap-2">
              <button
                onClick={handleListen}
                disabled={ttsLoading}
                className="flex items-center gap-2 text-xs text-zinc-500 hover:text-zinc-300 transition-colors disabled:opacity-50"
              >
                {ttsLoading ? (
                  <span className="animate-pulse">⏳ Loading...</span>
                ) : (
                  <>🎙️ Listen</>
                )}
              </button>
              {ttsStub && (
                <span className="text-xs text-amber-500/70">
                  Add ElevenLabs key to enable voice
                </span>
              )}
            </div>
          </div>
        ) : (
          <div className="text-zinc-600 text-sm">Loading explanation...</div>
        )}
      </div>
    </div>
  );
}

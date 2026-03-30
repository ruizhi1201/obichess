'use client';

import { useState, useRef, useEffect } from 'react';
import { type AnalyzedMove, classificationColor, classificationLabel, formatEval } from '@/lib/chess-utils';
import { type ChatMessage } from '@/app/api/chat/route';

interface CoachPanelProps {
  move: AnalyzedMove | null;
  currentFen: string;
  userColor: 'w' | 'b';
}

export default function CoachPanel({ move, currentFen, userColor }: CoachPanelProps) {
  const [explanation, setExplanation] = useState<string>('');
  const [explanationLoading, setExplanationLoading] = useState(false);
  const [ttsLoading, setTtsLoading] = useState(false);
  const [ttsStub, setTtsStub] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [lastMoveSan, setLastMoveSan] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, explanation, explanationLoading]);

  // Fetch explanation when move changes
  useEffect(() => {
    if (!move) {
      setExplanation('');
      setLastMoveSan(null);
      return;
    }
    if (move.san === lastMoveSan) return;
    setLastMoveSan(move.san);
    setMessages([]); // reset chat when move changes
    fetchExplanation();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [move?.uci, move?.fenBefore]);

  const fetchExplanation = async () => {
    if (!move) return;
    setExplanationLoading(true);
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
          userColor,
        }),
      });
      const data = await res.json();
      setExplanation(data.explanation || 'Could not generate explanation.');
    } catch {
      setExplanation('Failed to get explanation. Check your connection.');
    } finally {
      setExplanationLoading(false);
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
        new Audio(url).play();
      } else {
        const data = await res.json();
        if (data.stub) setTtsStub(true);
      }
    } catch {
      console.error('TTS failed');
    } finally {
      setTtsLoading(false);
    }
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || chatLoading) return;

    const userMessage: ChatMessage = { role: 'user', content: text };
    const newHistory = [...messages, userMessage];
    setMessages(newHistory);
    setInput('');
    setChatLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, fen: currentFen, history: messages }),
      });
      const data = await res.json();
      setMessages([...newHistory, {
        role: 'assistant',
        content: data.reply || "Sorry, I couldn't process that.",
      }]);
    } catch {
      setMessages([...newHistory, { role: 'assistant', content: 'Connection error. Please try again.' }]);
    } finally {
      setChatLoading(false);
    }
  };

  const noMoveSelected = !move;

  return (
    <div className="flex flex-col h-full bg-zinc-950">
      {/* Header */}
      <div className="px-4 py-3 border-b border-zinc-800 flex items-center gap-2 shrink-0">
        <span className="text-lg">🤖</span>
        <span className="text-sm font-semibold text-zinc-200">Obi Coach</span>
        {move && (
          <span className="ml-auto flex items-center gap-2">
            {move.classification && (
              <span
                className="text-xs font-semibold px-2 py-0.5 rounded-full"
                style={{
                  color: classificationColor(move.classification),
                  backgroundColor: classificationColor(move.classification) + '22',
                }}
              >
                {classificationLabel(move.classification)}
              </span>
            )}
            <span className="font-mono text-base font-bold text-zinc-100">{move.san}</span>
            {move.evalAfter !== undefined && (
              <span className="text-xs text-zinc-400 font-mono">{formatEval(move.evalAfter)}</span>
            )}
          </span>
        )}
      </div>

      {/* Scrollable message area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {noMoveSelected ? (
          <div className="flex flex-col items-center justify-center h-full text-center text-zinc-600 py-12">
            <div className="text-4xl mb-3">🎯</div>
            <p className="text-sm">Click any move to get</p>
            <p className="text-sm">Obi&apos;s coaching</p>
          </div>
        ) : (
          <>
            {/* Best move hint */}
            {move.bestMoveSan && move.classification !== 'best' && (
              <div className="text-xs text-zinc-500 bg-zinc-900 rounded-lg px-3 py-2 border border-zinc-800">
                Best move: <span className="text-emerald-400 font-mono">{move.bestMoveSan}</span>
              </div>
            )}

            {/* Obi auto-explanation as a chat bubble */}
            <div className="flex gap-2">
              <div className="w-6 h-6 rounded-full bg-amber-500/20 flex items-center justify-center text-xs shrink-0 mt-0.5">O</div>
              <div className="bg-zinc-800 rounded-xl rounded-tl-sm px-3 py-2 text-sm text-zinc-300 leading-relaxed flex-1">
                {explanationLoading ? (
                  <div className="flex gap-1 items-center py-1">
                    <div className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                ) : explanation ? (
                  <>
                    <p>{explanation}</p>
                    <div className="flex items-center gap-3 mt-2 pt-2 border-t border-zinc-700/50">
                      <button
                        onClick={handleListen}
                        disabled={ttsLoading}
                        className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors disabled:opacity-50 flex items-center gap-1"
                      >
                        {ttsLoading ? '⏳ Loading...' : '🎙️ Listen'}
                      </button>
                      <button
                        onClick={fetchExplanation}
                        className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors flex items-center gap-1"
                      >
                        ↺ Refresh
                      </button>
                      {ttsStub && (
                        <span className="text-xs text-amber-500/70">Add ElevenLabs key for voice</span>
                      )}
                    </div>
                  </>
                ) : (
                  <span className="text-zinc-600">Loading...</span>
                )}
              </div>
            </div>

            {/* Chat history */}
            {messages.map((msg, i) => (
              <div key={i} className={`flex gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                {msg.role === 'assistant' && (
                  <div className="w-6 h-6 rounded-full bg-amber-500/20 flex items-center justify-center text-xs shrink-0 mt-0.5">O</div>
                )}
                <div
                  className={`max-w-[85%] rounded-xl px-3 py-2 text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-amber-500/20 text-amber-100 rounded-br-sm'
                      : 'bg-zinc-800 text-zinc-300 rounded-tl-sm'
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            ))}

            {/* Chat loading */}
            {chatLoading && (
              <div className="flex gap-2">
                <div className="w-6 h-6 rounded-full bg-amber-500/20 flex items-center justify-center text-xs shrink-0">O</div>
                <div className="bg-zinc-800 rounded-xl rounded-tl-sm px-3 py-2">
                  <div className="flex gap-1 items-center">
                    <div className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}
          </>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area — always at bottom */}
      <div className="border-t border-zinc-800 p-3 shrink-0">
        {/* Quick suggestions when no chat yet */}
        {move && messages.length === 0 && !noMoveSelected && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {["What's the plan?", "Why was this a mistake?", "What should I do next?"].map(s => (
              <button
                key={s}
                onClick={() => { setInput(s); inputRef.current?.focus(); }}
                className="text-xs text-zinc-500 hover:text-zinc-300 bg-zinc-900 hover:bg-zinc-800 px-2.5 py-1 rounded-full border border-zinc-800 transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        )}
        <form onSubmit={sendMessage} className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={noMoveSelected ? 'Select a move to ask Obi...' : 'Ask Obi anything...'}
            disabled={chatLoading || noMoveSelected}
            className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-amber-500/50 transition-colors disabled:opacity-40"
          />
          <button
            type="submit"
            disabled={!input.trim() || chatLoading || noMoveSelected}
            className="bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed text-zinc-950 font-semibold px-4 py-2 rounded-lg text-sm transition-colors shrink-0"
          >
            Ask
          </button>
        </form>
      </div>
    </div>
  );
}

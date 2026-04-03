'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { type AnalyzedMove, classificationColor, classificationLabel, formatEval } from '@/lib/chess-utils';
import { type ChatMessage } from '@/app/api/chat/route';
import { type PlayerProfile, getSkillStep } from '@/lib/player-profiles';

interface CoachPanelProps {
  move: AnalyzedMove | null;
  currentFen: string;
  userColor: 'w' | 'b';
  playerProfile?: PlayerProfile | null;
}

export default function CoachPanel({ move, currentFen, userColor, playerProfile }: CoachPanelProps) {
  const [explanation, setExplanation] = useState<string>('');
  const [explanationLoading, setExplanationLoading] = useState(false);
  const [ttsLoading, setTtsLoading] = useState(false);
  const [ttsStub, setTtsStub] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [lastMoveSan, setLastMoveSan] = useState<string | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [micEnabled, setMicEnabled] = useState(true);
  const [userHasInteracted, setUserHasInteracted] = useState(false);
  const [pendingAutoPlay, setPendingAutoPlay] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);

  // Auto-scroll to bottom — scroll ONLY within the chat container, never the page
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [messages, explanation, explanationLoading]);

  const playTts = useCallback(async (text: string, autoTriggered = false) => {
    if (!text) return;
    setTtsLoading(true);
    setTtsStub(false);
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const contentType = res.headers.get('Content-Type');
      if (contentType?.includes('audio')) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        if (autoTriggered && !userHasInteracted) {
          // Browser blocks autoplay without user gesture — queue it instead
          setPendingAutoPlay(url);
        } else {
          const audio = new Audio(url);
          audioRef.current = audio;
          audio.play().catch(() => {
            // Still blocked — show pending prompt
            setPendingAutoPlay(url);
          });
        }
      } else {
        const data = await res.json();
        if (data.stub) setTtsStub(true);
      }
    } catch {
      console.error('TTS failed');
    } finally {
      setTtsLoading(false);
    }
  }, [userHasInteracted]);

  // Play pending audio when user first interacts
  const handleUserInteraction = useCallback(() => {
    if (!userHasInteracted) {
      setUserHasInteracted(true);
      if (pendingAutoPlay) {
        const audio = new Audio(pendingAutoPlay);
        audioRef.current = audio;
        audio.play().catch(() => {});
        setPendingAutoPlay(null);
      }
    }
  }, [userHasInteracted, pendingAutoPlay]);

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
    const skillPayload = playerProfile
      ? (() => {
          const s = getSkillStep(playerProfile.uscfEquivalent);
          return {
            playerStep: s.step,
            playerUscfEquivalent: playerProfile.uscfEquivalent,
            playerLabel: s.label,
            focusAreas: s.focusAreas,
          };
        })()
      : {};
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
          moveColor: move.color,
          ...skillPayload,
        }),
      });
      const data = await res.json();
      const expl = data.explanation || 'Could not generate explanation.';
      setExplanation(expl);
      // Auto-play TTS if sound is enabled (autoTriggered=true so browser policy is handled)
      if (soundEnabled) {
        playTts(expl, true);
      }
    } catch {
      setExplanation('Failed to get explanation. Check your connection.');
    } finally {
      setExplanationLoading(false);
    }
  };

  const handleListen = async () => {
    await playTts(explanation);
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

    const skillPayload = playerProfile
      ? (() => {
          const s = getSkillStep(playerProfile.uscfEquivalent);
          return {
            playerStep: s.step,
            playerUscfEquivalent: playerProfile.uscfEquivalent,
            playerLabel: s.label,
            focusAreas: s.focusAreas,
          };
        })()
      : {};
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, fen: currentFen, history: messages, userColor, ...skillPayload }),
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

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  const handleMicClick = () => {
    if (typeof window === 'undefined') return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SpeechRecognitionCtor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognitionCtor) {
      showToast('Voice not supported in this browser');
      return;
    }

    if (isListening) {
      recognitionRef.current?.stop();
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recognition: any = new SpeechRecognitionCtor();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setInput(transcript);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.onerror = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  };

  const noMoveSelected = !move;

  return (
    <div className="flex flex-col h-full min-h-0 bg-zinc-950" onClick={handleUserInteraction}>
      {/* Pending autoplay banner — shown when browser blocked autoplay */}
      {pendingAutoPlay && soundEnabled && (
        <div
          className="bg-amber-500/10 border-b border-amber-500/30 px-4 py-2 flex items-center gap-2 cursor-pointer hover:bg-amber-500/20 transition-colors shrink-0"
          onClick={() => {
            const audio = new Audio(pendingAutoPlay);
            audioRef.current = audio;
            audio.play().catch(() => {});
            setPendingAutoPlay(null);
            setUserHasInteracted(true);
          }}
        >
          <span className="text-amber-400 text-sm">🔊</span>
          <span className="text-amber-300 text-xs">Tap here to hear Obi&apos;s coaching</span>
        </div>
      )}
      {/* Toast notification */}
      {toastMsg && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-zinc-800 border border-zinc-600 text-zinc-200 text-xs px-3 py-2 rounded-lg shadow-lg pointer-events-none">
          {toastMsg}
        </div>
      )}

      {/* Header */}
      <div className="px-4 py-3 border-b border-zinc-800 flex items-center gap-2 shrink-0">
        <span className="text-lg">🤖</span>
        <span className="text-sm font-semibold text-zinc-200 shrink-0">Obi Coach</span>
        {/* Move info — takes remaining space */}
        {move && (
          <span className="flex-1 flex items-center gap-2 min-w-0 overflow-hidden">
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
            <span className="font-mono text-base font-bold text-zinc-100 truncate">{move.san}</span>
            {move.evalAfter !== undefined && (
              <span className="text-xs text-zinc-400 font-mono shrink-0">{formatEval(move.evalAfter)}</span>
            )}
          </span>
        )}
        {/* Audio toggles — always visible, pinned to right */}
        <div className="flex items-center gap-1 ml-auto shrink-0">
          <button
            onClick={() => setSoundEnabled(v => !v)}
            title={soundEnabled ? 'Sound ON (click to mute)' : 'Sound OFF (click to enable)'}
            className={`text-sm px-1.5 py-0.5 rounded-md transition-colors ${soundEnabled ? 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30' : 'bg-zinc-800 text-zinc-500 hover:bg-zinc-700'}`}
          >
            {soundEnabled ? '🔊' : '🔇'}
          </button>
          <button
            onClick={() => setMicEnabled(v => !v)}
            title={micEnabled ? 'Mic ON (click to disable)' : 'Mic OFF (click to enable)'}
            className={`text-sm px-1.5 py-0.5 rounded-md transition-colors ${micEnabled ? 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30' : 'bg-zinc-800 text-zinc-500 hover:bg-zinc-700'}`}
          >
            {micEnabled ? '🎤' : '🚫'}
          </button>
        </div>
      </div>

      {/* Scrollable message area — overflow scoped here, never escapes to parent */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-4 space-y-3">
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
            {/* Scroll anchor — no longer uses scrollIntoView which escapes containers */}
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
          {/* Mic button — shown when micEnabled */}
          {micEnabled && (
            <button
              type="button"
              onClick={handleMicClick}
              disabled={noMoveSelected}
              title={isListening ? 'Stop recording' : 'Speak to Obi'}
              className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-colors disabled:opacity-40 ${
                isListening
                  ? 'bg-red-500 text-white animate-pulse'
                  : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'
              }`}
            >
              🎤
            </button>
          )}
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
// build: 20260403203914

'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

const VOICES = [
  { id: 'Dnd9VXpAjEGXiRGBf1O6', name: 'Parker Springfield', desc: 'TV Broadcaster (American)', emoji: '📺' },
  { id: 'cjVigY5qzO86Huf0OWal', name: 'Eric', desc: 'Smooth, Trustworthy (American)', emoji: '🎙️' },
  { id: 'bIHbv24MWmeRgasZH58o', name: 'Will', desc: 'Relaxed Optimist (American)', emoji: '😊' },
  { id: 'nPczCjzI2devNBz1zQrb', name: 'Brian', desc: 'Deep, Resonant (American)', emoji: '🔊' },
  { id: 'iP95p4xoKVk53GoZ742B', name: 'Chris', desc: 'Charming, Down-to-Earth (American)', emoji: '🤝' },
  { id: 'IKne3meq5aSn9XLyUdCD', name: 'Charlie', desc: 'Energetic, Confident (Australian)', emoji: '⚡' },
  { id: 'JBFqnCBsd6RMkjVDRZzb', name: 'George', desc: 'Warm Storyteller (British)', emoji: '📖' },
  { id: 'onwK4e9ZLuTAKqWW03F9', name: 'Daniel', desc: 'Steady Broadcaster (British)', emoji: '📻' },
  { id: 'pqHfZKP75CvOlQylNhV4', name: 'Bill', desc: 'Wise, Mature (American)', emoji: '🧠' },
  { id: 'CwhRBWXzGAHq8TQ4Fs17', name: 'Roger', desc: 'Laid-Back, Casual (American)', emoji: '😎' },
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah', desc: 'Reassuring, Confident (American)', emoji: '✨' },
  { id: 'Xb7hH8MSUJpSbSDYk0k2', name: 'Alice', desc: 'Clear Educator (British)', emoji: '🎓' },
  { id: 'XrExE9yKIg1WjnnlVkGX', name: 'Matilda', desc: 'Professional (American)', emoji: '💼' },
  { id: 'cgSgspJ2msm6clMCkdW9', name: 'Jessica', desc: 'Playful, Warm (American)', emoji: '🌟' },
  { id: 'hpp4J3VqNfWAUOO0d1Us', name: 'Bella', desc: 'Bright, Professional (American)', emoji: '🌸' },
  { id: 'pFZP5JQG7iQjIQuC4Bku', name: 'Lily', desc: 'Velvety Actress (British)', emoji: '🎭' },
];
const DEFAULT_VOICE_ID = 'Dnd9VXpAjEGXiRGBf1O6'; // Parker Springfield
const VOICE_STORAGE_KEY = 'obi_voice_preference';
import { type AnalyzedMove, type MoveInsight, classificationColor, classificationLabel, formatEval } from '@/lib/chess-utils';
import { type ChatMessage } from '@/app/api/chat/route';
import { type PlayerProfile, getSkillStep } from '@/lib/player-profiles';
import { useSubscription } from '@/lib/use-subscription';

interface CoachPanelProps {
  move: AnalyzedMove | null;
  currentFen: string;
  userColor: 'w' | 'b';
  playerProfile?: PlayerProfile | null;
  insightCache?: Map<string, MoveInsight>; // uci → insight, pre-generated
}

export default function CoachPanel({ move, currentFen, userColor, playerProfile, insightCache }: CoachPanelProps) {
  const { tier: subscriptionTier } = useSubscription();
  const [explanation, setExplanation] = useState<string>('');
  const [explanationLoading, setExplanationLoading] = useState(false);
  const [insight, setInsight] = useState<MoveInsight | null>(null);
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
  const [isTtsPlaying, setIsTtsPlaying] = useState(false);
  const [selectedVoiceId, setSelectedVoiceId] = useState<string>(DEFAULT_VOICE_ID);
  const [showVoicePicker, setShowVoicePicker] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);

  // Load saved voice preference
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(VOICE_STORAGE_KEY);
      if (saved && VOICES.find(v => v.id === saved)) setSelectedVoiceId(saved);
    }
  }, []);

  // Close voice picker on outside click
  useEffect(() => {
    if (!showVoicePicker) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-voice-picker]')) setShowVoicePicker(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showVoicePicker]);

  // Auto-scroll to bottom — scroll ONLY within the chat container, never the page
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [messages, explanation, explanationLoading]);

  const stopTts = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    setIsTtsPlaying(false);
  }, []);

  const playTts = useCallback(async (text: string, autoTriggered = false) => {
    if (!text) return;
    // Stop any currently playing audio first
    stopTts();
    setTtsLoading(true);
    setTtsStub(false);
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voiceId: selectedVoiceId }),
      });
      const contentType = res.headers.get('Content-Type');
      if (contentType?.includes('audio')) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const playAudio = (audioUrl: string) => {
          const audio = new Audio(audioUrl);
          audioRef.current = audio;
          setIsTtsPlaying(true);
          audio.onended = () => setIsTtsPlaying(false);
          audio.onerror = () => setIsTtsPlaying(false);
          audio.play().catch(() => {
            setIsTtsPlaying(false);
            setPendingAutoPlay(audioUrl);
          });
        };
        if (autoTriggered && !userHasInteracted) {
          // Browser blocks autoplay without user gesture — queue it instead
          setPendingAutoPlay(url);
        } else {
          playAudio(url);
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
  }, [userHasInteracted, stopTts, selectedVoiceId]);

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

  // Fetch insight when move changes — check cache first for instant load
  useEffect(() => {
    if (!move) {
      setExplanation('');
      setInsight(null);
      setLastMoveSan(null);
      return;
    }
    if (move.san === lastMoveSan) return;
    setLastMoveSan(move.san);
    setMessages([]); // reset chat when move changes

    // Check cache first — instant load if available
    const cached = move.uci ? insightCache?.get(move.uci) : undefined;
    if (cached) {
      setInsight(cached);
      setExplanation(cached.explanation);
      setExplanationLoading(false);
      if (soundEnabled) playTts(cached.explanation, true);
      return;
    }

    // Cache miss — fetch from API
    fetchInsight();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [move?.uci, move?.fenBefore, insightCache]);

  const fetchInsight = async () => {
    if (!move) return;
    setExplanationLoading(true);
    setExplanation('');
    setInsight(null);
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
      const res = await fetch('/api/move-insight', {
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
          moveIndex: move.moveNumber - 1,
          subscriptionTier,
          materialBefore: move.materialBefore,
          materialAfter: move.materialAfter,
          capturedPiece: move.capturedPiece,
          inTactic: move.inTactic,
          ...skillPayload,
        }),
      });
      const data = await res.json();
      const expl = data.explanation || 'Could not generate explanation.';
      const moveInsight: MoveInsight = {
        explanation: expl,
        winOddsChange: data.winOddsChange || '0.0%',
        alternatives: data.alternatives || [],
        opening: data.opening,
      };
      setInsight(moveInsight);
      setExplanation(expl);
      // Auto-play TTS if sound is enabled
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
        body: JSON.stringify({ message: text, fen: currentFen, history: messages, userColor, subscriptionTier, ...skillPayload }),
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

    // Stop TTS immediately when user starts speaking — mic takes priority
    stopTts();
    setUserHasInteracted(true);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recognition: any = new SpeechRecognitionCtor();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      // Auto-submit the voice message immediately (don't just fill input)
      const userMessage = { role: 'user' as const, content: transcript };
      const newHistory = [...messages, userMessage];
      setMessages(newHistory);
      setInput('');
      setChatLoading(true);
      const skillPayload = playerProfile
        ? (() => {
            const s = getSkillStep(playerProfile.uscfEquivalent);
            return { playerStep: s.step, playerUscfEquivalent: playerProfile.uscfEquivalent, playerLabel: s.label, focusAreas: s.focusAreas };
          })()
        : {};
      fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: transcript, fen: currentFen, history: messages, userColor, subscriptionTier, ...skillPayload }),
      }).then(r => r.json()).then(data => {
        const reply = data.reply || "Sorry, I couldn't process that.";
        setMessages([...newHistory, { role: 'assistant', content: reply }]);
        // Auto-play Obi's response via TTS
        if (soundEnabled) playTts(reply, false);
      }).catch(() => {
        setMessages([...newHistory, { role: 'assistant', content: 'Connection error. Please try again.' }]);
      }).finally(() => setChatLoading(false));
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
            const audio = new Audio(pendingAutoPlay!);
            audioRef.current = audio;
            setIsTtsPlaying(true);
            audio.onended = () => setIsTtsPlaying(false);
            audio.onerror = () => setIsTtsPlaying(false);
            audio.play().catch(() => setIsTtsPlaying(false));
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
        <div className="flex items-center gap-1 ml-auto shrink-0 relative" data-voice-picker>
          {/* Voice picker button */}
          {soundEnabled && (
            <button
              onClick={() => setShowVoicePicker(v => !v)}
              title="Choose voice"
              className="text-xs px-1.5 py-0.5 rounded-md bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 transition-colors flex items-center gap-0.5"
            >
              {VOICES.find(v => v.id === selectedVoiceId)?.emoji ?? '🎙️'}
              <span className="hidden sm:inline text-[10px]">{VOICES.find(v => v.id === selectedVoiceId)?.name ?? 'Voice'}</span>
              <span className="text-[10px] text-zinc-600">▾</span>
            </button>
          )}
          {/* Voice picker dropdown */}
          {showVoicePicker && (
            <div className="absolute right-0 top-8 z-50 bg-zinc-900 border border-zinc-700 rounded-xl shadow-xl w-64 max-h-72 overflow-y-auto">
              <div className="px-3 py-2 border-b border-zinc-800 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Choose Obi&apos;s Voice</div>
              {VOICES.map(voice => (
                <button
                  key={voice.id}
                  onClick={() => {
                    setSelectedVoiceId(voice.id);
                    localStorage.setItem(VOICE_STORAGE_KEY, voice.id);
                    setShowVoicePicker(false);
                    stopTts(); // stop current audio when switching voice
                  }}
                  className={`w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-zinc-800 transition-colors ${selectedVoiceId === voice.id ? 'bg-amber-500/10 border-l-2 border-amber-500' : ''}`}
                >
                  <span className="text-base">{voice.emoji}</span>
                  <div>
                    <div className={`text-xs font-semibold ${selectedVoiceId === voice.id ? 'text-amber-400' : 'text-zinc-200'}`}>{voice.name}</div>
                    <div className="text-[10px] text-zinc-500">{voice.desc}</div>
                  </div>
                  {selectedVoiceId === voice.id && <span className="ml-auto text-amber-400 text-xs">✓</span>}
                </button>
              ))}
            </div>
          )}
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
            {/* Win odds change + alternatives (always shown if available) */}
            {insight && (
              <div className="space-y-2">
                {/* Win odds change chip */}
                <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-900 rounded-lg border border-zinc-800 text-xs">
                  <span className="text-zinc-500">Win odds</span>
                  <span className={`font-mono font-bold ${insight.winOddsChange.startsWith('+') ? 'text-emerald-400' : insight.winOddsChange.startsWith('-') ? 'text-red-400' : 'text-zinc-300'}`}>
                    {insight.winOddsChange}
                  </span>
                  {move.evalAfter !== undefined && (
                    <span className="text-zinc-500 font-mono">{formatEval(move.evalAfter)}</span>
                  )}
                </div>

                {/* Alternative moves from engine */}
                {insight.alternatives.length > 0 && (
                  <div className="bg-zinc-900 rounded-lg border border-zinc-800 px-3 py-2">
                    <div className="text-[10px] text-zinc-600 uppercase tracking-wider mb-1.5">Engine Alternatives</div>
                    <div className="space-y-1">
                      {insight.alternatives.map((alt, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs">
                          <span className="text-zinc-400 w-4">{i + 1}.</span>
                          <span className={`font-mono font-bold ${i === 0 ? 'text-emerald-400' : 'text-zinc-300'}`}>{alt.san}</span>
                          <span className="text-zinc-600 font-mono text-[10px]">({alt.winOdds}%)</span>
                          <span className={`ml-auto font-mono text-[10px] ${alt.delta === 'best' ? 'text-emerald-500' : alt.delta.startsWith('+') ? 'text-emerald-500/70' : 'text-red-400/70'}`}>
                            {alt.delta === 'best' ? 'best' : alt.delta}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Opening analysis for early moves */}
                {insight.opening && (
                  <div className="bg-indigo-900/20 rounded-lg border border-indigo-800/30 px-3 py-2">
                    <div className="text-[10px] text-indigo-400 uppercase tracking-wider mb-1">Opening</div>
                    <div className="text-sm font-semibold text-indigo-200">{insight.opening.name}</div>
                    {insight.opening.continuations && insight.opening.continuations.length > 0 && (
                      <div className="mt-1.5 space-y-0.5">
                        {insight.opening.continuations.map((c, i) => (
                          <div key={i} className="text-xs text-indigo-300/70 font-mono">{c}</div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

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
                        onClick={isTtsPlaying ? stopTts : handleListen}
                        disabled={ttsLoading}
                        className={`text-xs transition-colors disabled:opacity-50 flex items-center gap-1 ${isTtsPlaying ? 'text-amber-400 hover:text-red-400' : 'text-zinc-500 hover:text-zinc-300'}`}
                      >
                        {ttsLoading ? '⏳ Loading...' : isTtsPlaying ? '⏹ Stop' : '🎙️ Listen'}
                      </button>
                      <button
                        onClick={fetchInsight}
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

'use client';

import { useState, useRef, useEffect } from 'react';
import { type ChatMessage } from '@/app/api/chat/route';
import { useSubscription } from '@/lib/use-subscription';

interface ChatPanelProps {
  currentFen: string;
}

export default function ChatPanel({ currentFen }: ChatPanelProps) {
  const { tier: subscriptionTier } = useSubscription();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isExpanded) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isExpanded]);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading) return;

    const userMessage: ChatMessage = { role: 'user', content: text };
    const newHistory = [...messages, userMessage];

    setMessages(newHistory);
    setInput('');
    setLoading(true);
    setIsExpanded(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          fen: currentFen,
          history: messages,
          subscriptionTier,
        }),
      });

      const data = await res.json();
      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: data.reply || 'Sorry, I couldn\'t process that.',
      };

      setMessages([...newHistory, assistantMessage]);
    } catch {
      setMessages([...newHistory, {
        role: 'assistant',
        content: 'Connection error. Please try again.',
      }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <span className="text-lg">💬</span>
          <span className="text-sm font-semibold">Ask Obi</span>
          <span className="text-xs text-zinc-500">What if I played...?</span>
        </div>
        {messages.length > 0 && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            {isExpanded ? '▲ Hide' : '▼ Show'}
          </button>
        )}
      </div>

      {isExpanded && messages.length > 0 && (
        <div className="max-h-64 overflow-y-auto p-4 space-y-3">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
            >
              <div
                className={`max-w-[85%] rounded-xl px-3 py-2 text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-amber-500/20 text-amber-100 rounded-br-sm'
                    : 'bg-zinc-800 text-zinc-300 rounded-bl-sm'
                }`}
              >
                {msg.content}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex gap-2 items-center">
              <div className="bg-zinc-800 rounded-xl rounded-bl-sm px-3 py-2">
                <div className="flex gap-1 items-center">
                  <div className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      )}

      <form onSubmit={sendMessage} className="flex items-center gap-2 p-3">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="What if I played Rg8 instead?"
          className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-amber-500/50 transition-colors"
          disabled={loading}
        />
        <button
          type="submit"
          disabled={!input.trim() || loading}
          className="bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed text-zinc-950 font-semibold px-4 py-2 rounded-lg text-sm transition-colors shrink-0"
        >
          Ask
        </button>
      </form>

      {messages.length === 0 && (
        <div className="px-4 pb-3 flex flex-wrap gap-2">
          {[
            "What's the best move here?",
            "What's the plan?",
            "What if I castled now?",
          ].map((suggestion) => (
            <button
              key={suggestion}
              onClick={() => {
                setInput(suggestion);
                inputRef.current?.focus();
              }}
              className="text-xs text-zinc-500 hover:text-zinc-300 bg-zinc-800 hover:bg-zinc-700 px-3 py-1.5 rounded-full transition-colors"
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

import Link from 'next/link';

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col">
      {/* Nav */}
      <nav className="border-b border-zinc-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-2xl">♟️</span>
          <span className="font-bold text-xl tracking-tight">Obi-Chess</span>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/analyze" className="text-zinc-400 hover:text-zinc-100 text-sm transition-colors">
            Analyze
          </Link>
          <Link href="/dashboard" className="text-zinc-400 hover:text-zinc-100 text-sm transition-colors">
            Dashboard
          </Link>
          <Link
            href="/analyze"
            className="bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold px-4 py-2 rounded-lg text-sm transition-colors"
          >
            Start Analyzing
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-24 text-center">
        <div className="inline-flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 rounded-full px-4 py-1.5 text-amber-400 text-sm font-medium mb-8">
          <span>🔬</span> Powered by Stockfish + GPT-4o
        </div>

        <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-6 max-w-4xl">
          Your personal{' '}
          <span className="text-amber-400">chess coach</span>,
          {' '}available 24/7
        </h1>

        <p className="text-zinc-400 text-xl max-w-2xl mb-12 leading-relaxed">
          Upload any game, and Obi will analyze every move with Stockfish precision,
          then explain it in plain English — just like a real coach would.
        </p>

        <div className="flex flex-col sm:flex-row gap-4">
          <Link
            href="/analyze"
            className="bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold px-8 py-4 rounded-xl text-lg transition-colors"
          >
            Analyze a Game →
          </Link>
          <Link
            href="/dashboard"
            className="border border-zinc-700 hover:border-zinc-500 text-zinc-300 font-semibold px-8 py-4 rounded-xl text-lg transition-colors"
          >
            View My Games
          </Link>
        </div>
      </div>

      {/* Features */}
      <div className="border-t border-zinc-800 px-6 py-24">
        <div className="max-w-5xl mx-auto grid md:grid-cols-3 gap-8">
          {[
            {
              icon: '♟️',
              title: 'Stockfish Analysis',
              desc: 'Every move analyzed to depth 18+. Blunders, mistakes, and brilliant moves flagged automatically.',
            },
            {
              icon: '💬',
              title: 'Coach Explanations',
              desc: 'GPT-4o explains every move in plain language — what went wrong, what you should have seen, what the plan is.',
            },
            {
              icon: '🎙️',
              title: 'Voice Coaching',
              desc: 'Hear your coach\'s feedback out loud. Like having a grandmaster in your corner.',
            },
          ].map((f) => (
            <div key={f.title} className="bg-zinc-900 rounded-2xl p-6 border border-zinc-800">
              <div className="text-4xl mb-4">{f.icon}</div>
              <h3 className="font-bold text-lg mb-2">{f.title}</h3>
              <p className="text-zinc-400 text-sm leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-zinc-800 px-6 py-6 text-center text-zinc-600 text-sm">
        © 2025 Obi-Chess. Built for competitive players.
      </footer>
    </main>
  );
}

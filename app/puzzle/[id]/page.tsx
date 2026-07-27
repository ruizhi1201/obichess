import { Metadata } from 'next';
import PuzzlePageClient from './PuzzlePageClient';

// ── Types ──────────────────────────────────────────────

interface PuzzleData {
  id: string;
  fen: string;
  solution: string[];
  player_name: string;
  player_elo: number | null;
  difficulty: number;
  difficulty_score: number | null;
  opponent_name: string | null;
  tournament: string | null;
  explanation: string;
  created_at: string;
}

// ── Fetch puzzle ──────────────────────────────────────

async function getPuzzle(id: string): Promise<PuzzleData | null> {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://obichess.com';
  const res = await fetch(`${baseUrl}/api/puzzles/${id}`, {
    cache: 'no-store',
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.puzzle;
}

// ── OG Metadata ────────────────────────────────────────

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const puzzle = await getPuzzle(id);

  if (!puzzle) {
    return {
      title: 'Puzzle Not Found — ObiChess',
    };
  }

  const stars = '★'.repeat(puzzle.difficulty) + '☆'.repeat(5 - puzzle.difficulty);
  const title = `Can you find ${puzzle.player_name}'s winning move?`;
  const description = `${puzzle.player_name} (${puzzle.player_elo || '?'}) found this move. Difficulty: ${stars} | Black to move`;

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://obichess.com';

  return {
    title: `${title} — ObiChess`,
    description,
    openGraph: {
      title,
      description,
      type: 'website',
      siteName: 'ObiChess',
      url: `${baseUrl}/puzzle/${puzzle.id}`,
      images: [
        {
          url: `${baseUrl}/api/og/puzzle?id=${puzzle.id}`,
          width: 1200,
          height: 630,
          alt: title,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [`${baseUrl}/api/og/puzzle?id=${puzzle.id}`],
    },
  };
}

// ── Page ───────────────────────────────────────────────

export default async function PuzzlePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const puzzle = await getPuzzle(id);

  if (!puzzle) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-white mb-4">Puzzle Not Found</h1>
          <p className="text-slate-400 mb-6">
            This puzzle may have been removed or the link is incorrect.
          </p>
          <a
            href="/"
            className="text-amber-400 hover:text-amber-300 underline"
          >
            Go to ObiChess →
          </a>
        </div>
      </div>
    );
  }

  return <PuzzlePageClient puzzle={puzzle} />;
}

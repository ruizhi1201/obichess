import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import type { PuzzleCandidate } from '@/lib/puzzle-utils';

/**
 * POST /api/puzzles
 * Create a new puzzle from game analysis data.
 * Body: { fen, solution, playerName, playerElo, difficulty, difficultyScore,
 *         opponentName, tournament?, explanation, gameId?, creatorUserId? }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const supabase = createServiceClient();

    const puzzle = {
      fen: body.fen,
      solution: body.solution,
      player_name: body.playerName,
      player_elo: body.playerElo || null,
      difficulty: body.difficulty || 3,
      difficulty_score: body.difficultyScore || null,
      opponent_name: body.opponentName || null,
      tournament: body.tournament || null,
      explanation: body.explanation || '',
      game_id: body.gameId || null,
      creator_user_id: body.creatorUserId || null,
    };

    const { data, error } = await supabase
      .from('puzzles')
      .insert(puzzle)
      .select('id')
      .single();

    if (error) {
      console.error('Failed to create puzzle:', error);

      // Detect table-not-found vs other errors
      if (error.code === '42P01' || error.message?.includes('relation')) {
        return NextResponse.json(
          { error: 'Puzzles table not set up. Run migration: supabase/migrations/003_puzzles.sql' },
          { status: 500 },
        );
      }

      return NextResponse.json(
        { error: 'Failed to create puzzle', details: error.message },
        { status: 500 },
      );
    }

    const shareUrl = `${process.env.NEXT_PUBLIC_SITE_URL || 'https://obichess.com'}/puzzle/${data.id}`;

    return NextResponse.json({
      id: data.id,
      shareUrl,
    });
  } catch (err: any) {
    console.error('POST /api/puzzles error:', err);
    return NextResponse.json(
      { error: 'Internal error', details: err.message },
      { status: 500 },
    );
  }
}

/**
 * GET /api/puzzles
 * List recent puzzles (optional: ?player=name to filter).
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createServiceClient();
    const { searchParams } = new URL(request.url);
    const player = searchParams.get('player');
    const limit = Math.min(Number(searchParams.get('limit')) || 20, 50);

    let query = supabase
      .from('puzzles')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (player) {
      query = query.ilike('player_name', `%${player}%`);
    }

    const { data, error } = await query;

    if (error) {
      if (error.code === '42P01') {
        return NextResponse.json({ puzzles: [] });
      }
      throw error;
    }

    return NextResponse.json({ puzzles: data || [] });
  } catch (err: any) {
    console.error('GET /api/puzzles error:', err);
    return NextResponse.json(
      { error: 'Internal error', details: err.message },
      { status: 500 },
    );
  }
}

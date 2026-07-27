import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';

/**
 * GET /api/puzzles/[id]
 * Fetch a single puzzle by ID (public, no auth required).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = createServiceClient();

    const { data, error } = await supabase
      .from('puzzles')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === '42P01') {
        return NextResponse.json(
          { error: 'Puzzles not set up yet' },
          { status: 404 },
        );
      }
      return NextResponse.json(
        { error: 'Puzzle not found' },
        { status: 404 },
      );
    }

    return NextResponse.json({ puzzle: data });
  } catch (err: any) {
    console.error('GET /api/puzzles/[id] error:', err);
    return NextResponse.json(
      { error: 'Internal error', details: err.message },
      { status: 500 },
    );
  }
}

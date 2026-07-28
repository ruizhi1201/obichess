import { supabase } from './supabase';

export type RatingType = 'USCF' | 'FIDE' | 'Chess.com' | 'Lichess' | 'Other';

export interface PlayerProfile {
  id: string;          // UUID from Supabase (auto-generated for new profiles)
  name: string;
  ratingType: RatingType;
  rating: number;
  uscfEquivalent: number;
  createdAt: number;   // epoch ms
  updatedAt: number;   // epoch ms
}

/** Fetch all profiles for the currently authenticated user */
export async function getProfiles(): Promise<PlayerProfile[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    console.warn('getProfiles: No authenticated user');
    return [];
  }

  const { data, error } = await supabase
    .from('player_profiles')
    .select('*')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false });

  if (error) {
    console.error('getProfiles: Supabase error:', error.message, error.details, error.hint);
    return [];
  }
  if (!data) return [];

  return data.map((row: any) => ({
    id: row.id,
    name: row.name,
    ratingType: (row.rating_type as RatingType) ?? 'USCF',
    rating: row.rating ?? 0,
    uscfEquivalent: row.uscf_equivalent ?? 0,
    createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
    updatedAt: row.updated_at ? new Date(row.updated_at).getTime() : Date.now(),
  }));
}

/** Save (insert or update) a profile.
 *  For new profiles, leave id empty — DB auto-generates UUID.
 *  For updates, pass the existing UUID. */
export async function saveProfile(p: PlayerProfile): Promise<PlayerProfile> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const row: Record<string, unknown> = {
    user_id: user.id,
    name: p.name,
    rating_type: p.ratingType,
    rating: p.rating,
    uscf_equivalent: p.uscfEquivalent,
    updated_at: new Date().toISOString(),
  };

  // For existing profiles, include the id so upsert matches on it
  if (p.id) {
    row.id = p.id;
  }

  const { data, error } = await supabase
    .from('player_profiles')
    .upsert(row, { onConflict: 'id' })
    .select()
    .single();

  if (error) {
    console.error('saveProfile: Supabase error:', error.message, error.details, error.hint);
    throw new Error(`Failed to save profile: ${error.message}`);
  }

  // Return the saved profile with proper ID (especially important for new profiles)
  return {
    id: data.id,
    name: data.name,
    ratingType: (data.rating_type as RatingType) ?? 'USCF',
    rating: data.rating ?? 0,
    uscfEquivalent: data.uscf_equivalent ?? 0,
    createdAt: data.created_at ? new Date(data.created_at).getTime() : Date.now(),
    updatedAt: data.updated_at ? new Date(data.updated_at).getTime() : Date.now(),
  };
}

/** Delete a profile by ID */
export async function deleteProfile(id: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('player_profiles')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) {
    console.error('deleteProfile: Supabase error:', error.message, error.details, error.hint);
    throw new Error(`Failed to delete profile: ${error.message}`);
  }
}

export function computeUscfEquivalent(rating: number, type: RatingType): number {
  switch (type) {
    case 'Chess.com':
      return rating - 200;
    case 'Lichess':
      return rating - 400;
    default:
      return rating;
  }
}

export type SkillCategory = 'Beginner' | 'Intermediate' | 'Advanced' | 'Competitive/Elite';

export interface SkillStep {
  step: number;
  label: string;
  category: SkillCategory;
  focusAreas: string[];
}

/**
 * Maps a USCF-equivalent rating to a skill step and category:
 *
 *   Step 1 — Beginner           (< 500)
 *   Step 2 — Intermediate       (500–1399)
 *   Step 3 — Advanced           (1400–1799)
 *   Step 4 — Competitive/Elite  (1800+)
 */
export function getSkillStep(uscfEq: number): SkillStep {
  if (uscfEq < 500) {
    return {
      step: 1,
      label: 'Beginner',
      category: 'Beginner',
      focusAreas: [
        'Board awareness',
        'how pieces move',
        'basic captures',
        'check and checkmate concepts',
        'castling',
        'pawn rules (promotion, en passant)',
        'simple mating patterns (back-rank, two-rook)',
      ],
    };
  }
  if (uscfEq < 1400) {
    return {
      step: 2,
      label: 'Intermediate',
      category: 'Intermediate',
      focusAreas: [
        'Tactics fundamentals',
        'forks and double attacks',
        'pins and skewers',
        'discovered attack',
        'mate in 1–2',
        'basic pawn endings',
        'piece coordination',
        'opening principles (center control, development, king safety)',
      ],
    };
  }
  if (uscfEq < 1800) {
    return {
      step: 3,
      label: 'Advanced',
      category: 'Advanced',
      focusAreas: [
        'Pawn structure and weak squares',
        'open files and rook activity',
        'attack on the castled king',
        'strategic planning',
        'rook and queen endgames',
        'multi-move tactics (interference, luring, blocking)',
        'passed pawn technique',
        'pawn breaks and breakthrough',
      ],
    };
  }
  return {
    step: 4,
    label: 'Competitive/Elite',
    category: 'Competitive/Elite',
    focusAreas: [
      'King safety evaluation',
      'prophylaxis and positional restraint',
      'deep strategic planning',
      'bishop vs knight imbalances',
      'complex endgame technique',
      'outposts and piece coordination',
      'advanced defensive resources',
      'opening preparation and transpositions',
    ],
  };
}
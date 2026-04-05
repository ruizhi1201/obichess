export type RatingType = 'USCF' | 'FIDE' | 'Chess.com' | 'Lichess' | 'Other';

export interface PlayerProfile {
  id: string; // uuid
  name: string;
  ratingType: RatingType;
  rating: number;
  uscfEquivalent: number; // computed
  createdAt: number;
  updatedAt: number;
}

const STORAGE_KEY = 'obichess_profiles';

export function getProfiles(): PlayerProfile[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PlayerProfile[]) : [];
  } catch {
    return [];
  }
}

export function saveProfile(p: PlayerProfile): void {
  if (typeof window === 'undefined') return;
  const profiles = getProfiles();
  const idx = profiles.findIndex((x) => x.id === p.id);
  if (idx >= 0) {
    profiles[idx] = p;
  } else {
    profiles.push(p);
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));
}

export function deleteProfile(id: string): void {
  if (typeof window === 'undefined') return;
  const profiles = getProfiles().filter((p) => p.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));
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
 *   Step 1 — Beginner           (<500)
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

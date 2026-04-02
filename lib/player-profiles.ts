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

export interface SkillStep {
  step: number;
  label: string;
  focusAreas: string[];
}

export function getSkillStep(uscfEq: number): SkillStep {
  if (uscfEq < 600) {
    return {
      step: 1,
      label: 'U600',
      focusAreas: [
        'Board/pieces',
        'basic moves',
        'attack/capture',
        'check/checkmate basics',
        'castling',
        'pawn rules',
        'basic mating patterns',
      ],
    };
  }
  if (uscfEq < 1200) {
    return {
      step: 2,
      label: 'U1200',
      focusAreas: [
        'Tactics fundamentals',
        'double attack',
        'pins',
        'eliminating defence',
        'mate in two',
        'discovered attack',
        'basic pawn endings',
      ],
    };
  }
  if (uscfEq < 1400) {
    return {
      step: 3,
      label: 'U1400',
      focusAreas: [
        'Discovered/double check',
        'attack on pinned piece',
        'X-ray',
        'key squares',
        'pawn square rule',
        'defending against double attack',
        'mini plans',
      ],
    };
  }
  if (uscfEq < 1600) {
    return {
      step: 4,
      label: 'U1600',
      focusAreas: [
        'Preparatory moves',
        'interfering',
        'luring',
        'blocking',
        'pin tactics',
        'passed pawns',
        'attack on castled king',
        '7th rank',
        'weak pawns',
      ],
    };
  }
  if (uscfEq < 1800) {
    return {
      step: 5,
      label: 'U1800',
      focusAreas: [
        'Pawn structure',
        'strong squares',
        'open files',
        'rook endings',
        'strategic play',
        'breakthrough',
        'pawn races',
        'defending complex positions',
      ],
    };
  }
  if (uscfEq < 2000) {
    return {
      step: 6,
      label: 'U2000',
      focusAreas: [
        'King safety',
        'mobility',
        'deep strategy',
        'bishop vs knight',
        'king attacks',
        'complex endgames',
        'advanced defending',
      ],
    };
  }
  return {
    step: 7,
    label: 'Expert',
    focusAreas: [
      'King safety',
      'mobility',
      'deep strategy',
      'bishop vs knight',
      'king attacks',
      'complex endgames',
      'advanced defending',
    ],
  };
}

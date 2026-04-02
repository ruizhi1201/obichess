'use client';

import { useState, useEffect, useRef } from 'react';
import {
  type PlayerProfile,
  type RatingType,
  getProfiles,
  saveProfile,
  deleteProfile,
  computeUscfEquivalent,
  getSkillStep,
} from '@/lib/player-profiles';

interface PlayerProfileModalProps {
  onSelect: (profile: PlayerProfile) => void;
  onClose?: () => void;
}

function generateId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

const RATING_TYPES: RatingType[] = ['USCF', 'FIDE', 'Chess.com', 'Lichess', 'Other'];

export default function PlayerProfileModal({ onSelect, onClose }: PlayerProfileModalProps) {
  const [step, setStep] = useState<'select' | 'form'>('select');
  const [profiles, setProfiles] = useState<PlayerProfile[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingProfile, setEditingProfile] = useState<PlayerProfile | null>(null);
  const [focusRating, setFocusRating] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [ratingType, setRatingType] = useState<RatingType>('USCF');
  const [rating, setRating] = useState<number | ''>('');

  const ratingRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const loaded = getProfiles();
    setProfiles(loaded);
    if (loaded.length > 0) setSelectedId(loaded[0].id);
  }, []);

  useEffect(() => {
    if (focusRating && ratingRef.current) {
      ratingRef.current.focus();
      setFocusRating(false);
    }
  }, [focusRating, step]);

  const openCreate = () => {
    setEditingProfile(null);
    setName('');
    setRatingType('USCF');
    setRating('');
    setStep('form');
  };

  const openEdit = (profile: PlayerProfile) => {
    setEditingProfile(profile);
    setName(profile.name);
    setRatingType(profile.ratingType);
    setRating(profile.rating);
    setStep('form');
  };

  const openUpdateRating = (profile: PlayerProfile) => {
    setEditingProfile(profile);
    setName(profile.name);
    setRatingType(profile.ratingType);
    setRating(profile.rating);
    setFocusRating(true);
    setStep('form');
  };

  const handleSave = () => {
    if (!name.trim() || rating === '' || rating < 0) return;
    const uscfEq = computeUscfEquivalent(Number(rating), ratingType);
    const now = Date.now();
    const profile: PlayerProfile = {
      id: editingProfile?.id ?? generateId(),
      name: name.trim(),
      ratingType,
      rating: Number(rating),
      uscfEquivalent: uscfEq,
      createdAt: editingProfile?.createdAt ?? now,
      updatedAt: now,
    };
    saveProfile(profile);
    const updated = getProfiles();
    setProfiles(updated);
    setSelectedId(profile.id);
    setStep('select');
  };

  const handleDelete = (id: string) => {
    deleteProfile(id);
    const updated = getProfiles();
    setProfiles(updated);
    if (selectedId === id) {
      setSelectedId(updated.length > 0 ? updated[0].id : null);
    }
  };

  const handleNext = () => {
    if (!selectedId) {
      // No profiles yet — open create
      openCreate();
      return;
    }
    const profile = profiles.find((p) => p.id === selectedId);
    if (profile) onSelect(profile);
  };

  // Live computed values for form
  const liveUscf =
    rating !== '' ? computeUscfEquivalent(Number(rating), ratingType) : null;
  const liveStep = liveUscf !== null ? getSkillStep(liveUscf) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl">
        {step === 'select' ? (
          <>
            {/* Header */}
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-xl font-bold">Who&apos;s playing?</h2>
              {onClose && (
                <button
                  onClick={onClose}
                  className="text-zinc-500 hover:text-zinc-300 text-sm"
                >
                  ✕
                </button>
              )}
            </div>
            <p className="text-zinc-400 text-sm mb-5">
              Select your profile so Obi can coach at the right level.
            </p>

            {/* Profile list */}
            {profiles.length === 0 ? (
              <div className="text-center py-6 text-zinc-500 text-sm">
                No profiles yet. Create one below!
              </div>
            ) : (
              <div className="space-y-2 mb-4 max-h-60 overflow-y-auto pr-1">
                {profiles.map((p) => {
                  const skillStep = getSkillStep(p.uscfEquivalent);
                  const isSelected = p.id === selectedId;
                  return (
                    <div
                      key={p.id}
                      onClick={() => setSelectedId(p.id)}
                      className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer border transition-all ${
                        isSelected
                          ? 'border-amber-500 bg-amber-500/10'
                          : 'border-zinc-700 bg-zinc-800 hover:border-zinc-600'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-zinc-100 truncate">{p.name}</div>
                        <div className="text-xs text-zinc-400">
                          {p.ratingType} {p.rating} · ≈{p.uscfEquivalent} USCF · Step{' '}
                          {skillStep.step} {skillStep.label}
                        </div>
                      </div>
                      {isSelected && (
                        <div className="flex gap-1.5 shrink-0">
                          <button
                            onClick={(e) => { e.stopPropagation(); openEdit(p); }}
                            className="text-xs text-zinc-400 hover:text-zinc-100 bg-zinc-700 hover:bg-zinc-600 px-2 py-1 rounded-lg transition-colors"
                          >
                            Edit
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); openUpdateRating(p); }}
                            className="text-xs text-amber-400 hover:text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 px-2 py-1 rounded-lg transition-colors"
                          >
                            Update Rating
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDelete(p.id); }}
                            className="text-xs text-zinc-600 hover:text-red-400 bg-zinc-700 hover:bg-zinc-600 px-2 py-1 rounded-lg transition-colors"
                          >
                            ✕
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 mt-4">
              <button
                onClick={openCreate}
                className="flex-1 border border-zinc-600 hover:border-zinc-400 text-zinc-300 hover:text-zinc-100 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors"
              >
                + New Profile
              </button>
              <button
                onClick={handleNext}
                disabled={profiles.length > 0 && !selectedId}
                className="flex-1 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed text-zinc-950 font-bold px-4 py-2.5 rounded-xl text-sm transition-colors"
              >
                Next →
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Form header */}
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-xl font-bold">
                {editingProfile ? 'Edit Profile' : 'New Profile'}
              </h2>
              <button
                onClick={() => setStep('select')}
                className="text-zinc-500 hover:text-zinc-300 text-sm"
              >
                ← Back
              </button>
            </div>
            <p className="text-zinc-400 text-sm mb-5">
              Enter your details to get skill-matched coaching.
            </p>

            <div className="space-y-4">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1">
                  Player Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  className="w-full bg-zinc-800 border border-zinc-700 focus:border-amber-500/60 rounded-xl px-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition-colors"
                />
              </div>

              {/* Rating Type */}
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1">
                  Rating Platform
                </label>
                <select
                  value={ratingType}
                  onChange={(e) => setRatingType(e.target.value as RatingType)}
                  className="w-full bg-zinc-800 border border-zinc-700 focus:border-amber-500/60 rounded-xl px-3 py-2.5 text-sm text-zinc-100 outline-none transition-colors"
                >
                  {RATING_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              {/* Rating */}
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1">
                  Rating
                </label>
                <input
                  ref={ratingRef}
                  type="number"
                  min={0}
                  max={3500}
                  value={rating}
                  onChange={(e) =>
                    setRating(e.target.value === '' ? '' : Number(e.target.value))
                  }
                  placeholder="e.g. 1200"
                  className="w-full bg-zinc-800 border border-zinc-700 focus:border-amber-500/60 rounded-xl px-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition-colors"
                />
                {liveUscf !== null && liveStep !== null && (
                  <div className="mt-2 space-y-1">
                    <div className="text-xs text-zinc-400">
                      ≈ <span className="text-zinc-200 font-semibold">{liveUscf}</span> USCF
                    </div>
                    <div className="text-xs text-zinc-400">
                      Skill Level:{' '}
                      <span className="text-amber-400 font-semibold">
                        Step {liveStep.step} — {liveStep.label}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <button
              onClick={handleSave}
              disabled={!name.trim() || rating === ''}
              className="w-full mt-6 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed text-zinc-950 font-bold px-4 py-2.5 rounded-xl text-sm transition-colors"
            >
              Save Profile
            </button>
          </>
        )}
      </div>
    </div>
  );
}

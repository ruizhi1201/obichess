'use client';

import { useState, useRef } from 'react';
import ScoresheetUploader from './ScoresheetUploader';

const SAMPLE_PGN = `[Event "FIDE World Championship 2023"]
[Site "Astana, Kazakhstan"]
[Date "2023.04.09"]
[Round "1"]
[White "Nepomniachtchi, Ian"]
[Black "Ding, Liren"]
[Result "1/2-1/2"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 O-O 8. c3 d5 9. exd5 Nxd5 10. Nxe5 Nxe5 11. Rxe5 c6 12. d4 Bd6 13. Re1 Qh4 14. g3 Qh3 15. Be3 Bg4 16. Qd3 Rae8 17. Nd2 Re6 18. a4 bxa4 19. Bxa4 Nxe3 20. Rxe3 Rxe3 21. fxe3 f5 22. Qf1 Qxf1+ 23. Rxf1 f4 24. exf4 Rxf4 25. Rxf4 Bxf4 26. Nf3 Bxf3 27. Bxc6 Be4 28. Ba4 Kf7 29. Kf2 Ke6 30. Ke3 Bh1 31. b4 Be7 32. c4 Bg2 33. b5 axb5 34. cxb5 Bf3 35. Kd3 Kd5 36. b6 Bxb6 37. Bb3+ Kc6 38. Bxg8 h5 39. Bb3 Bh1 40. Ke3 Bd5 41. Kf4 Bc4 42. Be6 Bd5 43. Bg8 h4 44. gxh4 Bh1 45. Ke3 Bg2 46. Kd3 Bh1 1/2-1/2`;

interface PGNUploaderProps {
  onLoad: (pgn: string, trainingFocus?: string) => void;
}

export default function PGNUploader({ onLoad }: PGNUploaderProps) {
  const [mode, setMode] = useState<'paste' | 'file' | 'photo'>('paste');
  const [pgn, setPgn] = useState('');
  const [trainingFocus, setTrainingFocus] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = pgn.trim();
    if (trimmed) {
      onLoad(trimmed, trainingFocus.trim() || undefined);
    }
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = ev.target?.result as string;
      if (content) {
        onLoad(content, trainingFocus.trim() || undefined);
      }
    };
    reader.readAsText(file);
  };

  const loadSample = () => {
    onLoad(SAMPLE_PGN, trainingFocus.trim() || undefined);
  };

  // Shared training focus input rendered in all modes
  const TrainingFocusInput = () => (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-zinc-400 flex items-center gap-1.5">
        🎯 <span>Training Focus</span>
        <span className="text-zinc-600 font-normal">(optional)</span>
      </label>
      <input
        type="text"
        value={trainingFocus}
        onChange={(e) => setTrainingFocus(e.target.value)}
        placeholder='e.g. "Focus on endgame", "Reduce blunders", "Plan better"'
        maxLength={120}
        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-amber-500/50 transition-colors"
      />
      <p className="text-[11px] text-zinc-600">
        Obi will tailor the analysis insights to your specific goal.
      </p>
    </div>
  );

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div className="text-center mb-8">
        <div className="text-5xl mb-4">♟️</div>
        <h2 className="text-2xl font-bold mb-2">Analyze Your Game</h2>
        <p className="text-zinc-400">Upload a PGN file or paste your game notation</p>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
        {/* Mode tabs */}
        <div className="flex gap-1 bg-zinc-800 rounded-lg p-1 mb-6">
          <button
            onClick={() => setMode('paste')}
            className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${
              mode === 'paste'
                ? 'bg-zinc-700 text-zinc-100'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            Paste PGN
          </button>
          <button
            onClick={() => setMode('file')}
            className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${
              mode === 'file'
                ? 'bg-zinc-700 text-zinc-100'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            Upload File
          </button>
          <button
            onClick={() => setMode('photo')}
            className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${
              mode === 'photo'
                ? 'bg-zinc-700 text-zinc-100'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            📷 Photo
          </button>
        </div>

        {mode === 'photo' ? (
          <div className="space-y-4">
            <ScoresheetUploader onLoad={(pgn) => onLoad(pgn, trainingFocus.trim() || undefined)} />
            <TrainingFocusInput />
          </div>
        ) : mode === 'paste' ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <textarea
              value={pgn}
              onChange={(e) => setPgn(e.target.value)}
              placeholder={`[Event "My Game"]\n[White "Me"]\n[Black "Opponent"]\n\n1. e4 e5 2. Nf3 Nc6 ...`}
              className="w-full h-48 bg-zinc-800 border border-zinc-700 rounded-xl p-4 text-sm text-zinc-200 placeholder-zinc-600 font-mono focus:outline-none focus:border-amber-500/50 resize-none transition-colors"
            />
            <TrainingFocusInput />
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={!pgn.trim()}
                className="flex-1 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed text-zinc-950 font-bold py-3 rounded-xl transition-colors"
              >
                Analyze Game
              </button>
              <button
                type="button"
                onClick={loadSample}
                className="px-4 py-3 border border-zinc-700 hover:border-zinc-500 text-zinc-400 hover:text-zinc-200 rounded-xl text-sm transition-colors"
              >
                Load Sample
              </button>
            </div>
          </form>
        ) : mode === 'file' ? (
          <div className="space-y-4">
            <div
              onClick={() => fileRef.current?.click()}
              className="border-2 border-dashed border-zinc-700 hover:border-zinc-500 rounded-xl p-12 text-center cursor-pointer transition-colors"
            >
              <div className="text-4xl mb-3">📂</div>
              <div className="text-zinc-400 font-medium">Click to upload a .pgn file</div>
              <div className="text-zinc-600 text-sm mt-1">or drag and drop</div>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".pgn,.txt"
              onChange={handleFile}
              className="hidden"
            />
            <TrainingFocusInput />
            <button
              onClick={loadSample}
              className="w-full py-3 border border-zinc-700 hover:border-zinc-500 text-zinc-400 hover:text-zinc-200 rounded-xl text-sm transition-colors"
            >
              Or load a sample game
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}


CREATE TABLE IF NOT EXISTS public.puzzles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  fen TEXT NOT NULL,
  solution TEXT[] NOT NULL,
  player_name TEXT NOT NULL,
  player_elo INTEGER,
  difficulty INTEGER DEFAULT 1 CHECK (difficulty >= 1 AND difficulty <= 5),
  difficulty_score INTEGER,
  opponent_name TEXT,
  tournament TEXT,
  explanation TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  game_id TEXT,
  creator_user_id UUID REFERENCES public.profiles(id)
);

-- Enable RLS but allow public read
ALTER TABLE public.puzzles ENABLE ROW LEVEL SECURITY;

-- Anyone can read puzzles (for shared links)
CREATE POLICY "Anyone can read puzzles" ON public.puzzles
  FOR SELECT USING (true);

-- Authenticated users can create puzzles
CREATE POLICY "Users can create puzzles" ON public.puzzles
  FOR INSERT WITH CHECK (true);

-- Service role can delete
CREATE POLICY "Service can manage puzzles" ON public.puzzles
  USING (true);

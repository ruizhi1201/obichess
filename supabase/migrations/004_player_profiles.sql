CREATE TABLE IF NOT EXISTS public.player_profiles (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  rating_type TEXT NOT NULL DEFAULT 'USCF',
  rating INTEGER NOT NULL DEFAULT 0,
  uscf_equivalent INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.player_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own profiles" ON public.player_profiles
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own profiles" ON public.player_profiles
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own profiles" ON public.player_profiles
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own profiles" ON public.player_profiles
  FOR DELETE USING (auth.uid() = user_id);
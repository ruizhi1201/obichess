import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Server-side client with service role key (for admin operations)
export function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}

export type Profile = {
  id: string;
  email: string | null;
  display_name: string | null;
  rating: number | null;
  created_at: string;
};

export type Game = {
  id: string;
  user_id: string | null;
  pgn: string;
  title: string | null;
  analysis: Record<string, unknown> | null;
  created_at: string;
};

export type CoachTranscript = {
  id: string;
  user_id: string | null;
  content: string;
  focus_areas: Record<string, unknown> | null;
  created_at: string;
};

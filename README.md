# ♟️ Obi-Chess — AI Chess Coach

An AI-powered chess coaching app that combines Stockfish engine analysis with GPT-4o explanations in a human coach voice. Built for competitive youth chess players.

## Tech Stack

- **Next.js 16** (App Router) + TypeScript + Tailwind CSS
- **chess.js** — game logic, PGN parsing
- **react-chessboard** — board UI
- **Stockfish.wasm** — browser-side engine analysis
- **OpenAI GPT-4o** — move explanations + freestyle chat
- **ElevenLabs** — TTS voice coaching (stubbed, add key to enable)
- **Supabase** — auth + database
- **Stripe** — payments (wired, ready for products)

## Features

### ✅ Built & Working
1. **PGN Upload/Paste** — upload `.pgn` file or paste notation
2. **Interactive Board** — navigate moves forward/backward with highlights
3. **Stockfish Analysis** — depth-16 analysis, centipawn eval bar
4. **Move Classification** — Best / Good / Inaccuracy / Mistake / Blunder
5. **Best Move Arrow** — green arrow showing engine's best move
6. **GPT-4o Explanations** — coach voice, auto-loads on move click
7. **Freestyle Chat** — "What if I played X?" with board context
8. **ElevenLabs TTS Stub** — ready for key, shows prompt when stubbed
9. **Supabase Auth** — Google OAuth login
10. **Game Persistence** — saves analyzed games per user
11. **Dark Chess Theme** — premium aesthetic

## Setup

### 1. Clone & Install

```bash
git clone https://github.com/ruizhi1201/obichess.git
cd obichess
npm install
```

### 2. Environment Variables

Copy `.env.local.example` to `.env.local` and fill in:

```env
NEXT_PUBLIC_SUPABASE_URL=https://czfwjtkntetqgodndhmc.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
OPENAI_API_KEY=...
ELEVENLABS_API_KEY=placeholder  # Replace with real key when ready
STRIPE_SECRET_KEY=...
```

### 3. Database Setup

Run the SQL in `supabase/migrations/001_initial_schema.sql` in your Supabase SQL Editor.

Also configure Google OAuth in Supabase:
- Authentication → Providers → Google → Enable
- Add redirect URL: `https://yourdomain.com/auth/callback`

### 4. Run

```bash
npm run dev
```

## Supabase Schema

Three tables created by the migration:
- `profiles` — user profiles (linked to auth.users)
- `games` — stored PGN games with analysis JSON
- `coach_transcripts` — saved coach feedback

## ElevenLabs Voice

When ready, add your ElevenLabs API key to `.env.local`:
```
ELEVENLABS_API_KEY=your_key_here
```
The TTS endpoint (`/api/tts`) will automatically use it. Voice: Adam (deep, authoritative coach voice).

## Deploy to Vercel

```bash
vercel --token YOUR_VERCEL_TOKEN
```

Add all environment variables in Vercel dashboard.

## What Still Needs Ruizhi's Input

- [ ] **ElevenLabs API key** — add to enable voice coaching
- [ ] **Google OAuth setup** in Supabase dashboard (redirect URLs)
- [ ] **Custom domain** — configure in Vercel
- [ ] **Stripe products** — create subscription plans in Stripe dashboard
- [ ] **GitHub repo** — needs to be created at github.com/new then push with: `git push -u origin main`

# Changelog

All notable changes to ObiChess.

---

## [v0.5.0] — 2026-07-28

### Win Odds Chart (Two-Tone Eval Visualization)

- **Two-tone area chart:** White fill above centerline (White advantage) + black fill below (Black advantage), matching Lichess visual convention. Uses `EvalChart.tsx` with Recharts `AreaChart`.
- **Continuous connecting line:** A single unbroken `Area` trace overlays the full `winningChances` curve, bridging the gap when eval crosses the 50% mark. Previously two separate area strokes terminated at y=0, creating a disconnected look.
- **Classification dots:** Colored dots rendered inline on the curve — green (Best), yellow (Inaccuracy), orange (Mistake), red (Blunder). Click navigates to that move.
- **Tooltip:** Hover shows move number, SAN notation, eval score (cp or mate), and move quality label.
- **Eval POV fix:** All Stockfish scores converted from side-to-move perspective to White's perspective before charting. Eliminates oscillation on Black moves (bug: eval flipped sign with each turn, causing sawtooth pattern).
- **Mate eval fix:** Raw Stockfish mate value preserved directly (not reverse-engineered from cp sentinel). Mate sign correctly converted to White's POV. Previous approach reverse-engineered `Math.ceil(1000 - abs(cp))` from +/-30000 sentinel, producing wrong sign and bogus distances.
- **Depth increase:** Stockfish analysis depth raised from 22 to 24 across all analysis calls. At depth 22, WASM Stockfish occasionally found depth-artifact mate distances (e.g., mate in 296) instead of clean centipawn scores. Depth 24 matches native binary behavior.

### Player Profiles — Cloud Sync

- **Supabase migration:** Player profiles moved from `localStorage` (`obichess_profiles` key) to `player_profiles` table in Supabase. Profiles survive browser switches, incognito, and devices.
- **Schema:** `id UUID PK (gen_random_uuid())`, `user_id UUID FK to auth.users`, `name TEXT`, `rating_type TEXT`, `rating INT`, `uscf_equivalent INT`, timestamps.
- **RLS:** Four policies (SELECT/INSERT/UPDATE/DELETE) all scoped to `auth.uid() = user_id`.
- **lib/player-profiles.ts:** All CRUD functions now async Supabase calls. `saveProfile()` returns the saved profile (with DB-generated UUID for new profiles). `getProfiles()` fetches filtered by user.
- **PlayerProfileModal.tsx:** Loading states, error banners (red toast on failure), save confirmation, UUID-based ID generation removed (DB auto-generates).
- **Rating platform picker:** USCF, FIDE, Chess.com, Lichess, Other — with auto USCF-equivalent conversion (Chess.com -200, Lichess -400).
- **Skill step mapping:** Beginner under 500 to Intermediate 500-1399 to Advanced 1400-1799 to Competitive/Elite 1800+.

### Puzzle Engine

- Already built in prior sprint, but documented and status updated. Extraction algorithm, ELO filtering (playerELO-100 to playerELO+300), Best Moment Card fallback, public solve page at /puzzle/[id], two entry points (nav button + last-move trigger).

### Technical Debt and Fixes

- Removed broken mate fallback in `analyze/page.tsx` — was using `results[i].mate` (eval-before position) when `results[i+1].mate` was null, producing wrong sign.
- Removed duplicate `link_to_page` blocks from Notion ObiChess Home — these + existing `child_page` blocks caused "documents appearing twice."
- Notion structure reorganized: ObiChess Home -> PRD, Dev Plan, Market Analysis.
- `lastMate` variable extracted from `try` block scope to fix `lastResult.mate` reference error.

### Files Changed

| File | Change |
|---|---|
| `components/EvalChart.tsx` | Two-tone area fills, continuous line, classification dots |
| `app/analyze/page.tsx` | Depth 22 to 24, raw mate eval, `lastMate` scope fix |
| `lib/stockfish.ts` | Mate value preserved alongside sentinel cp |
| `lib/player-profiles.ts` | localStorage to Supabase async CRUD |
| `components/PlayerProfileModal.tsx` | Async save, error banners, UUID IDs |
| `supabase/migrations/004_player_profiles.sql` | DROP + CREATE with correct schema |
| `package.json` | Version bump 0.1.0 to 0.5.0 |

---

## [v0.1.0] — 2026-05 (initial)

- Next.js 16 App Router + TypeScript + Tailwind setup
- PGN upload, interactive board, move navigation
- Stockfish engine analysis (depth 22), move classification
- DeepSeek AI coaching (single-call architecture)
- Supabase auth (Google OAuth), Stripe payment integration
- Material evaluation, tactic detection, trap engine, Opening Explorer
- Puzzle Engine extraction and sharing

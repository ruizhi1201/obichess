# Plan: Tactic Pattern Detection & Trap Engine

## Goal
Enhance middle-game analysis by detecting tactical patterns (forks, pins, discovered attacks, skewers, hanging pieces) and trap moves, enriching AI coaching with richer context.

## Files

### 1. `lib/tactics.ts` — Enhanced
**Add board-level pattern detection** using chess.js board queries:
- `detectForks(fen, color)` — a piece attacks 2+ higher-value opponent pieces
- `detectPins(fen, color)` — absolute pin: sliding piece attacks through opponent piece to king
- `detectDiscoveredAttacks(fenBefore, fenAfter, color)` — moved piece reveals attack from behind
- `detectSkewers(fen, color)` — sliding piece attacks king through lower-value piece
- `detectHangingPieces(fen, color)` — undefended pieces under attack

Export `TacticalPattern` type: `'fork' | 'pin' | 'discovered' | 'skewer' | 'hanging' | 'trade'`

Keep existing `detectTactics()` (capture-sequence) unchanged. Add new `detectPatterns()` returning `TacticalPattern[]`.

### 2. `lib/trap-engine.ts` — NEW
**Detect subtle trap moves** where eval barely changes but opponent has limited responses:
- Heuristic: move class "best"/"good" + win odds swing <1% + creates threats + opponent has ≤2 sensible replies
- `detectTraps(move, boardState)` → `TrapResult | null`
- `TrapResult`: `{ description, threatDescription, opponentOptions }`
- Verification: optionally use Lichess multi-PV to confirm trap (deferred — too slow inline)

### 3. `lib/chess-utils.ts` — Extended
- Add `TacticalPattern` type
- Add to `AnalyzedMove`: `tacticalPatterns?: TacticalPattern[]`, `isTrap?: boolean`, `trapDescription?: string`

### 4. `app/analyze/page.tsx` — Wired
- After Stockfish analysis: call `detectPatterns()` per move
- After patterns: call `detectTraps()` per move
- Annotate `analyzedMoves` with pattern/trap data
- Pass to AI prompt via enriched move data

### 5. `lib/game-analysis-client.ts` — Enriched prompt
- Add `tacticalPatterns` and `isTrap` to input move type
- Include tactical context in significant moves summary text
- Add per-move tactic/trap info to unusual moves

### 6. `components/CoachPanel.tsx` — Rich fallback
- Replace generic fallback text with tactical descriptions
- E.g., "Fork! Your knight attacks both the queen and rook." instead of "Solid move"
- Show trap banner when move is a trap

## Non-goals
- Multi-PV verification per move (too slow for now — deferred)
- Opening trap book (patterns only)
- Endgame tablebase integration

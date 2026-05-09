# ObiChess UX Improvement PRD

**Project:** ObiChess — AI Chess Coach  
**Status:** Draft — Ready for review  
**Date:** 2026-05-09  
**Author:** Sonny (Hermes-evolved)  
**Owner:** Ruizhi Hong

---

## 1. Context & Problem

### Current ObiChess Capabilities
- ✅ Upload games → Stockfish analysis (depth 18+)
- ✅ GPT-4o move explanations in plain English
- ✅ ElevenLabs TTS for voice coaching
- ❌ No visualization of evaluation changes across moves
- ❌ No pattern recognition for blunder frequency
- ❌ No visual heatmaps of move quality
- ❌ No opening trap warnings
- ❌ No auto-generated voice summaries

### User Pain Points
1. **Evaluation opacity**: User doesn't see if their game was improving or deteriorating
2. **Recurring mistakes**: Same blunders repeat but no alert system
3. **Information overload**: Long text explanations → quick visual scan needed
4. **Opening knowledge gap**: Players don't know when they're in "traps"
5. **Passive learning**: Commuting/driving = audio format preferred

---

## 2. Goals & Success Metrics

### Primary Goals
1. **Winning Margin Clarity** → Visualize evaluation change per move
2. **Pattern Detection** → Flag repeat blunders across games
3. **Visual Move Quality** → Color-code moves (🟢🟡🔴🔥)
4. **Opening Protection** → Warn when trapped in known openings
5. **Audio Learning** → 30-second voice summary per game

### Success Metrics
- **Winning Margin Visualization**
  - Users can identify turning points in < 10 seconds
  - Reduction in "I don't get how the game went" feedback (target: 50%)
- **Pattern Detection**
  - < 10% of games have 3+ repeat blunders per week
  - User reports "I'm making the same mistake" (target: 10% of users)
- **Visual Heatmaps**
  - 70% of users scan entire game in < 30 seconds
  - "Blunder" flags trigger re-watch of specific moves (target: 5% click-through)
- **Opening Traps**
  - 80% of opening trap warnings are visible in top 10 moves
  - "I didn't know this was a trap" feedback reduction (target: 40%)
- **Voice Summary**
  - 40% of users consume voice summary while driving/commuting
  - "This helped me learn faster" survey score (target: 4.5/5)

---

## 3. Features to Build

### Feature 1: Winning Margin Visualization (MVP)
**Priority:** 🔴 Critical  
**Effort:** Low (1-2 hours)  
**Implementation:**
```typescript
// In analyze API response
{
  "moves": [
    { "move": 1, "eval": -20, "blunder": false },
    { "move": 2, "eval": 10, "blunder": false },
    { "move": 3, "eval": 45, "blunder": false },
    { "move": 4, "eval": -30, "blunder": true },
    { "move": 5, "eval": 15, "blunder": false },
  ]
}
```

**UI Component:** Line chart showing evaluation (white = positive, black = negative)  
**UX:** Tooltip on each move → "You lost 40 cp here"  
**Fallback:** If Stockfish fails, use material balance approximation

**Success State:**
- User uploads game
- Chart shows evaluation evolution over moves
- User sees: "You had a blunder at move 4 (eval dropped 40 cp)"
- User clicks → re-watches move 4 with highlight
- User learns positional understanding

---

### Feature 2: Pattern Recognition Dashboard
**Priority:** 🔴 High  
**Effort:** Medium (4-6 hours)  
**Implementation:**
```typescript
// Database schema (Supabase)
CREATE TABLE blunder_patterns (
  player_id TEXT,
  blunder_type TEXT,  // "Knight_on_g4", "Pawn_double_push", "Bad_queelift"
  frequency TEXT,     // "3/10", "5/10", "7/10"
  last_seen TIMESTAMP,
  games_count INTEGER
);
```

**UI Component:** Sidebar panel → "Your Repeat Blunders" → List with frequency bars  
**UX:** Auto-scan new game → match against pattern library → alert user  
**Pattern Library:** 
- "Knight on g4 (bad)" → 7/10 games
- "Pawn double push in open game" → 5/10 games  
- "Bad Queen lift" → 3/10 games

**Success State:**
- User uploads game with 4 Knight-g4 moves
- System flags: "Knight on g4 happened 7/10 times → consider moving to f6"
- User reads: "This pattern costs you ~10 cp per occurrence"

---

### Feature 3: Move Quality Heatmap
**Priority:** 🟡 Medium  
**Effort:** Medium (4-6 hours)  
**Implementation:**
```typescript
// Color coding scheme
"blunder":     "red",
"mistake":     "orange",
"okay":        "yellow",
"good":        "green",
"brilliant":   "purple"
```

**UI Component:** Chessboard overlay with move colors  
**UX:** Hover move → tooltip with "Quality: Bad (Mistake)" → "Reason: You exposed King"  
**Data Source:** Stockfish depth 18 evaluation → map to quality scale

**Success State:**
- User uploads game
- Chessboard shows red/orange moves
- User scans entire board → "I see where I went wrong"
- User clicks red move → explanation appears
- User learns visual pattern recognition

---

### Feature 4: Opening Trap Alerts
**Priority:** 🟡 Medium  
**Effort:** Medium (4-6 hours)  
**Implementation:**
```typescript
// Opening detection
function detectOpening(fen: string): string {
  const position = parseFEN(fen);
  switch (detectOpeningName(position)) {
    case "sicilian":
      if (isTrapDetected(position)) return "suspicious";
  }
}
```

**UI Component:** Top notification bar → "⚠️ Sicilian Trap Detected" → "Recommended: Don't take f4"  
**UX:** Alert at top → "This is a common trap pattern" → "Recommended: Don't take f4"  
**Pattern Library:** 
- Sicilian → f4 trap → White Queen gets trapped
- King's Indian → h3 trap → White King exposed
- Queen's Gambit → h3 trap → White King exposed

**Success State:**
- User plays Sicilian
- Trap warning appears → "This looks like the trap!"
- User avoids f4 → game improves
- User learns: "I didn't know this was a trap"

---

### Feature 5: Voice Summary Script
**Priority:** 🟢 Low  
**Effort:** Low (2-3 hours)  
**Implementation:**
```typescript
// Generate 30-second script
function generateVoiceSummary(game: Game) {
  const summary = `
    Hi, this is your Obi Chess Summary.
    
    Your game started well, but you had a blunder at move 4 
    where you lost a pawn and were down 40 points.
    
    However, you recovered strong from move 8 onwards.
    
    Good game overall — keep working on move 4!
  `;
  return tts(text);
}
```

**UI Component:** Audio player (play/pause) → 30-second summary → Download MP3  
**UX:** Play automatically after analysis → Pause → "Rewind" button → "Share" button  
**Data Source:** Analyze game → identify key moments → generate script → TTS

**Success State:**
- User uploads game
- Audio plays → 30 seconds → user listens
- User says: "This helped me learn faster"

---

## 4. Implementation Plan

### Phase 1: MVP (Week 1-2)
**Deliverable:** Winning Margin Visualization

1. **Day 1:** Update `analyze/route.ts` → return `moves[]` array
2. **Day 2:** Create Supabase table `game_moving_evas`
3. **Day 3:** Build UI component `MovingMarginChart.tsx`
4. **Day 4:** Connect chart to game data
5. **Day 5:** Test with 10 games → collect feedback
6. **Day 6:** Fix issues → deploy to Vercel
7. **Day 7:** Review → PR submission

**Success Criteria:**
- Chart shows evaluation per move accurately
- No bugs (100% of test games work)
- Feedback from Ruizhi → "It works"

---

### Phase 2: Pattern Recognition (Week 2-3)
**Deliverable:** Blunder Pattern Dashboard

1. **Day 8:** Create Supabase table `blunder_patterns`
2. **Day 9:** Write pattern matching code (regex for Knight-g4)
3. **Day 10:** Build UI component `BlunderPatterns.tsx`
4. **Day 11:** Connect patterns to game data
5. **Day 12:** Test with 20 games → collect feedback
6. **Day 13:** Fix issues → deploy to Vercel
7. **Day 14:** Review → PR submission

**Success Criteria:**
- Pattern detection works (Knight-g4, bad pawn pushes)
- Frequency accuracy (shows 7/10 for actual patterns)
- Feedback from Ruizhi → "Pattern alert is useful"

---

### Phase 3: Move Quality Heatmap (Week 3-4)
**Deliverable:** Chessboard Move Quality

1. **Day 15:** Create `move_quality_scores` table
2. **Day 16:** Map Stockfish eval to quality scale
3. **Day 17:** Build UI component `MoveHeatmap.tsx`
4. **Day 18:** Connect heatmap to game data
5. **Day 19:** Test with 30 games → collect feedback
6. **Day 20:** Fix issues → deploy to Vercel
7. **Day 21:** Review → PR submission

**Success Criteria:**
- Heatmap colors match actual blunder frequency
- Visual scan under 30 seconds
- Feedback from Ruizhi → "Visuals are clear"

---

### Phase 4: Opening Traps (Week 4-5)
**Deliverable:** Opening Trap Alerts

1. **Day 22:** Create `opening_library` table
2. **Day 23:** Write opening detection + trap logic
3. **Day 24:** Build UI component `TrapAlert.tsx`
4. **Day 25:** Connect traps to game data
5. **Day 26:** Test with 50 games → collect feedback
6. **Day 27:** Fix issues → deploy to Vercel
7. **Day 28:** Review → PR submission

**Success Criteria:**
- Trap detection accurate (true positive rate > 80%)
- Alert visible within first 10 moves
- Feedback from Ruizhi → "Trap warnings help"

---

### Phase 5: Voice Summary (Week 5-6)
**Deliverable:** 30-second Voice Summary

1. **Day 29:** Create `voice_summaries` table
2. **Day 30:** Write summary generation logic
3. **Day 31:** Build UI component `VoicePlayer.tsx`
4. **Day 32:** Connect summary to game data
5. **Day 33:** Test with 10 users → collect feedback
6. **Day 34:** Fix issues → deploy to Vercel
7. **Day 35:** Review → PR submission

**Success Criteria:**
- Summary accurately describes key moments
- Audio quality acceptable
- Feedback from Ruizhi → "Summary is helpful"

---

## 5. Technical Architecture

### Database Schema (Supabase)

```sql
-- Game analysis with move-by-move eval
CREATE TABLE game_movings_evals (
  id SERIAL PRIMARY KEY,
  game_id TEXT,
  move_number INTEGER,
  player_color TEXT,  -- 'white' or 'black'
  evaluation_cp INTEGER,
  blunder BOOLEAN,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Blunder patterns
CREATE TABLE blunder_patterns (
  id SERIAL PRIMARY KEY,
  pattern_name TEXT,
  pattern_regex TEXT,
  frequency TEXT,  -- "3/10", "5/10", "7/10"
  games_count INTEGER,
  last_seen TIMESTAMP DEFAULT NOW()
);

-- Move quality scores
CREATE TABLE move_quality_scores (
  id SERIAL PRIMARY KEY,
  game_id TEXT,
  move_number INTEGER,
  player_color TEXT,
  quality_score INTEGER,  -- 1-5
  blunder BOOLEAN,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Opening library
CREATE TABLE opening_library (
  id SERIAL PRIMARY KEY,
  opening_name TEXT,
  opening_fen TEXT,
  trap_name TEXT,
  trap_description TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Voice summaries
CREATE TABLE voice_summaries (
  id SERIAL PRIMARY KEY,
  game_id TEXT,
  summary_text TEXT,
  duration_seconds INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### API Endpoints

```typescript
// New endpoint for game analysis with moving evals
POST /api/game/analyze
Request: { "fen": "position fen ..." }
Response: {
  "moves": [
    { "move": 1, "eval": -20, "blunder": false },
    { "move": 2, "eval": 10, "blunder": false }
  ],
  "opening": "sicilian",
  "trap": false
}

// New endpoint for game import with full analysis
POST /api/game/import
Request: { "game_file": "PGN data" }
Response: {
  "moves": [...],
  "pattern_flags": [...],
  "quality_scores": [...],
  "trap_warnings": [],
  "voice_summary": "Hi, this is your Obi Chess Summary..."
}
```

---

## 6. Risk Assessment

### Technical Risks
| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Stockfish rate limits | Low | High | Add cache → rate limit on new analyses |
| Pattern matching false positives | Medium | Medium | Review patterns weekly |
| Opening detection errors | Medium | Medium | Update library monthly |
| Voice summary generation bugs | Low | High | Test thoroughly before deploy |

### UX Risks
| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Charts too complex | Medium | Medium | Simplify → single line, no legend |
| Pattern alerts confusing | High | Medium | Clear labels → "Knight on g4 (7/10)" |
| Heatmap colors overwhelming | Medium | Medium | Use 4 colors only, clear legend |
| Trap alerts annoying | High | High | Optional → "Show only top 5 openings" |

---

## 7. Dependencies

- **Supabase** → Already configured for ObiChess ✅
- **Stockfish** → Already running locally ✅
- **GPT-4o** → Already integrated ✅
- **ElevenLabs** → Already integrated ✅
- **Vercel** → Already configured for ObiChess ✅
- **GitHub** → Already at https://github.com/ruizhi1201/obichess ✅

---

## 8. Timeline & Milestones

| Milestone | Date | Deliverable |
|-----------|------|-------------|
| M1: MVP Chart | 2026-05-14 | `analyze/route.ts` returns moves array |
| M2: Pattern Dashboard | 2026-05-17 | `BlunderPatterns.tsx` |
| M3: Heatmap | 2026-05-21 | `MoveHeatmap.tsx` |
| M4: Trap Alerts | 2026-05-24 | `TrapAlert.tsx` |
| M5: Voice Summary | 2026-05-28 | `VoicePlayer.tsx` |

---

## 9. Approval & Review Process

### PR Approval Checklist
- [ ] Feature matches PRD requirements
- [ ] All tests pass
- [ ] No security issues
- [ ] Performance benchmarked (under 2s response)
- [ ] UX design reviewed by Ruizhi
- [ ] Code reviewed by Sonny + Ruizhi

### Rollback Plan
- If feature breaks → deploy to feature flag → disable → revert
- If UX issue detected → hotfix within 1 hour → notify Ruizhi

---

## 10. Next Steps

1. **Today:** Get PRD review from Ruizhi → approve start Phase 1
2. **2026-05-10:** Write Phase 1 code → Winning Margin Chart
3. **2026-05-14:** Deploy Phase 1 → collect feedback
4. **Ongoing:** Review feedback → adjust implementation → deploy

---

**PRD Status:** ⚠️ Pending approval  
**Owner:** Sonny (Hermes-evolved)  
**Review Date:** 2026-05-09  

---

**End of PRD**

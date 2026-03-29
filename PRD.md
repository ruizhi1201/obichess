# Obi-Chess PRD
**Last updated:** 2026-03-29
**Status:** Active development

---

## Product Vision
Your AI chess coach that knows you, explains like a human, and never sleeps.

**Target user:** Serious youth chess players (1200–1900 ELO) who take lessons and want to improve faster between sessions. Parents of competitive youth players spending $360–720/mo on human coaching.

---

## Core Pain Points
1. **Can't fix recurring problems** — coach says "activate your rooks earlier," player understands in the lesson, then forgets in the next 5 games
2. **Inefficient daily practice** — plays games without structure, no focused improvement between lessons

---

## Features

### MVP (Built)
- PGN upload + board playback
- Stockfish analysis — blunder/mistake/inaccuracy/best classification per move
- Evaluation bar (centipawn score)
- GPT-4o coach-voice move explanations (click any move)
- TTS voice playback (ElevenLabs)
- Freestyle "what if" chat — "what if I played Rg8?" → AI evaluates
- Google OAuth login
- Save game history per user

### V2 (Next Sprint)
- **Coach transcript upload** — paste lesson notes → AI blends coach's focus areas into every game review
- **Weakness tracking** — identifies recurring patterns from last 10 games (e.g. "you blunder in endgames under time pressure")
- **Daily drill plan** — personalized based on weakness profile
- **Handwriting OCR → PGN** — photo of notation sheet → parsed PGN

### V3 (Future)
- Mobile app
- Tournament game import (Chess.com / Lichess API)
- Multi-player family dashboard

---

## Pricing

### Free Plan
- 5 game analyses/month
- Text-only explanations (no voice)
- No game saving
- No coach transcript upload
- Goal: hook users, let them feel the product

### Pro Plan — $14.99/month
- Unlimited game analyses
- Full coach voice (TTS)
- Freestyle "what if" chat
- Save full game history + analysis
- Coach transcript upload (V2)
- Weakness tracking + drill plans (V2)

### Family Plan — $24.99/month
- Up to 3 player profiles
- All Pro features per profile
- Shared billing

---

## Referral Program

### User Referrals
- **Referred user gets:** 14-day free Pro trial (instead of free plan)
- **3 referrals →** +2 weeks Pro free for referrer
- **10 referrals →** +2 months Pro free for referrer

### Coach Partnership Program

**Tier 1 (5+ student referrals)**
- Coach account free for 1 year
- 5% revenue share on each referred student's first year of Pro subscription
- Paid monthly via Stripe Connect

**Tier 2 (20+ student referrals)**
- Coach account free for 3 years
- 15% revenue share on each referred student's first year of Pro subscription
- Featured coach profile on Obi-Chess homepage (free advertising)
- Paid monthly via Stripe Connect

**Revenue share math (Tier 2, 20 students):**
20 × $14.99 × 12 months × 15% = ~$540/year passive income for coach

**Payout:** Stripe Connect — coaches enter bank info, paid automatically monthly

---

## Distribution Strategy
1. Hunter (son, top 3 Ohio) gets free Pro → his coach sees improvement → coach recommends to students
2. Post in Ohio chess parent Facebook groups — authentic founder story
3. Direct outreach to 5 chess coaches — offer Tier 1 partnership + their students get 30-day free trial
4. Content: founder story angle ("built this for my 12-year-old")

---

## Tech Stack
- Next.js 14 (App Router) + TypeScript
- Supabase (auth + database) — personal account
- Stripe (payments) + Stripe Connect (coach payouts)
- OpenAI GPT-4o (move explanations + chat)
- ElevenLabs (TTS coach voice)
- Stockfish.js (WebAssembly, runs in browser)
- chess.js + react-chessboard (board UI)
- Vercel (hosting)

## Credentials
- GitHub: https://github.com/ruizhi1201/obichess
- Vercel Project ID: prj_stID7IVZ97EB7s9bosEBq6zasuOa
- Domain: obichess.com
- Supabase URL: https://srisjrcrhwsauchtgpqk.supabase.co
- Stripe: existing account (new product)

---

## Database Schema (current)
- profiles — user accounts
- games — saved PGN games + analysis
- coach_transcripts — uploaded lesson notes

## Database Schema (to add for billing/referrals)
- subscriptions — plan, stripe_customer_id, stripe_subscription_id
- referrals — referrer_id, referred_id, status, reward_issued
- coach_partnerships — tier, referral_count, revenue_share_pct, free_until, stripe_connect_id
- coach_payouts — coach_id, amount, period, status

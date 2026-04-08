import { NextRequest, NextResponse } from 'next/server';
import { openai, COACH_SYSTEM_PROMPT } from '@/lib/openai';
import { getModelConfig } from '@/lib/ai-models';

interface MoveSnapshot {
  moveNumber: number;
  color: 'w' | 'b';
  san: string;
  classification: string;
  bestMoveSan?: string;
  winPercentBefore?: number;
  winPercentAfter?: number;
  evalBefore?: number;
  evalAfter?: number;
}

interface SkillStepInfo {
  step: number;
  label: string;
  uscfEquivalent?: number;
}

// Returns depth/style guidance string based on skill step
function buildSkillContext(skillStep: SkillStepInfo | null): string {
  if (!skillStep) return '';
  const { step, label, uscfEquivalent } = skillStep;
  const rating = uscfEquivalent ? ` (~${uscfEquivalent} USCF)` : '';

  if (step === 1) {
    // Beginner (<500)
    return `SKILL LEVEL: Beginner (${label}${rating}). Keep language very simple and encouraging. Avoid chess jargon — explain all concepts in plain terms. Focus on ONE most impactful lesson only. Celebrate good moves warmly to build confidence.`;
  }
  if (step === 2) {
    // Intermediate (500–1399)
    return `SKILL LEVEL: Intermediate (${label}${rating}). Use standard chess terminology but briefly explain tactical concepts. Reference 1–2 critical turning points. Balance specific improvement tips with encouragement.`;
  }
  if (step === 3) {
    // Advanced (1400–1799)
    return `SKILL LEVEL: Advanced (${label}${rating}). Be direct and specific. Reference pawn structures, open files, and piece coordination. Highlight tactical patterns and strategic nuances. Skip basics — this player knows the fundamentals.`;
  }
  // Competitive/Elite (1800+)
  return `SKILL LEVEL: Competitive/Elite (${label}${rating}). Be precise and concise — treat the player as a strong club player or tournament competitor. Mention specific move sequences, prophylaxis, outposts, zugzwang, imbalances, and advanced endgame technique where relevant. No hand-holding.`;
}

// Returns focus directive string based on training focus
function buildFocusContext(trainingFocus: string | null): string {
  if (!trainingFocus?.trim()) return '';
  return `TRAINING FOCUS: The player set a specific training focus: "${trainingFocus.trim()}". Prioritize insights related to this goal throughout the analysis. If the game contains examples (positive or negative) relevant to this focus, highlight them prominently. If this focus area wasn't tested in the game, note that briefly and suggest how to practice it.`;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      whiteAcc, blackAcc, whiteCounts, blackCounts,
      userColor, whiteName, blackName, totalMoves, moves,
      isFirstToday, recentAccuracies,
      trainingFocus, skillStep, subscriptionTier,
    } = body;

    const userName = userColor === 'w' ? whiteName : blackName;
    const userAcc = userColor === 'w' ? whiteAcc : blackAcc;
    const userCounts = userColor === 'w' ? whiteCounts : blackCounts;

    const allMoves: MoveSnapshot[] = moves as MoveSnapshot[] || [];

    // ─── Stockfish-based turning point detection ─────────────────────────────
    // Find moves with the LARGEST win% swing — these are the real critical moments,
    // NOT just move classifications. This ensures insights are grounded in engine data.
    // Win% is from White's perspective (0–100); we convert to user perspective.
    const movesWithEval = allMoves.filter(m => m.winPercentBefore !== undefined && m.winPercentAfter !== undefined);

    // Compute swing magnitude for each move from user's perspective
    const movesWithSwing = movesWithEval.map(m => {
      const wpBefore = userColor === 'w' ? (m.winPercentBefore ?? 50) : (100 - (m.winPercentBefore ?? 50));
      const wpAfter  = userColor === 'w' ? (m.winPercentAfter  ?? 50) : (100 - (m.winPercentAfter  ?? 50));
      const swing = wpAfter - wpBefore; // positive = user gained, negative = user lost
      return { ...m, swing, wpBefore, wpAfter };
    });

    // Top blunders/mistakes: biggest DROPS in user win% (regardless of move num, skip first 5 moves)
    const isAdvanced = skillStep && (skillStep as { step: number }).step >= 3;
    const userLosses = movesWithSwing
      .filter(m => m.color === userColor && m.moveNumber > 5 && m.swing < -5)
      .sort((a, b) => a.swing - b.swing) // most negative first
      .slice(0, isAdvanced ? 4 : 3);

    // Top best moments: biggest GAINS in user win% (skip first 5 moves)
    const userGains = movesWithSwing
      .filter(m => m.color === userColor && m.moveNumber > 5 && m.swing > 5)
      .sort((a, b) => b.swing - a.swing) // most positive first
      .slice(0, isAdvanced ? 3 : 2);

    // Also note opponent's biggest blunders (opportunities user could exploit)
    const oppBlunders = movesWithSwing
      .filter(m => m.color !== userColor && m.moveNumber > 5 && m.swing < -8)
      .sort((a, b) => a.swing - b.swing)
      .slice(0, 2);

    const keyMoves = [...userGains, ...userLosses, ...oppBlunders].sort((a, b) => a.moveNumber - b.moveNumber);

    const keyMovesText = keyMoves.length > 0
      ? '\nKey moments (identified by Stockfish win% changes — these are the REAL turning points):\n' +
        keyMoves.map(m => {
          const turn = `Move ${m.moveNumber}${m.color !== 'w' ? '...' : '.'}`;
          const who = m.color === userColor ? 'You' : 'Opponent';
          const wpB = m.wpBefore?.toFixed(0) ?? '?';
          const wpA = m.wpAfter?.toFixed(0) ?? '?';
          const swingStr = m.swing >= 0 ? `+${m.swing.toFixed(0)}%` : `${m.swing.toFixed(0)}%`;
          const better = m.bestMoveSan && m.bestMoveSan !== m.san ? ` (engine best: ${m.bestMoveSan})` : '';
          const label = m.swing < -15 ? '❌ blunder' : m.swing < -8 ? '⚠️ mistake' : m.swing > 15 ? '✅ excellent' : m.swing > 5 ? '👍 good' : '📉 opp blunder';
          return `- ${turn} ${m.san} [${who}, win%: ${wpB}%→${wpA}% (${swingStr})] ${label}${better}`;
        }).join('\n')
      : '\nNo major turning points detected (steady game).';

    // Build greeting/comparison context
    let sessionContext = '';
    if (isFirstToday) {
      sessionContext = `GREETING CONTEXT: This is the player's FIRST game analysis of the day. Start with a short, warm, human greeting (1 sentence max) — like a real coach seeing their student walk in. Be natural and encouraging, e.g. "Hey ${userName}, good to see you today!" or "Welcome back — let's see what you've got!" Vary the phrasing, don't be robotic.`;
    } else if (recentAccuracies && Array.isArray(recentAccuracies) && recentAccuracies.length > 0) {
      const avgRecent = recentAccuracies.reduce((a: number, b: number) => a + b, 0) / recentAccuracies.length;
      const diff = userAcc - avgRecent;
      const comparison = diff > 3
        ? `this game (${userAcc.toFixed(1)}%) is noticeably BETTER than their recent average (${avgRecent.toFixed(1)}%)`
        : diff < -3
        ? `this game (${userAcc.toFixed(1)}%) is a bit below their recent average (${avgRecent.toFixed(1)}%)`
        : `this game (${userAcc.toFixed(1)}%) is roughly on par with their recent average (${avgRecent.toFixed(1)}%)`;
      sessionContext = `CONTEXT: This is NOT the first game today. In 1 brief sentence at the very start, mention that ${comparison}. Keep it casual and conversational, like a coach glancing at a scoreboard. Don't be harsh if it's worse — stay encouraging.`;
    }

    // Build skill and focus context blocks
    const skillContext = buildSkillContext(skillStep as SkillStepInfo | null);
    const focusContext = buildFocusContext(trainingFocus as string | null);

    // Compose all context sections
    const contextSections = [sessionContext, skillContext, focusContext].filter(Boolean).join('\n\n');

    // Adjust analysis depth instructions based on skill level
    const depthInstruction = isAdvanced
      ? 'Be concise and direct — skip obvious commentary. Prioritize concrete move sequences, tactical patterns, and strategic nuances. Each section should feel like advice from a strong club player or coach.'
      : 'Keep explanations clear, simple, and accessible. Focus on the single most impactful lesson from this game. Use plain language and avoid overwhelming the player with multiple points at once.';

    const prompt = `${contextSections ? contextSections + '\n\n' : ''}Analyze this chess game for player "${userName}" playing as ${userColor === 'w' ? 'White' : 'Black'}.

⚠️ CRITICAL RULE: Base ALL insights on the Stockfish win% data below. NEVER mention early opening moves (moves 1-5) as mistakes unless they caused a win% drop >10%. Opening theory is not your concern — only reference moves where Stockfish shows a meaningful win% change.

Stockfish accuracy: ${userAcc.toFixed(1)}%
Move breakdown — Best: ${userCounts.best} | Good: ${userCounts.good} | Inaccuracy: ${userCounts.inaccuracy} | Mistake: ${userCounts.mistake} | Blunder: ${userCounts.blunder}
${keyMovesText}

${depthInstruction}

Provide a brief game analysis in exactly this format:

✅ What you did well:
[2-3 points referencing specific moves from the key moments list above where win% IMPROVED. Cite move numbers and win% changes. e.g. "Move 14 Bxg2 gained you +18% winning chances"]

📈 What to improve:
[2-3 points referencing specific moves from the key moments list where win% DROPPED. Cite move numbers and win% changes. e.g. "Move 25 Rxf3 cost you -22% — the engine preferred Qd6"]

📚 Suggested study topics:
[3-4 specific chess concepts based on the ACTUAL mistakes seen in this game${trainingFocus ? `, especially relating to: "${trainingFocus}"` : ''}]

Keep each section to 2-3 sentences. Always cite move numbers and win% when referencing key moments.`;

    const modelConfig = getModelConfig(subscriptionTier);
    const completion = await openai.chat.completions.create({
      model: modelConfig.model,
      messages: [
        { role: 'system', content: COACH_SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      max_tokens: 600,
      temperature: 0.7,
    });

    return NextResponse.json({ insights: completion.choices[0].message.content });
  } catch (error) {
    console.error('Game insights error:', error);
    return NextResponse.json({ error: 'Failed to generate insights' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { openai, COACH_SYSTEM_PROMPT } from '@/lib/openai';

interface MoveSnapshot {
  moveNumber: number;
  color: 'w' | 'b';
  san: string;
  classification: string;
  bestMoveSan?: string;
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
    const {
      whiteAcc, blackAcc, whiteCounts, blackCounts,
      userColor, whiteName, blackName, totalMoves, moves,
      isFirstToday, recentAccuracies,
      trainingFocus, skillStep,
    } = await req.json();

    const userName = userColor === 'w' ? whiteName : blackName;
    const userAcc = userColor === 'w' ? whiteAcc : blackAcc;
    const userCounts = userColor === 'w' ? whiteCounts : blackCounts;

    // Build a compact move list for key moments (inaccuracies, mistakes, blunders)
    const userMoves: MoveSnapshot[] = (moves as MoveSnapshot[] || []).filter(
      (m) => m.color === userColor && ['inaccuracy', 'mistake', 'blunder', 'best'].includes(m.classification)
    );

    // For advanced/elite players, include more detail; for beginner/intermediate, limit to top 3 mistakes
    const isAdvanced = skillStep && skillStep.step >= 3; // Advanced (1400+) or Competitive/Elite (1800+)
    const negatives = userMoves.filter(m => ['blunder', 'mistake', 'inaccuracy'].includes(m.classification));
    const filteredNegatives = isAdvanced ? negatives : negatives.slice(0, 3); // beginner/intermediate: top 3 only
    const positives = userMoves.filter(m => m.classification === 'best').slice(0, isAdvanced ? 4 : 2);
    const keyMoves = [...positives, ...filteredNegatives].sort((a, b) => a.moveNumber - b.moveNumber);

    const keyMovesText = keyMoves.length > 0
      ? '\nKey moves:\n' + keyMoves.map(m => {
          const turn = `Move ${m.moveNumber}${m.color === 'w' ? '' : '...'}`;
          const played = m.san;
          const better = m.bestMoveSan && m.bestMoveSan !== m.san ? ` (better: ${m.bestMoveSan})` : '';
          return `- ${turn} ${played} [${m.classification}]${better}`;
        }).join('\n')
      : '';

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

    const prompt = `${contextSections ? contextSections + '\n\n' : ''}Analyze this chess game performance for player "${userName}" playing as ${userColor === 'w' ? 'White' : 'Black'}:

Accuracy: ${userAcc.toFixed(1)}%
Total moves: ${totalMoves}
Best moves: ${userCounts.best}
Good moves: ${userCounts.good}
Inaccuracies: ${userCounts.inaccuracy}
Mistakes: ${userCounts.mistake}
Blunders: ${userCounts.blunder}
${keyMovesText}

${depthInstruction}

Provide a brief game analysis in exactly this format (use these exact headers, on their own lines):

✅ What you did well:
[2-3 specific positive observations. Reference specific move numbers from the key moves list to support your points, e.g. "Move 14 Bxg4 was particularly strong because..."]

📈 What to improve:
[2-3 specific areas to work on. Reference specific move numbers from the key moves list where applicable, e.g. "Move 7 d5 was an inaccuracy — consider ... instead"]

📚 Suggested study topics:
[3-4 specific chess topics to study based on the patterns seen${trainingFocus ? `, especially as they relate to the player's training focus: "${trainingFocus}"` : ''}]

Keep each section to 2-3 sentences max. Be specific and cite move numbers where possible.`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
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

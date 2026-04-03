import { NextRequest, NextResponse } from 'next/server';
import { openai, COACH_SYSTEM_PROMPT } from '@/lib/openai';

interface MoveSnapshot {
  moveNumber: number;
  color: 'w' | 'b';
  san: string;
  classification: string;
  bestMoveSan?: string;
}

export async function POST(req: NextRequest) {
  try {
    const { whiteAcc, blackAcc, whiteCounts, blackCounts, userColor, whiteName, blackName, totalMoves, moves, isFirstToday, recentAccuracies } = await req.json();

    const userName = userColor === 'w' ? whiteName : blackName;
    const userAcc = userColor === 'w' ? whiteAcc : blackAcc;
    const userCounts = userColor === 'w' ? whiteCounts : blackCounts;

    // Build a compact move list for key moments (inaccuracies, mistakes, blunders)
    const userMoves: MoveSnapshot[] = (moves as MoveSnapshot[] || []).filter(
      (m) => m.color === userColor && ['inaccuracy', 'mistake', 'blunder', 'best'].includes(m.classification)
    );

    // Pick top key moments: all blunders/mistakes + up to 3 best moves as positive examples
    const negatives = userMoves.filter(m => ['blunder', 'mistake', 'inaccuracy'].includes(m.classification));
    const positives = userMoves.filter(m => m.classification === 'best').slice(0, 3);
    const keyMoves = [...positives, ...negatives].sort((a, b) => a.moveNumber - b.moveNumber);

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

    const prompt = `${sessionContext ? sessionContext + '\n\n' : ''}Analyze this chess game performance for player "${userName}" playing as ${userColor === 'w' ? 'White' : 'Black'}:

Accuracy: ${userAcc.toFixed(1)}%
Total moves: ${totalMoves}
Best moves: ${userCounts.best}
Good moves: ${userCounts.good}
Inaccuracies: ${userCounts.inaccuracy}
Mistakes: ${userCounts.mistake}
Blunders: ${userCounts.blunder}
${keyMovesText}

Provide a brief game analysis in exactly this format (use these exact headers, on their own lines):

✅ What you did well:
[2-3 specific positive observations. Reference specific move numbers from the key moves list to support your points, e.g. "Move 14 Bxg4 was particularly strong because..."]

📈 What to improve:
[2-3 specific areas to work on. Reference specific move numbers from the key moves list where applicable, e.g. "Move 7 d5 was an inaccuracy — consider ... instead"]

📚 Suggested study topics:
[3-4 specific chess topics to study based on the patterns seen]

Keep each section to 2-3 sentences max. Be specific and cite move numbers where possible.`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: COACH_SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      max_tokens: 500,
      temperature: 0.7,
    });

    return NextResponse.json({ insights: completion.choices[0].message.content });
  } catch (error) {
    console.error('Game insights error:', error);
    return NextResponse.json({ error: 'Failed to generate insights' }, { status: 500 });
  }
}

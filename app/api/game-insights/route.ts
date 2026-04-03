import { NextRequest, NextResponse } from 'next/server';
import { openai, COACH_SYSTEM_PROMPT } from '@/lib/openai';

export async function POST(req: NextRequest) {
  try {
    const { whiteAcc, blackAcc, whiteCounts, blackCounts, userColor, whiteName, blackName, totalMoves } = await req.json();

    const userName = userColor === 'w' ? whiteName : blackName;
    const userAcc = userColor === 'w' ? whiteAcc : blackAcc;
    const userCounts = userColor === 'w' ? whiteCounts : blackCounts;

    const prompt = `Analyze this chess game performance for player "${userName}" playing as ${userColor === 'w' ? 'White' : 'Black'}:

Accuracy: ${userAcc.toFixed(1)}%
Total moves: ${totalMoves}
Best moves: ${userCounts.best}
Good moves: ${userCounts.good}
Inaccuracies: ${userCounts.inaccuracy}
Mistakes: ${userCounts.mistake}
Blunders: ${userCounts.blunder}

Provide a brief game analysis in exactly this format (use these exact headers):

✅ What you did well:
[2-3 specific positive observations based on the stats]

📈 What to improve:
[2-3 specific areas to work on based on mistakes/blunders count]

📚 Suggested study topics:
[3-4 specific chess topics to study, e.g. "Piece activity in the endgame", "Avoiding time pressure blunders"]

Keep each section to 2-3 sentences max. Be specific and actionable.`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: COACH_SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      max_tokens: 400,
      temperature: 0.7,
    });

    return NextResponse.json({ insights: completion.choices[0].message.content });
  } catch (error) {
    console.error('Game insights error:', error);
    return NextResponse.json({ error: 'Failed to generate insights' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { openai, COACH_SYSTEM_PROMPT } from '@/lib/openai';

export async function POST(req: NextRequest) {
  try {
    const { fenBefore, fenAfter, moveSan, moveUci, evalBefore, evalAfter, bestMoveSan, classification } = await req.json();

    if (!fenBefore || !moveSan) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const isBlunder = classification === 'blunder' || classification === 'mistake';
    const wasBestMove = classification === 'best';

    let prompt = `The player just played **${moveSan}**.`;

    if (evalBefore !== undefined && evalAfter !== undefined) {
      const evalBeforePawns = (evalBefore / 100).toFixed(2);
      const evalAfterPawns = (evalAfter / 100).toFixed(2);
      prompt += ` The position eval went from ${evalBefore > 0 ? '+' : ''}${evalBeforePawns} to ${evalAfter > 0 ? '+' : ''}${evalAfterPawns} (centipawn perspective: white positive).`;
    }

    if (!wasBestMove && bestMoveSan) {
      prompt += ` The engine's best move was **${bestMoveSan}**.`;
    }

    if (isBlunder) {
      prompt += ` This was classified as a ${classification}.`;
    }

    prompt += `\n\nFEN before: ${fenBefore}\nFEN after: ${fenAfter}\n\nExplain this move to a competitive youth chess player in your coaching voice. Be honest but encouraging. If it's a mistake/blunder, explain what went wrong and what they should have seen. If it's a good move, explain the idea behind it.`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: COACH_SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      max_tokens: 200,
      temperature: 0.7,
    });

    const explanation = completion.choices[0].message.content;

    return NextResponse.json({ explanation });
  } catch (error) {
    console.error('Explain API error:', error);
    return NextResponse.json({ error: 'Failed to generate explanation' }, { status: 500 });
  }
}

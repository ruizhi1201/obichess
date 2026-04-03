import { NextRequest, NextResponse } from 'next/server';
import { openai, COACH_SYSTEM_PROMPT } from '@/lib/openai';

export async function POST(req: NextRequest) {
  try {
    const {
      fenBefore,
      fenAfter,
      moveSan,
      moveUci,
      evalBefore,
      evalAfter,
      bestMoveSan,
      classification,
      userColor,
      moveColor,
      playerStep,
      playerUscfEquivalent,
      playerLabel,
      focusAreas,
    } = await req.json();

    if (!fenBefore || !moveSan) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const playerColor: 'w' | 'b' = userColor ?? 'w';
    const colorName = playerColor === 'w' ? 'White' : 'Black';
    const moverColorName = moveColor === 'b' ? 'Black' : 'White';
    const isUserMove = !moveColor || moveColor === playerColor;

    const isBlunder = classification === 'blunder' || classification === 'mistake';
    const wasBestMove = classification === 'best';

    // Eval from the user's perspective (not always white's)
    let evalContext = '';
    if (evalBefore !== undefined && evalAfter !== undefined) {
      const userEvalBefore = playerColor === 'b' ? -evalBefore : evalBefore;
      const userEvalAfter = playerColor === 'b' ? -evalAfter : evalAfter;
      const beforeStr = `${userEvalBefore >= 0 ? '+' : ''}${(userEvalBefore / 100).toFixed(2)}`;
      const afterStr = `${userEvalAfter >= 0 ? '+' : ''}${(userEvalAfter / 100).toFixed(2)}`;
      evalContext = ` The position evaluation from ${colorName}'s perspective went from ${beforeStr} to ${afterStr} (in pawns).`;
    }

    let prompt = `The player (${moverColorName}) just played **${moveSan}**.${evalContext}`;

    if (!wasBestMove && bestMoveSan) {
      prompt += ` Stockfish's best move was **${bestMoveSan}**.`;
    }

    if (isBlunder) {
      prompt += ` This was classified as a ${classification}.`;
    }

    prompt += `\n\nFEN before the move: ${fenBefore}`;
    prompt += `\nFEN after the move: ${fenAfter}`;
    prompt += `\n\nThe user you are coaching is playing as ${colorName}.`;

    if (isUserMove) {
      prompt += ` This is their move — explain what they did, whether it was good or bad, and what they should learn.`;
    } else {
      prompt += ` This is the opponent's move — explain what the opponent just did, what threat or plan it creates, and how ${colorName} should respond.`;
    }

    prompt += ` Be honest but encouraging. Keep it to 2-3 sentences. Never suggest illegal moves.`;

    if (playerStep && playerLabel && focusAreas && Array.isArray(focusAreas)) {
      const uscfStr = playerUscfEquivalent !== undefined ? ` (≈${playerUscfEquivalent} USCF)` : '';
      prompt += `\n\nPlayer skill context: The player is rated Step ${playerStep} — ${playerLabel}${uscfStr}. At this level, focus your explanation on: ${focusAreas.join(', ')}. Keep explanations targeted to the player's skill level — don't overwhelm a beginner with master-level concepts.`;
    }

    // Extra positional commentary for stronger players
    if (playerUscfEquivalent && playerUscfEquivalent >= 1500) {
      prompt += `\n\nThis player is rated ${playerUscfEquivalent} USCF — a strong club player. In addition to the move explanation, add 1-2 sentences of POSITIONAL insight: discuss pawn structure implications, piece coordination, weak squares, open files, or long-term strategic considerations that this move creates or ignores. Use proper chess terminology.`;
    }

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: COACH_SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      max_tokens: 200,
      temperature: 0.6,
    });

    const explanation = completion.choices[0].message.content;
    return NextResponse.json({ explanation });
  } catch (error) {
    console.error('Explain API error:', error);
    return NextResponse.json({ error: 'Failed to generate explanation' }, { status: 500 });
  }
}

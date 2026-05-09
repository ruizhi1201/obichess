import { NextRequest, NextResponse } from 'next/server';
import { openai, COACH_SYSTEM_PROMPT } from '@/lib/openai';
import { getModelConfig } from '@/lib/ai-models';

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
      subscriptionTier,
      materialBefore,
      materialAfter,
      capturedPiece,
      inTactic,
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

    // Material context
    if (capturedPiece) {
      const names: Record<string, string> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen' };
      const name = names[capturedPiece] || capturedPiece;
      prompt += ` ${moverColorName} captured a ${name} on this move.`;
    }
    if (materialBefore !== undefined && materialAfter !== undefined) {
      const matBefore = materialBefore;
      const matAfter = materialAfter;
      const deltaPawns = ((matAfter - matBefore) / 1).toFixed(1);
      if (Math.abs(matAfter - matBefore) > 0.5) {
        prompt += ` Material changed from ${matBefore > 0 ? '+' : ''}${matBefore.toFixed(1)} to ${matAfter > 0 ? '+' : ''}${matAfter.toFixed(1)} (${deltaPawns > '0' ? '+' : ''}${deltaPawns} pawns).`;
      }
    }

    // Tactic context — critical for accurate analysis
    if (inTactic) {
      prompt += ` ⚠️ THIS MOVE IS PART OF A TACTIC SEQUENCE: ${inTactic}. Do NOT evaluate this move in isolation — it is part of a multi-move trade. The material exchange on this move is not yet a real advantage/loss until the tactic completes. Wait until the tactic finishes before declaring who gained.`;
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

    // Extra positional commentary for Advanced (1400+) and Competitive/Elite (1800+) players
    if (playerUscfEquivalent && playerUscfEquivalent >= 1400) {
      const tier = playerUscfEquivalent >= 1800 ? 'Competitive/Elite' : 'Advanced';
      prompt += `\n\nThis player is rated ${playerUscfEquivalent} USCF (${tier}). In addition to the move explanation, add 1-2 sentences of POSITIONAL insight: discuss pawn structure implications, piece coordination, weak squares, open files, or long-term strategic considerations that this move creates or ignores. Use proper chess terminology.`;
    }

    const modelConfig = getModelConfig(subscriptionTier);
    const completion = await openai.chat.completions.create({
      model: modelConfig.model,
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

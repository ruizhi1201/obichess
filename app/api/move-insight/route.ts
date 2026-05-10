import { NextRequest, NextResponse } from 'next/server';
import { openai, COACH_SYSTEM_PROMPT } from '@/lib/openai';
import { getModelConfig } from '@/lib/ai-models';

// Fetch multi-PV from Lichess Cloud Eval
async function getLichessMultiPv(fen: string, multiPv: number = 3) {
  try {
    const url = `https://lichess.org/api/cloud-eval?fen=${encodeURIComponent(fen)}&multiPv=${multiPv}`;
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.pvs || [];
  } catch {
    return null;
  }
}

function cpToWinPercent(cp: number): number {
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
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
      moveIndex,
      firstFiveMoves, // {san, color}[] — first 5 moves for opening analysis
      playerStep,
      playerLabel,
      playerUscfEquivalent,
      focusAreas,
      subscriptionTier,
    } = body;

    if (!fenBefore || !moveSan) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const playerColor: 'w' | 'b' = userColor ?? 'w';
    const colorName = playerColor === 'w' ? 'White' : 'Black';
    const moverColorName = moveColor === 'b' ? 'Black' : 'White';

    // ── Win odds change ──
    let winOddsChange = '0.0%';
    if (evalBefore !== undefined && evalAfter !== undefined) {
      const wpBefore = cpToWinPercent(playerColor === 'b' ? -evalBefore : evalBefore);
      const wpAfter = cpToWinPercent(playerColor === 'b' ? -evalAfter : evalAfter);
      const change = wpAfter - wpBefore;
      winOddsChange = `${change >= 0 ? '+' : ''}${change.toFixed(1)}%`;
    }

    // ── Multi-PV alternatives from Lichess ──
    let alternatives: { san: string; winOdds: number; delta: string }[] = [];
    try {
      const pvs = await getLichessMultiPv(fenBefore, 3);
      if (pvs && pvs.length > 0) {
        const baseCp = pvs[0].cp ?? 0;
        alternatives = pvs.map((pv: { cp?: number; moves?: string }) => {
          const cp = pv.cp ?? 0;
          const moveStr = (pv.moves || '').split(' ')[0] || '';
          if (!moveStr) return null;
          const wp = cpToWinPercent(cp);
          const baseWp = cpToWinPercent(baseCp);
          const delta = wp - baseWp;
          return {
            san: moveStr,
            winOdds: Math.round(wp * 10) / 10,
            delta: delta > 0 ? `+${delta.toFixed(1)}%` : `${delta.toFixed(1)}%`,
          };
        }).filter(Boolean) as { san: string; winOdds: number; delta: string }[];
      }
    } catch {
      // Lichess unavailable — fall back to just bestMove
    }

    // If Lichess didn't give us alternatives, use bestMove as single alt
    if (alternatives.length === 0 && bestMoveSan && bestMoveSan !== moveSan) {
      alternatives = [{ san: bestMoveSan, winOdds: 0, delta: 'best' }];
    }

    // ── Build AI prompt ──
    let evalStr = '';
    if (evalBefore !== undefined && evalAfter !== undefined) {
      const userBefore = playerColor === 'b' ? -evalBefore : evalBefore;
      const userAfter = playerColor === 'b' ? -evalAfter : evalAfter;
      evalStr = `Eval changed from ${(userBefore / 100).toFixed(2)} to ${(userAfter / 100).toFixed(2)} (${winOddsChange} win odds). `;
    }

    let prompt = `Move ${(moveIndex ?? 0) + 1}: ${moverColorName} played **${moveSan}**.${evalStr ? ' ' + evalStr : ''}`;

    if (classification && ['blunder', 'mistake', 'inaccuracy'].includes(classification)) {
      prompt += ` Classified as: ${classification}.`;
      if (bestMoveSan) prompt += ` Better was ${bestMoveSan}.`;
    }

    // Opening analysis for first 5 moves
    const isEarlyGame = moveIndex !== undefined && moveIndex < 5;
    if (isEarlyGame && firstFiveMoves && firstFiveMoves.length > 0) {
      const movesSoFar = firstFiveMoves.map((m: { san: string }) => m.san).join(' ');
      prompt += `\n\nOPENING CONTEXT — This is move ${moveIndex + 1} out of ${firstFiveMoves.length} opening moves. The game started: ${movesSoFar}. Identify the most likely opening name (e.g. "King's Indian Attack", "Sicilian Dragon", "Queen's Gambit Declined"). Then list the 3 most popular/common continuations from THIS position, each as a short sequence of moves (2-4 moves each). IMPORTANT: your response MUST include exactly these lines:\nOPENING: <opening name>\n- <continuation 1>\n- <continuation 2>\n- <continuation 3>`;
    }

    prompt += `\n\nProvide a 1-3 sentence insight. If this is a quiet stable position, just note that briefly (e.g. "Solid development, position is balanced."). Don't try to find drama where there isn't any.`;

    if (playerLabel) {
      prompt += ` Target for ${playerLabel} level.`;
      if (playerUscfEquivalent && playerUscfEquivalent >= 1400) {
        prompt += ` Use proper chess terminology.`;
      }
    }

    const modelConfig = getModelConfig(subscriptionTier);
    const completion = await openai.chat.completions.create({
      model: modelConfig.model,
      messages: [
        { role: 'system', content: COACH_SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      max_tokens: 350,
      temperature: 0.6,
    });

    const response = completion.choices[0].message.content || '';

    // Parse opening info
    let openingName: string | undefined;
    let openingContinuations: string[] | undefined;
    if (isEarlyGame) {
      const openingMatch = response.match(/OPENING:\s*(.+)/i);
      if (openingMatch) {
        openingName = openingMatch[1].trim();
        const contMatches = response.matchAll(/^[-•]\s+(.+)$/gm);
        openingContinuations = [];
        for (const m of contMatches) {
          openingContinuations.push(m[1].trim());
        }
        if (openingContinuations.length === 0) openingContinuations = undefined;
      }
    }

    // Clean explanation (remove OPENING section and continuations)
    let explanation = response
      .replace(/OPENING:[\s\S]*?(?=\n\n|$)/i, '')
      .trim();
    if (!explanation || explanation.length < 5) {
      explanation = 'Position is stable.';
    }

    return NextResponse.json({
      explanation,
      winOddsChange,
      alternatives,
      opening: openingName
        ? { name: openingName, continuations: openingContinuations }
        : undefined,
    });
  } catch (error) {
    console.error('Move insight error:', error);
    return NextResponse.json({ error: 'Failed to generate insight' }, { status: 500 });
  }
}

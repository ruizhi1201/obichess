import { NextRequest, NextResponse } from 'next/server';
import { Chess } from 'chess.js';
import { openai, COACH_SYSTEM_PROMPT } from '@/lib/openai';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

// Extract a potential SAN chess move from a natural language message
// Matches: Rg8, Nf3, e4, Bxc6+, O-O, O-O-O, dxe5=Q etc.
function extractMoveFromMessage(message: string): string | null {
  const sanPattern = /\b([KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?[+#]?|O-O(?:-O)?)\b/g;
  const matches = message.match(sanPattern);
  return matches ? matches[0] : null;
}

async function getLichessEval(fen: string): Promise<{
  eval: number;
  bestMove: string;
  mate: number | null;
} | null> {
  try {
    const encodedFen = encodeURIComponent(fen);
    const url = `https://lichess.org/api/cloud-eval?fen=${encodedFen}&multiPv=1`;
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      next: { revalidate: 3600 },
    });
    if (response.ok) {
      const data = await response.json();
      const pv = data.pvs?.[0];
      if (pv) {
        return {
          eval: pv.cp ?? (pv.mate != null ? (pv.mate > 0 ? 30000 - pv.mate : -30000 - Math.abs(pv.mate)) : 0),
          bestMove: pv.moves?.split(' ')[0] || '',
          mate: pv.mate ?? null,
        };
      }
    }
  } catch {}
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const { message, fen, history, userColor, playerStep, playerUscfEquivalent, playerLabel, focusAreas } = await req.json() as {
      message: string;
      fen: string;
      history: ChatMessage[];
      userColor?: 'w' | 'b';
      playerStep?: number;
      playerUscfEquivalent?: number;
      playerLabel?: string;
      focusAreas?: string[];
    };

    if (!message || !fen) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const colorName = userColor === 'b' ? 'Black' : 'White';
    const isWhatIfQuestion = /what if|if i (play|played|move|moved|tried?)|should i play|can i play/i.test(message);

    let engineContext = '';

    if (isWhatIfQuestion) {
      // Try to extract a move and validate it with chess.js
      const moveSan = extractMoveFromMessage(message);
      if (moveSan) {
        try {
          const chess = new Chess(fen);
          const moveResult = chess.move(moveSan);

          if (moveResult) {
            // Move is legal — get engine eval on resulting position
            const resultingFen = chess.fen();
            const evalResult = await getLichessEval(resultingFen);

            if (evalResult) {
              const evalPawns = (evalResult.eval / 100).toFixed(2);
              const evalForPlayer = userColor === 'b' ? -evalResult.eval : evalResult.eval;
              const playerEval = (evalForPlayer / 100).toFixed(2);
              engineContext = `

[ENGINE DATA for "${moveSan}"]
- LEGAL move in this position: YES
- Position eval after ${moveSan}: ${evalResult.eval > 0 ? '+' : ''}${evalPawns} (white's perspective)
- From ${colorName}'s perspective: ${evalForPlayer >= 0 ? '+' : ''}${playerEval} pawns${evalForPlayer > 0 ? ' (you are better)' : evalForPlayer < -50 ? ' (opponent is better)' : ' (roughly equal)'}
- Stockfish best opponent response after ${moveSan}: ${evalResult.bestMove || 'unknown'}
${evalResult.mate ? `- WARNING: This leads to forced mate in ${Math.abs(evalResult.mate)} for ${evalResult.mate > 0 ? 'White' : 'Black'}` : ''}
Base your entire response on this engine data.`;
            } else {
              // Legal move but Lichess cache miss — use chess principles only
              engineContext = `

[ENGINE DATA for "${moveSan}"]
- LEGAL move in this position: YES
- Engine eval not in Lichess cache — analyze based on chess principles (piece activity, king safety, pawn structure).`;
            }
          } else {
            // chess.js rejected the move — it's illegal
            engineContext = `

[ENGINE DATA for "${moveSan}"]
- ILLEGAL move: "${moveSan}" cannot be played in this position.
- You MUST tell the user this move is not legal here. Do not suggest it or analyze it as if it were playable.`;
          }
        } catch {
          engineContext = `

[ENGINE DATA for "${moveSan}"]
- ILLEGAL move: "${moveSan}" cannot be played in this position (chess.js error).
- You MUST tell the user this move is not legal here.`;
        }
      } else {
        // "What if" question but no move detected — get current position eval to help answer
        const evalResult = await getLichessEval(fen);
        if (evalResult) {
          const evalForPlayer = userColor === 'b' ? -evalResult.eval : evalResult.eval;
          engineContext = `

[CURRENT POSITION ENGINE DATA]
- Stockfish best move right now: ${evalResult.bestMove || 'unknown'}
- Eval from ${colorName}'s perspective: ${evalForPlayer >= 0 ? '+' : ''}${(evalForPlayer / 100).toFixed(2)} pawns`;
        }
      }
    } else {
      // Non-"what if" question — provide current position eval as grounding
      const evalResult = await getLichessEval(fen);
      if (evalResult) {
        const evalForPlayer = userColor === 'b' ? -evalResult.eval : evalResult.eval;
        engineContext = `

[CURRENT POSITION ENGINE DATA]
- Stockfish best move: ${evalResult.bestMove || 'unknown'}
- Eval from ${colorName}'s perspective: ${evalForPlayer >= 0 ? '+' : ''}${(evalForPlayer / 100).toFixed(2)} pawns`;
      }
    }

    let playerSkillContext = '';
    if (playerStep && playerLabel && focusAreas && Array.isArray(focusAreas)) {
      const uscfStr = playerUscfEquivalent !== undefined ? ` (≈${playerUscfEquivalent} USCF)` : '';
      playerSkillContext = `\n\n=== PLAYER SKILL LEVEL ===\nThe player is rated Step ${playerStep} — ${playerLabel}${uscfStr}. Focus your explanations on: ${focusAreas.join(', ')}. Keep coaching targeted to this skill level — don't overwhelm a beginner with master-level concepts.`;
    }

    const systemWithContext = `${COACH_SYSTEM_PROMPT}${playerSkillContext}

=== CRITICAL RULES — NEVER BREAK THESE ===
1. The user is playing as ${colorName}. Always analyze from their perspective.
2. NEVER suggest a move unless the engine data above confirms it is LEGAL.
3. If engine data says a move is ILLEGAL, clearly tell the user it cannot be played and ask them to clarify.
4. NEVER invent move evaluations. Only use evaluations from the engine data provided.
5. NEVER suggest capturing your own pieces or any move that violates chess rules.
6. If you are uncertain whether a move is legal, say so — do not guess.

=== COACHING RULES FOR YOUNG PLAYERS ===
7. ONLY discuss chess topics. If the user asks about anything unrelated to chess, politely redirect: "I'm your chess coach — let's focus on the game! What chess move or idea would you like to explore?"
8. If the user mentions a move or idea but it's unclear WHICH specific move or square they mean, ask a clarifying question: "That sounds interesting! Which piece are you thinking of moving, and where?"
9. It is perfectly fine if the user is discussing overall strategy, game plans, or general observations — you don't need to ask about a specific move in those cases.
10. Use simple, encouraging language suitable for young players (ages 8-15). Avoid jargon unless you explain it.

The current board position (FEN): ${fen}${engineContext}`;

    const messages = [
      { role: 'system' as const, content: systemWithContext },
      ...history.map((h) => ({ role: h.role, content: h.content })),
      { role: 'user' as const, content: message },
    ];

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages,
      max_tokens: 300,
      temperature: 0.5,
    });

    const reply = completion.choices[0].message.content;
    return NextResponse.json({ reply });
  } catch (error) {
    console.error('Chat API error:', error);
    return NextResponse.json({ error: 'Failed to generate response' }, { status: 500 });
  }
}

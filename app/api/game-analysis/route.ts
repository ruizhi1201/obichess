import { NextRequest, NextResponse } from 'next/server';
import { openai, COACH_SYSTEM_PROMPT } from '@/lib/openai';
import { getModelConfig } from '@/lib/ai-models';

interface MoveData {
  moveIndex: number;
  moveNumber: number;
  color: 'w' | 'b';
  san: string;
  uci: string;
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

function buildSkillContext(skillStep: SkillStepInfo | null): string {
  if (!skillStep) return '';
  const { step, label, uscfEquivalent } = skillStep;
  const rating = uscfEquivalent ? ` (~${uscfEquivalent} USCF)` : '';
  if (step === 1) return `SKILL: Beginner (${label}${rating}). Simple language, one key lesson. Encourage warmly.`;
  if (step === 2) return `SKILL: Intermediate (${label}${rating}). Standard terminology, 1-2 critical points.`;
  if (step === 3) return `SKILL: Advanced (${label}${rating}). Direct, specific. Pawn structures, piece coordination. Skip basics.`;
  return `SKILL: Competitive (${label}${rating}). Precise, concise. Prophylaxis, imbalances, advanced technique.`;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      moves, // MoveData[]
      userColor, whiteName, blackName,
      skillStep, trainingFocus, subscriptionTier,
    } = body;

    if (!moves || !Array.isArray(moves) || moves.length === 0) {
      return NextResponse.json({ error: 'Missing moves data' }, { status: 400 });
    }

    const allMoves: MoveData[] = moves;
    const userName = userColor === 'w' ? (whiteName || 'White') : (blackName || 'Black');
    const colorName = userColor === 'w' ? 'White' : 'Black';

    // ── Identify key moments (biggest eval swings) ──
    const movesWithSwing = allMoves
      .filter(m => m.winPercentBefore !== undefined && m.winPercentAfter !== undefined)
      .map(m => {
        const wpBefore = userColor === 'w' ? (m.winPercentBefore ?? 50) : (100 - (m.winPercentBefore ?? 50));
        const wpAfter  = userColor === 'w' ? (m.winPercentAfter  ?? 50) : (100 - (m.winPercentAfter  ?? 50));
        return { ...m, swing: wpAfter - wpBefore, wpBefore, wpAfter };
      });

    // Build compact summary for AI: only include significant moves (swing > 3% OR blunder/mistake)
    const significantMoves = movesWithSwing
      .filter(m => Math.abs(m.swing) > 3 || ['blunder', 'mistake', 'inaccuracy'].includes(m.classification))
      .slice(0, 12); // cap at 12 to keep prompt reasonable

    const sigText = significantMoves.length > 0
      ? 'Significant moves (win% change >3% or classified blunder/mistake/inaccuracy):\n' +
        significantMoves.map(m => {
          const who = m.color === userColor ? 'You' : 'Opponent';
          const wpB = m.wpBefore?.toFixed(0) ?? '?';
          const wpA = m.wpAfter?.toFixed(0) ?? '?';
          const swingStr = `${m.swing >= 0 ? '+' : ''}${m.swing.toFixed(0)}%`;
          const better = m.bestMoveSan && m.bestMoveSan !== m.san ? ` (better: ${m.bestMoveSan})` : '';
          return `Move ${m.moveNumber}${m.color !== 'w' ? '...' : '.'} ${m.san} [${who}, ${wpB}%→${wpA}% ${swingStr}, ${m.classification}]${better}`;
        }).join('\n')
      : 'No major turning points — steady game.';

    // ── Opening moves (first 5) ──
    const firstFive = allMoves.slice(0, 5);
    const openingText = firstFive.length > 0
      ? `Opening moves: ${firstFive.map(m => m.san).join(' ')}`
      : '';

    // ── Skill context ──
    const skillCtx = buildSkillContext(skillStep as SkillStepInfo | null);
    const focusCtx = trainingFocus ? `Training focus: ${trainingFocus}. Prioritize insights related to this.` : '';

    // ── Build prompt ──
    const prompt = `Analyze this chess game for "${userName}" playing ${colorName}.

${openingText}

${sigText}

${[skillCtx, focusCtx].filter(Boolean).join('\n')}

Return a JSON object with exactly this structure (no markdown, no extra text):
{
  "gameSummary": {
    "greeting": "1-sentence warm greeting to the player",
    "wellDone": "2-3 things the player did well, citing specific move numbers and win% changes",
    "improve": "2-3 things to improve, citing specific moves and what the engine preferred",
    "topics": "3-4 specific chess concepts to study based on this game"
  },
  "moveNotes": {
    "MOVE_INDEX": { "explanation": "1-2 sentence coaching insight", "opening": {"name": "Opening Name", "continuations": ["1. e4 e5 2. Nf3", "..."]} },
    ...
  }
}

RULES:
- MOVE_INDEX is the 0-based index of the move (first move = 0, second = 1, etc.)
- Only include moveNotes for moves with classification "blunder", "mistake", or "inaccuracy", OR moves where win% swing > 5%
- For moves 0-4 (first 5 moves), ALWAYS include opening analysis with the "opening" field
- For opening moves, identify the most likely opening name and list 3 most popular continuations
- If the opening is not obvious from early moves, use "Unusual Opening" as the name
- Keep explanations brief (1-3 sentences max)
- For quiet/stable moves not in moveNotes, the frontend will auto-generate a note
- Return ONLY valid JSON, no markdown fences or extra text`;

    const modelConfig = getModelConfig(subscriptionTier);
    const completion = await openai.chat.completions.create({
      model: modelConfig.model,
      messages: [
        { role: 'system', content: COACH_SYSTEM_PROMPT + '\n\nYou are a chess analysis engine. Always respond with valid JSON only, no markdown or extra text.' },
        { role: 'user', content: prompt },
      ],
      max_tokens: 2000,
      temperature: 0.5,
      response_format: { type: 'json_object' },
    });

    const raw = completion.choices[0].message.content || '{}';

    // Parse JSON, stripping any markdown fences if present
    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // Try stripping markdown fences
      const cleaned = raw.replace(/```(?:json)?\s*/g, '').replace(/```\s*$/g, '').trim();
      try {
        parsed = JSON.parse(cleaned);
      } catch {
        console.error('Failed to parse AI response as JSON:', raw.substring(0, 200));
        return NextResponse.json({ error: 'Invalid AI response format' }, { status: 500 });
      }
    }

    return NextResponse.json({
      gameSummary: parsed.gameSummary || null,
      moveNotes: parsed.moveNotes || {},
    });
  } catch (error) {
    console.error('Game analysis error:', error);
    return NextResponse.json({ error: 'Failed to generate analysis' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { openai, COACH_SYSTEM_PROMPT } from '@/lib/openai';

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

    // Build compact summary for AI: only include significant moves, cap at 6
    const significantMoves = movesWithSwing
      .filter(m => Math.abs(m.swing) > 3 || ['blunder', 'mistake', 'inaccuracy'].includes(m.classification))
      .slice(0, 6);

    const sigText = significantMoves.length > 0
      ? 'Key moves:\n' +
        significantMoves.map(m => {
          const who = m.color === userColor ? 'You' : 'Opponent';
          const swingStr = `${m.swing >= 0 ? '+' : ''}${m.swing.toFixed(0)}%`;
          const better = m.bestMoveSan && m.bestMoveSan !== m.san ? ` (better: ${m.bestMoveSan})` : '';
          return `M${m.moveIndex}:${m.san} [${who} ${swingStr} ${m.classification}]${better}`;
        }).join('\n')
      : 'No major turning points.';

    // ── Opening moves (first 5) ──
    const firstFive = allMoves.slice(0, 5);
    const openingText = firstFive.length > 0
      ? `Opening moves: ${firstFive.map(m => m.san).join(' ')}`
      : '';

    // ── Skill context ──
    const skillCtx = buildSkillContext(skillStep as SkillStepInfo | null);
    const focusCtx = trainingFocus ? `Training focus: ${trainingFocus}. Prioritize insights related to this.` : '';

    // ── Build prompt ──
    const prompt = `Game: "${userName}" as ${colorName}. ${openingText}

${sigText}

${[skillCtx, focusCtx].filter(Boolean).join('\n')}

Reply with ONLY a JSON object, no markdown:
{"gameSummary":{"greeting":"warm greeting","wellDone":"what they did well","improve":"what to improve","topics":"study topics"},"moveNotes":{"0":{"explanation":"note for move 0","opening":{"name":"Opening","continuations":["e4 e5","d4 d5","Nf3 Nf6"]}}}}

Rules: moveNotes keys are moveIndex (0-based). Only include blunder/mistake/inaccuracy moves OR swing>5%. First 5 moves ALWAYS include opening. Short explanations (1-2 sentences).`;

    // Use streaming to avoid Vercel hobby plan 10s timeout
    const stream = await openai.chat.completions.create({
      model: 'deepseek-v4-flash',
      messages: [
        { role: 'system', content: COACH_SYSTEM_PROMPT + '\n\nYou are a chess analysis engine. Always respond with valid JSON only, no markdown or extra text.' },
        { role: 'user', content: prompt },
      ],
      max_tokens: 2000,
      temperature: 0.5,
      stream: true,
    });

    let raw = '';
    for await (const chunk of stream) {
      raw += chunk.choices[0]?.delta?.content || '';
    }

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
        return NextResponse.json({ error: 'Invalid AI response format', rawLength: raw.length, raw: raw.substring(0, 500), rawLast50: raw.slice(-50) }, { status: 500 });
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

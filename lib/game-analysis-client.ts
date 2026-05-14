// Client-side AI analysis call — avoids Vercel serverless timeout
import { COACH_SYSTEM_PROMPT } from './coach-prompt';

const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';

interface GameAnalysisInput {
  moves: Array<{
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
    tacticalPatterns?: string[];
    isTrap?: boolean;
    trapDescription?: string;
  }>;
  userColor: 'w' | 'b';
  whiteName: string;
  blackName: string;
  skillStep?: { step: number; label: string; uscfEquivalent?: number };
  trainingFocus?: string;
}

export interface GameAnalysisResult {
  gameSummary: {
    greeting: string;
    wellDone: string;
    improve: string;
    topics: string;
  } | null;
  moveNotes: Record<string, {
    explanation: string;
    opening?: { name: string; continuations: string[] };
  }>;
}

function buildSkillContext(skillStep: GameAnalysisInput['skillStep']): string {
  if (!skillStep) return '';
  const { step, label, uscfEquivalent } = skillStep;
  const rating = uscfEquivalent ? ` (~${uscfEquivalent} USCF)` : '';
  if (step === 1) return `SKILL: Beginner (${label}${rating}). Simple language, one key lesson. Encourage warmly.`;
  if (step === 2) return `SKILL: Intermediate (${label}${rating}). Standard terminology, 1-2 critical points.`;
  if (step === 3) return `SKILL: Advanced (${label}${rating}). Direct, specific. Pawn structures, piece coordination. Skip basics.`;
  return `SKILL: Competitive (${label}${rating}). Precise, concise. Prophylaxis, imbalances, advanced technique.`;
}

export async function analyzeGame(input: GameAnalysisInput): Promise<GameAnalysisResult> {
  const { moves, userColor, whiteName, blackName, skillStep, trainingFocus } = input;
  const userName = userColor === 'w' ? (whiteName || 'White') : (blackName || 'Black');
  const colorName = userColor === 'w' ? 'White' : 'Black';

  // Identify key moments
  const movesWithSwing = moves
    .filter(m => m.winPercentBefore !== undefined && m.winPercentAfter !== undefined)
    .map(m => {
      const wpBefore = userColor === 'w' ? (m.winPercentBefore ?? 50) : (100 - (m.winPercentBefore ?? 50));
      const wpAfter = userColor === 'w' ? (m.winPercentAfter ?? 50) : (100 - (m.winPercentAfter ?? 50));
      return { ...m, swing: wpAfter - wpBefore };
    });

  const significantMoves = movesWithSwing
    .filter(m => Math.abs(m.swing) > 2 || ['blunder', 'mistake', 'inaccuracy'].includes(m.classification) || m.isTrap || (m.tacticalPatterns && m.tacticalPatterns.length > 0))
    .slice(0, 12);

  // Also include the first 8 moves for opening coverage
  const openingKeyMoves = movesWithSwing.slice(0, 8);
  const seenIndices = new Set<number>();
  const allKeyMoves: typeof movesWithSwing = [];
  for (const m of [...openingKeyMoves, ...significantMoves]) {
    if (!seenIndices.has(m.moveIndex)) {
      seenIndices.add(m.moveIndex);
      allKeyMoves.push(m);
    }
  }
  allKeyMoves.sort((a, b) => a.moveIndex - b.moveIndex);
  allKeyMoves.splice(15);

  const sigText = allKeyMoves.length > 0
    ? 'Key moves:\n' +
      allKeyMoves.map(m => {
        const who = m.color === userColor ? 'You' : 'Opponent';
        const swingStr = `${m.swing >= 0 ? '+' : ''}${m.swing.toFixed(0)}%`;
        const better = m.bestMoveSan && m.bestMoveSan !== m.san ? ` (better: ${m.bestMoveSan})` : '';
        const trapTag = m.isTrap ? ' ⚠️TRAP' : '';
        const patternTag = m.tacticalPatterns && !m.isTrap ? ` [${m.tacticalPatterns.join(',')}]` : '';
        return `M${m.moveIndex}:${m.san} [${who} ${swingStr} ${m.classification}]${better}${trapTag}${patternTag}`;
      }).join('\n')
    : 'No major turning points.';

  // Tactical moments
  const tacticalMoves = movesWithSwing
    .filter(m => m.isTrap || (m.tacticalPatterns && m.tacticalPatterns.length > 0))
    .slice(0, 4);

  const firstFive = moves.slice(0, 5);
  const openingText = firstFive.length > 0
    ? `Opening moves: ${firstFive.map(m => m.san).join(' ')}`
    : '';

  const skillCtx = buildSkillContext(skillStep);
  const focusCtx = trainingFocus ? `Training focus: ${trainingFocus}.` : '';

  const tacticalText = tacticalMoves.length > 0
    ? 'Tactical moments:\n' +
      tacticalMoves.map(m => {
        const who = m.color === userColor ? 'You' : 'Opponent';
        const patterns = m.tacticalPatterns?.join(', ') || '';
        const trapNote = m.isTrap && m.trapDescription ? ` ⚠️ ${m.trapDescription}` : '';
        return `M${m.moveIndex}:${m.san} [${who}] ${patterns}${trapNote}`;
      }).join('\n')
    : '';

  const prompt = `Game: "${userName}" as ${colorName}. ${openingText}\n\n${sigText}\n\n${tacticalText ? tacticalText + '\n\n' : ''}${[skillCtx, focusCtx].filter(Boolean).join('\n')}\n\nReply with ONLY a JSON object, no markdown:\n{"gameSummary":{"greeting":"warm greeting","wellDone":"what they did well","improve":"what to improve","topics":"study topics"},"moveNotes":{"0":{"explanation":"note for move 0","opening":{"name":"Opening","continuations":["e4 e5","d4 d5","Nf3 Nf6"]}}}}\n\nRULES:\n- moveNotes keys are moveIndex (0-based).\n- Include ALL moves listed in Key moves above, plus any trap moves.\n- First 8 moves ALWAYS include opening context.\n- For tactical moments (fork/pin/discovered/skewer/hanging), explain the tactic.\n- For trap moves, explain WHY the move seemed quiet but created hidden threats.\n- For best/good moves, note the plan (development, space, control).\n- Short explanations (1-3 sentences each).\n- If you don't have insight for a move, still include it with a brief note.`;

  const apiKey = process.env.NEXT_PUBLIC_DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error('DeepSeek API key not configured');
  }

  const response = await fetch(DEEPSEEK_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'deepseek-v4-flash',
      messages: [
        { role: 'system', content: COACH_SYSTEM_PROMPT + '\n\nYou are a chess analysis engine. Always respond with valid JSON only, no markdown or extra text.' },
        { role: 'user', content: prompt },
      ],
      max_tokens: 12000,
      temperature: 0.5,
    }),
  });

  console.log('[AI] Fetch status:', response.status, 'ok:', response.ok);

  if (!response.ok) {
    const errText = await response.text();
    console.error('[AI] API error body:', errText.substring(0, 200));
    throw new Error(`DeepSeek API error: ${response.status}`);
  }

  const data = await response.json();
  const raw = data.choices?.[0]?.message?.content || '{}';
  console.log('[AI] Raw response length:', raw.length, 'First 100:', raw.substring(0, 100));
  console.log('[AI] Raw last 50:', raw.slice(-50));
  if (!data.choices?.[0]?.message?.content) {
    console.log('[AI] Content field missing. Available fields:', JSON.stringify(Object.keys(data.choices?.[0]?.message || {})), 'Raw data sample:', JSON.stringify(data).substring(0, 200));
  }

  // Parse JSON, stripping markdown fences
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const cleaned = raw.replace(/```(?:json)?\s*/g, '').replace(/```\s*$/g, '').trim();
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      const lastComma = cleaned.lastIndexOf(',"');
      if (lastComma > 10) {
        try {
          parsed = JSON.parse(cleaned.substring(0, lastComma) + '}}');
        } catch {
          parsed = { gameSummary: null, moveNotes: {} };
        }
      } else {
        parsed = { gameSummary: null, moveNotes: {} };
      }
    }
  }

  console.log('[AI] Parsed gameSummary:', !!parsed.gameSummary, 'moveNotes keys:', Object.keys(parsed.moveNotes||{}).length);
  return {
    gameSummary: parsed.gameSummary || null,
    moveNotes: parsed.moveNotes || {},
  };
}

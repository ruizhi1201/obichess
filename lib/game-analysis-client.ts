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

  const firstFive = moves.slice(0, 5);
  const openingText = firstFive.length > 0
    ? `Opening moves: ${firstFive.map(m => m.san).join(' ')}`
    : '';

  const skillCtx = buildSkillContext(skillStep);
  const focusCtx = trainingFocus ? `Training focus: ${trainingFocus}.` : '';

  const prompt = `Game: "${userName}" as ${colorName}. ${openingText}\n\n${sigText}\n\n${[skillCtx, focusCtx].filter(Boolean).join('\n')}\n\nReply with ONLY a JSON object, no markdown:\n{"gameSummary":{"greeting":"warm greeting","wellDone":"what they did well","improve":"what to improve","topics":"study topics"},"moveNotes":{"0":{"explanation":"note for move 0","opening":{"name":"Opening","continuations":["e4 e5","d4 d5","Nf3 Nf6"]}}}}\n\nRules: moveNotes keys are moveIndex (0-based). Only include blunder/mistake/inaccuracy moves OR swing>5%. First 5 moves ALWAYS include opening. Short explanations (1-2 sentences).`;

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
      max_tokens: 8000,
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
  // Also log if content field is missing
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
      // Try to salvage truncated JSON by finding the last valid key
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

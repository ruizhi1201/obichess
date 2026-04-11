import { NextRequest, NextResponse } from 'next/server';
import { Chess } from 'chess.js';

interface MoveEntry {
  number: number;
  white: string;
  black: string;
  whiteConfidence: 'high' | 'medium' | 'low';
  blackConfidence: 'high' | 'medium' | 'low';
}

interface OpenAIResponse {
  choices?: Array<{
    message: {
      content: string;
    };
  }>;
}

interface ValidatedMove {
  number: number;
  white: string | null;      // null = unreadable, needs human input
  black: string | null;      // null = unreadable, needs human input
  whiteConfidence: string;
  blackConfidence: string;
  whiteValid: boolean;
  blackValid: boolean;
  whiteNeeded: boolean;      // true = ask human for this move
  blackNeeded: boolean;      // true = ask human for this move
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const imageFile = formData.get('image') as File | null;

    if (!imageFile) {
      return NextResponse.json({ error: 'No image provided' }, { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 500 });
    }

    const arrayBuffer = await imageFile.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    const mimeType = imageFile.type || 'image/jpeg';

    const prompt = `You are a chess scoresheet reader. Carefully examine this handwritten chess scoresheet.

CRITICAL INSTRUCTIONS:
- The scoresheet has rows (move numbers) and two columns (White left, Black right)
- ALWAYS respect the physical position of each cell
- If you cannot read move 12 white (left column), output "?" for white move 12
- Then if you CAN read the right column of that same row, that is black move 12
- NEVER skip a row or shift moves — each row is exactly one move number
- Treat each cell independently based on its physical position in the grid

Return ONLY valid JSON with this exact structure (no markdown, no explanation):
{
  "moves": [
    {
      "number": 1,
      "white": "e4",
      "black": "c5",
      "whiteConfidence": "high",
      "blackConfidence": "high"
    }
  ],
  "white_player": "Player Name or empty string",
  "black_player": "Player Name or empty string"
}

Rules:
- Use standard algebraic notation (SAN): e4, Nf3, O-O, Bxc6+, etc.
- confidence: "high" (clearly legible), "medium" (somewhat unclear), "low" (hard to read)
- If a cell is unreadable or missing: use "?" — DO NOT skip the row, DO NOT shift other moves
- Include ALL moves you can see, preserving their exact row/column position
- Only return the JSON object, nothing else`;

    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${mimeType};base64,${base64}`,
                  detail: 'high',
                },
              },
            ],
          },
        ],
        temperature: 0.1,
        response_format: { type: 'json_object' },
      }),
    });

    if (!openaiRes.ok) {
      const errText = await openaiRes.text();
      console.error('OpenAI API error:', errText);
      return NextResponse.json(
        { error: `OpenAI API error: ${openaiRes.status}` },
        { status: 502 }
      );
    }

    const openaiData: OpenAIResponse = await openaiRes.json();
    const rawText = openaiData.choices?.[0]?.message?.content ?? '';

    let parsed: { moves: MoveEntry[]; white_player: string; black_player: string };
    try {
      const cleaned = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      parsed = JSON.parse(cleaned);
    } catch {
      console.error('Failed to parse OpenAI JSON:', rawText);
      return NextResponse.json(
        { error: 'Failed to parse OpenAI response', raw: rawText },
        { status: 500 }
      );
    }

    // ── RIGID GRID VALIDATION ─────────────────────────────────────────────────
    // Key principle: we maintain a SINGLE chess board state.
    // For each move number, we try white then black IN ORDER.
    // If a move is unreadable ("?" or invalid), we HOLD the board state —
    // we do NOT apply it and we mark it as needing human input.
    // We CONTINUE to the next move rather than breaking.
    // This keeps all subsequent moves in their correct positional slots.

    const chess = new Chess();
    const validatedMoves: ValidatedMove[] = [];
    const gapsNeeded: { number: number; color: 'white' | 'black' }[] = [];

    // Track whether board is "stuck" — if white move N fails,
    // black move N also cannot be applied (wrong board state)
    // We note both as needed and skip both, then try N+1 white fresh.
    // NOTE: if board gets stuck at move X, moves X+1 onward also can't
    // be validated against real board — we mark them low confidence.
    let boardStuck = false;
    let stuckAtMove = -1;

    for (const moveEntry of parsed.moves) {
      const isUnreadableWhite = !moveEntry.white || moveEntry.white === '?';
      const isUnreadableBlack = !moveEntry.black || moveEntry.black === '?';

      let whiteValid = false;
      let blackValid = false;
      let whiteNeeded = false;
      let blackNeeded = false;
      let appliedWhite: string | null = null;
      let appliedBlack: string | null = null;

      // ── White move ──────────────────────────────────────────────────────────
      if (isUnreadableWhite || boardStuck) {
        // Cannot apply — mark as needed, board stays as-is
        whiteNeeded = true;
        whiteValid = false;
        appliedWhite = null;
        if (!boardStuck) {
          boardStuck = true;
          stuckAtMove = moveEntry.number;
        }
        gapsNeeded.push({ number: moveEntry.number, color: 'white' });
      } else {
        try {
          const result = chess.move(moveEntry.white);
          if (result) {
            whiteValid = true;
            appliedWhite = moveEntry.white;
            boardStuck = false; // successfully unstuck if we had a gap
          } else {
            throw new Error('Invalid move');
          }
        } catch {
          whiteValid = false;
          whiteNeeded = true;
          boardStuck = true;
          stuckAtMove = moveEntry.number;
          gapsNeeded.push({ number: moveEntry.number, color: 'white' });
        }
      }

      // ── Black move ──────────────────────────────────────────────────────────
      // Black can only be applied if white was successfully applied
      if (!whiteValid || isUnreadableBlack || boardStuck) {
        blackNeeded = !isUnreadableBlack && !whiteValid; // only needed if it was readable but blocked
        blackValid = false;
        appliedBlack = null;
        if (!isUnreadableBlack && whiteValid === false) {
          // Black was readable but we can't apply without white
          blackNeeded = true;
          gapsNeeded.push({ number: moveEntry.number, color: 'black' });
        }
      } else {
        try {
          const result = chess.move(moveEntry.black);
          if (result) {
            blackValid = true;
            appliedBlack = moveEntry.black;
          } else {
            throw new Error('Invalid move');
          }
        } catch {
          blackValid = false;
          blackNeeded = true;
          // Undo white since black failed — board back to before white
          if (whiteValid) {
            chess.undo();
            whiteValid = false;
            whiteNeeded = true;
            boardStuck = true;
            stuckAtMove = moveEntry.number;
            // Also push white to gaps since we undid it
            if (!gapsNeeded.find(g => g.number === moveEntry.number && g.color === 'white')) {
              gapsNeeded.push({ number: moveEntry.number, color: 'white' });
            }
          }
          gapsNeeded.push({ number: moveEntry.number, color: 'black' });
        }
      }

      validatedMoves.push({
        number: moveEntry.number,
        white: appliedWhite ?? (isUnreadableWhite ? null : moveEntry.white),
        black: appliedBlack ?? (isUnreadableBlack ? null : moveEntry.black),
        whiteConfidence: moveEntry.whiteConfidence,
        blackConfidence: moveEntry.blackConfidence,
        whiteValid,
        blackValid,
        whiteNeeded,
        blackNeeded,
      });
    }

    // Build partial PGN from what was successfully validated
    const partialChess = new Chess();
    let partialPGN = '';
    for (const m of validatedMoves) {
      if (m.whiteValid && m.white) {
        try { partialChess.move(m.white); } catch { break; }
      } else {
        break;
      }
      if (m.blackValid && m.black) {
        try { partialChess.move(m.black); } catch { /* game might have ended */ }
      }
    }
    partialPGN = partialChess.pgn();

    return NextResponse.json({
      moves: validatedMoves,
      white_player: parsed.white_player || '',
      black_player: parsed.black_player || '',
      gaps: gapsNeeded,           // list of { number, color } that need human input
      partialPGN,                 // PGN of the portion we could validate
      boardStuck,
      stuckAtMove,
    });

  } catch (err) {
    console.error('Scoresheet API error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

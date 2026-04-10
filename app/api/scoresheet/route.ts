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

interface ValidatedMove extends MoveEntry {
  whiteValid: boolean;
  blackValid: boolean;
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

    // Convert file to base64
    const arrayBuffer = await imageFile.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    const mimeType = imageFile.type || 'image/jpeg';

    const prompt = `You are a chess scoresheet reader. Carefully examine this handwritten chess scoresheet and transcribe all the moves.

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
- confidence levels: "high" (clearly legible), "medium" (somewhat unclear), "low" (hard to read / guessed)
- If a move is missing or completely illegible, use "?" for that move
- Include ALL moves you can see on the scoresheet
- Only return the JSON object, nothing else`;

    // Call OpenAI API with vision
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

    // Validate moves with chess.js
    const chess = new Chess();
    const validatedMoves: ValidatedMove[] = [];

    for (const moveEntry of parsed.moves) {
      let whiteValid = false;
      let blackValid = false;

      // Try white's move
      if (moveEntry.white && moveEntry.white !== '?') {
        try {
          const result = chess.move(moveEntry.white);
          if (result) {
            whiteValid = true;
          }
        } catch {
          whiteValid = false;
        }
      }

      // Try black's move (only if white was valid and black exists)
      if (moveEntry.black && moveEntry.black !== '?') {
        if (whiteValid) {
          try {
            const result = chess.move(moveEntry.black);
            if (result) {
              blackValid = true;
            }
          } catch {
            blackValid = false;
          }
        }
      }

      if (!whiteValid) {
        // move not applied, state still ok
      } else if (whiteValid && !blackValid) {
        chess.undo();
      }

      validatedMoves.push({
        ...moveEntry,
        whiteValid,
        blackValid,
      });

      if (!whiteValid || (!blackValid && moveEntry.black && moveEntry.black !== '?')) {
        const remaining = parsed.moves.slice(validatedMoves.length);
        for (const rem of remaining) {
          validatedMoves.push({
            ...rem,
            whiteValid: false,
            blackValid: false,
          });
        }
        break;
      }
    }

    return NextResponse.json({
      moves: validatedMoves,
      white_player: parsed.white_player || '',
      black_player: parsed.black_player || '',
    });
  } catch (err) {
    console.error('Scoresheet API error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

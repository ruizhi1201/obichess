import { NextRequest, NextResponse } from 'next/server';
import { Chess } from 'chess.js';

interface MoveEntry {
  number: number;
  white: string;
  black: string;
  whiteConfidence: 'high' | 'medium' | 'low';
  blackConfidence: 'high' | 'medium' | 'low';
}

interface GeminiResponse {
  candidates?: Array<{
    content: {
      parts: Array<{ text: string }>;
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

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Gemini API key not configured' }, { status: 500 });
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

    // Call Gemini API
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro-preview-03-25:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: prompt },
                {
                  inline_data: {
                    mime_type: mimeType,
                    data: base64,
                  },
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: 'application/json',
          },
        }),
      }
    );

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error('Gemini API error:', errText);
      return NextResponse.json(
        { error: `Gemini API error: ${geminiRes.status}` },
        { status: 502 }
      );
    }

    const geminiData: GeminiResponse = await geminiRes.json();
    const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

    let parsed: { moves: MoveEntry[]; white_player: string; black_player: string };
    try {
      // Strip any markdown code fences if present
      const cleaned = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      parsed = JSON.parse(cleaned);
    } catch {
      console.error('Failed to parse Gemini JSON:', rawText);
      return NextResponse.json(
        { error: 'Failed to parse Gemini response', raw: rawText },
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
        // If white was invalid, we can't validate black in sequence
        // but we mark it as needing verification anyway
      }

      // If a move failed validation, undo back to before this move pair
      if (!whiteValid) {
        // Don't push invalid move to chess history - reset to last good state
        // We've already not moved, so chess state is still ok
      } else if (whiteValid && !blackValid) {
        // White succeeded but black failed - undo white
        chess.undo();
      }

      validatedMoves.push({
        ...moveEntry,
        whiteValid,
        blackValid,
      });

      // If a move is invalid, stop validating further (game state is unknown)
      if (!whiteValid || (!blackValid && moveEntry.black && moveEntry.black !== '?')) {
        // Mark all remaining moves as invalid since game state is unknown
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

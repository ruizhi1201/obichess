import { NextRequest, NextResponse } from 'next/server';
import { openai, COACH_SYSTEM_PROMPT } from '@/lib/openai';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export async function POST(req: NextRequest) {
  try {
    const { message, fen, history } = await req.json() as {
      message: string;
      fen: string;
      history: ChatMessage[];
    };

    if (!message || !fen) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const systemWithContext = `${COACH_SYSTEM_PROMPT}

The current board position (FEN): ${fen}

When a player asks "what if I played X?", analyze that alternative move from this position. 
Think through: what does it allow for the opponent? What plan does it create? How does it compare to the best moves?
Keep responses conversational, 2-4 sentences.`;

    const messages = [
      { role: 'system' as const, content: systemWithContext },
      ...history.map((h) => ({ role: h.role, content: h.content })),
      { role: 'user' as const, content: message },
    ];

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages,
      max_tokens: 300,
      temperature: 0.7,
    });

    const reply = completion.choices[0].message.content;

    return NextResponse.json({ reply });
  } catch (error) {
    console.error('Chat API error:', error);
    return NextResponse.json({ error: 'Failed to generate response' }, { status: 500 });
  }
}

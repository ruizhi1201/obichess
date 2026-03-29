import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { text } = await req.json();

    if (!text) {
      return NextResponse.json({ error: 'Missing text' }, { status: 400 });
    }

    const apiKey = process.env.ELEVENLABS_API_KEY;

    // If ElevenLabs key is provided (not placeholder), use the real API
    if (apiKey && apiKey !== 'placeholder') {
      const voiceId = 'pNInz6obpgDQGcFmaJgB'; // Adam voice — deep, authoritative coach voice
      
      const response = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
        {
          method: 'POST',
          headers: {
            'xi-api-key': apiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            text,
            model_id: 'eleven_monolingual_v1',
            voice_settings: {
              stability: 0.5,
              similarity_boost: 0.75,
            },
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`ElevenLabs API error: ${response.status}`);
      }

      const audioBuffer = await response.arrayBuffer();
      return new NextResponse(audioBuffer, {
        status: 200,
        headers: {
          'Content-Type': 'audio/mpeg',
          'Content-Length': audioBuffer.byteLength.toString(),
        },
      });
    }

    // Stub: return a placeholder response indicating TTS is not configured
    return NextResponse.json(
      { 
        stub: true, 
        message: 'TTS is not yet configured. Add your ElevenLabs API key to enable voice coaching.',
        text 
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('TTS API error:', error);
    return NextResponse.json({ error: 'Failed to generate speech' }, { status: 500 });
  }
}

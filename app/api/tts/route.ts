import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { text, voiceId: requestedVoiceId } = await req.json();

    if (!text) {
      return NextResponse.json({ error: 'Missing text' }, { status: 400 });
    }

    const apiKey = process.env.ELEVENLABS_API_KEY;

    // Allowlist of valid voice IDs to prevent abuse
    const VALID_VOICE_IDS = new Set([
      'Dnd9VXpAjEGXiRGBf1O6', // Parker Springfield
      'CwhRBWXzGAHq8TQ4Fs17', // Roger
      'EXAVITQu4vr4xnSDxMaL', // Sarah
      'FGY2WhTYpPnrIDTdsKH5', // Laura
      'IKne3meq5aSn9XLyUdCD', // Charlie
      'JBFqnCBsd6RMkjVDRZzb', // George
      'N2lVS1w4EtoT3dr4eOWO', // Callum
      'SAz9YHcvj6GT2YYXdXww', // River
      'SOYHLrjzK2X1ezoPC6cr', // Harry
      'TX3LPaxmHKxFdv7VOQHJ', // Liam
      'Xb7hH8MSUJpSbSDYk0k2', // Alice
      'XrExE9yKIg1WjnnlVkGX', // Matilda
      'bIHbv24MWmeRgasZH58o', // Will
      'cgSgspJ2msm6clMCkdW9', // Jessica
      'cjVigY5qzO86Huf0OWal', // Eric
      'hpp4J3VqNfWAUOO0d1Us', // Bella
      'iP95p4xoKVk53GoZ742B', // Chris
      'nPczCjzI2devNBz1zQrb', // Brian
      'onwK4e9ZLuTAKqWW03F9', // Daniel
      'pFZP5JQG7iQjIQuC4Bku', // Lily
      'pNInz6obpgDQGcFmaJgB', // Adam
      'pqHfZKP75CvOlQylNhV4', // Bill
    ]);

    // If ElevenLabs key is provided (not placeholder), use the real API
    if (apiKey && apiKey !== 'placeholder') {
      const DEFAULT_VOICE = 'Dnd9VXpAjEGXiRGBf1O6'; // Parker Springfield — TV Broadcaster
      const voiceId = (requestedVoiceId && VALID_VOICE_IDS.has(requestedVoiceId))
        ? requestedVoiceId
        : DEFAULT_VOICE;
      
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
            model_id: 'eleven_turbo_v2',
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

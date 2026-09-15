import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/server/security/rateLimit';

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';
const MAX_AUDIO_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

const ALLOWED_AUDIO_MIME_PREFIXES = [
    'audio/webm',
    'audio/mp4',
    'audio/ogg',
    'audio/wav',
    'audio/x-wav',
    'audio/x-m4a',
    'audio/m4a',
    'audio/aac',
    'audio/mpeg',
    'audio/mp3',
];

export async function POST(request: NextRequest) {
    try {
        const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown-ip';
        const rateLimitResult = await checkRateLimit(clientIp, 'transcribe');

        if (!rateLimitResult.success) {
            return NextResponse.json(
                { error: { message: 'Too many requests. Please slow down.' } },
                {
                    status: 429,
                    headers: {
                        'Retry-After': String(Math.ceil((rateLimitResult.reset - Date.now()) / 1000)),
                    },
                }
            );
        }

        const formData = await request.formData().catch(() => null);
        if (!formData) {
            return NextResponse.json(
                { error: { message: 'Invalid form data' } },
                { status: 400 }
            );
        }

        const audioFile = formData.get('audio') as Blob | File | null;
        if (!audioFile) {
            return NextResponse.json(
                { error: { message: 'Missing audio file in request' } },
                { status: 400 }
            );
        }

        if (audioFile.size > MAX_AUDIO_SIZE_BYTES) {
            return NextResponse.json(
                { error: { message: 'Audio file too large. Maximum size is 10MB.' } },
                { status: 400 }
            );
        }

        const rawMime = audioFile.type || 'audio/webm';
        const baseMime = rawMime.split(';')[0].trim().toLowerCase();

        const isAllowed = ALLOWED_AUDIO_MIME_PREFIXES.some((allowed) =>
            baseMime.startsWith(allowed)
        );

        if (!isAllowed) {
            return NextResponse.json(
                { error: { message: `Unsupported audio type: ${rawMime}` } },
                { status: 400 }
            );
        }

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            console.error('[API /api/transcribe] Missing GEMINI_API_KEY in environment');
            return NextResponse.json(
                { error: { message: 'Gemini API Key is not configured on the server.' } },
                { status: 500 }
            );
        }

        const arrayBuffer = await audioFile.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const base64Audio = buffer.toString('base64');

        const payload = {
            contents: [
                {
                    role: 'user',
                    parts: [
                        {
                            inlineData: {
                                mimeType: baseMime,
                                data: base64Audio,
                            },
                        },
                        {
                            text: 'Transcribe the spoken speech in this audio accurately. If it is in Thai, transcribe in Thai. If in English, transcribe in English. Output ONLY the transcribed text without any quotation marks, conversational comments, or explanations. If there is no speech or only silence/noise, output nothing.',
                        },
                    ],
                },
            ],
            generationConfig: {
                maxOutputTokens: 256,
                temperature: 0.1,
            },
        };

        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            }
        );

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            console.error(`[API /api/transcribe] Upstream Gemini error HTTP ${response.status}:`, data);
            return NextResponse.json(
                { error: { message: data?.error?.message || 'Transcription service error' } },
                { status: response.status }
            );
        }

        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';

        return NextResponse.json({ text });
    } catch (error: any) {
        console.error('[API /api/transcribe] Internal Error:', error);
        return NextResponse.json(
            { error: { message: error.message || 'Internal Server Error' } },
            { status: 500 }
        );
    }
}

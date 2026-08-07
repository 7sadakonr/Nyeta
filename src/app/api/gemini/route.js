import { NextResponse } from 'next/server';
import { getSystemPromptForMode, VALID_MODES } from '@/lib/server/visionPrompts';
import { checkRateLimit } from '@/lib/server/rateLimit';

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_IMAGE_BASE64_LENGTH = 5.5 * 1024 * 1024; // ~4MB raw image size

export async function POST(request) {
    try {
        const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown-ip';
        const rateLimitResult = await checkRateLimit(clientIp, 'gemini');

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

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            console.error('[API /api/gemini] Missing GEMINI_API_KEY in environment');
            return NextResponse.json(
                { error: { message: 'Gemini API Key is not configured on the server.' } },
                { status: 500 }
            );
        }

        const body = await request.json().catch(() => null);
        if (!body || typeof body !== 'object') {
            return NextResponse.json(
                { error: { message: 'Invalid JSON request body' } },
                { status: 400 }
            );
        }

        // Security check: Client MUST NOT send custom systemPrompt
        if (body.systemPrompt) {
            return NextResponse.json(
                { error: { message: 'Custom system prompts are not permitted. Use the "mode" parameter.' } },
                { status: 400 }
            );
        }

        const {
            mode = 'assistant',
            userPrompt,
            imageBase64,
            mimeType = 'image/jpeg',
            maxTokens = 800,
            temperature = 0.4,
            contents,
        } = body;

        // Validate mode
        const safeMode = VALID_MODES.includes(mode) ? mode : 'assistant';
        const systemPrompt = getSystemPromptForMode(safeMode);

        // Validate MIME type
        const safeMimeType = ALLOWED_MIME_TYPES.includes(mimeType) ? mimeType : 'image/jpeg';

        // Validate image payload size
        if (imageBase64) {
            if (typeof imageBase64 !== 'string') {
                return NextResponse.json(
                    { error: { message: 'imageBase64 must be a string' } },
                    { status: 400 }
                );
            }
            if (imageBase64.length > MAX_IMAGE_BASE64_LENGTH) {
                return NextResponse.json(
                    { error: { message: 'Image payload exceeds maximum allowed size (4MB)' } },
                    { status: 413 }
                );
            }
        }

        // Clamp numeric limits
        const safeMaxTokens = Math.min(Math.max(16, Number(maxTokens) || 800), 1500);
        const safeTemperature = Math.min(Math.max(0.0, Number(temperature) || 0.4), 1.0);

        let payloadContents = contents;
        if (!payloadContents) {
            const parts = [];
            const defaultPrompt = safeMode === 'currency' ? 'ตรวจธนบัตรหรือเหรียญในภาพนี้' :
                safeMode === 'reader' ? 'อ่านข้อความทั้งหมดในภาพนี้' :
                'ช่วยบรรยายภาพนี้ให้หน่อย';

            parts.push({ text: typeof userPrompt === 'string' && userPrompt.trim() ? userPrompt.trim() : defaultPrompt });

            if (imageBase64) {
                // Strip data url prefix if present
                const cleanBase64 = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;
                parts.push({
                    inlineData: {
                        mimeType: safeMimeType,
                        data: cleanBase64,
                    },
                });
            }

            payloadContents = [{ role: 'user', parts }];
        }

        const payload = {
            contents: payloadContents,
            generationConfig: {
                maxOutputTokens: safeMaxTokens,
                temperature: safeTemperature,
            },
            systemInstruction: {
                parts: [{ text: systemPrompt }],
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
            console.error(`[API /api/gemini] Upstream error HTTP ${response.status}:`, data);
            return NextResponse.json(data, { status: response.status });
        }

        return NextResponse.json(data, { status: 200 });
    } catch (error) {
        console.error('[API /api/gemini] Internal Error:', error);
        return NextResponse.json(
            { error: { message: error.message || 'Internal Server Error' } },
            { status: 500 }
        );
    }
}

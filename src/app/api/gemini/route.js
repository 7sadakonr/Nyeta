import { NextResponse } from 'next/server';
import { getSystemPromptForMode, VALID_MODES } from '@/lib/server/visionPrompts';
import { checkRateLimit } from '@/lib/server/rateLimit';

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';
export const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const MAX_IMAGE_BASE64_LENGTH = 5.5 * 1024 * 1024; // ~4MB raw image size

/**
 * Validate and sanitize Gemini multi-turn contents array.
 * @param {any} contents
 * @returns {{ valid: boolean, error?: string, sanitized?: Array }}
 */
export function validateAndSanitizeContents(contents) {
    if (!Array.isArray(contents)) {
        return { valid: false, error: 'contents must be an array' };
    }

    if (contents.length === 0 || contents.length > 12) {
        return { valid: false, error: 'contents array length must be between 1 and 12' };
    }

    const sanitized = [];
    let totalImageBytes = 0;

    for (let i = 0; i < contents.length; i++) {
        const item = contents[i];
        if (!item || typeof item !== 'object') {
            return { valid: false, error: `contents[${i}] must be an object` };
        }

        // Only allow 'user' and 'model' roles (strictly forbid 'system', 'developer', etc.)
        if (!['user', 'model'].includes(item.role)) {
            return { valid: false, error: `contents[${i}].role must be "user" or "model"` };
        }

        if (!Array.isArray(item.parts) || item.parts.length === 0 || item.parts.length > 3) {
            return { valid: false, error: `contents[${i}].parts must be an array with 1-3 parts` };
        }

        const sanitizedParts = [];
        for (let j = 0; j < item.parts.length; j++) {
            const part = item.parts[j];
            if (!part || typeof part !== 'object') {
                return { valid: false, error: `contents[${i}].parts[${j}] must be an object` };
            }

            // Text part
            if (part.text !== undefined) {
                if (typeof part.text !== 'string') {
                    return { valid: false, error: `contents[${i}].parts[${j}].text must be a string` };
                }
                if (part.text.length > 4000) {
                    return { valid: false, error: `contents[${i}].parts[${j}].text exceeds maximum length (4000 chars)` };
                }
                sanitizedParts.push({ text: part.text });
            }
            // Inline image data part
            else if (part.inlineData !== undefined) {
                const inline = part.inlineData;
                if (!inline || typeof inline !== 'object') {
                    return { valid: false, error: `contents[${i}].parts[${j}].inlineData must be an object` };
                }
                if (!ALLOWED_MIME_TYPES.includes(inline.mimeType)) {
                    return { valid: false, error: `contents[${i}].parts[${j}].inlineData.mimeType must be one of: ${ALLOWED_MIME_TYPES.join(', ')}` };
                }
                if (typeof inline.data !== 'string') {
                    return { valid: false, error: `contents[${i}].parts[${j}].inlineData.data must be a base64 string` };
                }
                const cleanData = inline.data.includes(',') ? inline.data.split(',')[1] : inline.data;
                totalImageBytes += cleanData.length;
                if (totalImageBytes > MAX_IMAGE_BASE64_LENGTH) {
                    return { valid: false, error: 'Total image payload in contents exceeds 4MB limit' };
                }
                sanitizedParts.push({
                    inlineData: {
                        mimeType: inline.mimeType,
                        data: cleanData,
                    },
                });
            } else {
                return { valid: false, error: `contents[${i}].parts[${j}] contains unsupported part types` };
            }
        }

        sanitized.push({
            role: item.role,
            parts: sanitizedParts,
        });
    }

    return { valid: true, sanitized };
}

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

        let payloadContents;
        if (contents) {
            const validation = validateAndSanitizeContents(contents);
            if (!validation.valid) {
                return NextResponse.json(
                    { error: { message: `Invalid contents: ${validation.error}` } },
                    { status: 400 }
                );
            }
            payloadContents = validation.sanitized;
        } else {
            const parts = [];
            const defaultPrompt = safeMode === 'currency' ? 'ตรวจธนบัตรหรือเหรียญในภาพนี้' :
                safeMode === 'reader' ? 'อ่านข้อความทั้งหมดในภาพนี้' :
                'ช่วยบรรยายภาพนี้ให้หน่อย';

            const userText = typeof userPrompt === 'string' && userPrompt.trim() ? userPrompt.trim() : defaultPrompt;
            if (userText.length > 4000) {
                return NextResponse.json(
                    { error: { message: 'userPrompt exceeds maximum length (4000 chars)' } },
                    { status: 400 }
                );
            }
            parts.push({ text: userText });

            if (imageBase64) {
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

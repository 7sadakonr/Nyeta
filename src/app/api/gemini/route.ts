import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/server/security/rateLimit';
import { validateRequestBody, validateAndSanitizeContents, ALLOWED_MIME_TYPES, MAX_IMAGE_BASE64_LENGTH } from '@/server/ai/geminiValidation';
import { callGeminiVision } from '@/server/ai/geminiClient';

// Re-export for backwards compatibility with tests and internal consumers
export { validateAndSanitizeContents, ALLOWED_MIME_TYPES, MAX_IMAGE_BASE64_LENGTH };
export type { ContentItem, ContentPart, ValidationResult } from '@/server/ai/geminiTypes';

export async function POST(request: NextRequest) {
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

        const body = await request.json().catch(() => null);
        const validation = validateRequestBody(body);

        if (!validation.valid || !validation.options) {
            return NextResponse.json(
                { error: { message: validation.error || 'Invalid request' } },
                { status: validation.status || 400 }
            );
        }

        const result = await callGeminiVision(validation.options);
        return NextResponse.json(result.data, { status: result.status });
    } catch (error: any) {
        console.error('[API /api/gemini] Internal Error:', error);
        return NextResponse.json(
            { error: { message: error.message || 'Internal Server Error' } },
            { status: 500 }
        );
    }
}

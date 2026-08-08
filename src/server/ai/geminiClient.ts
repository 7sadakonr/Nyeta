import { GeminiClientResult, GeminiGenerateOptions } from './geminiTypes';

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';

/**
 * Executes a call to the Google Gemini API with the given options.
 */
export async function callGeminiVision(options: GeminiGenerateOptions): Promise<GeminiClientResult> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error('[GeminiClient] Missing GEMINI_API_KEY in environment');
        return {
            status: 500,
            data: { error: { message: 'Gemini API Key is not configured on the server.' } },
        };
    }

    const payload = {
        contents: options.contents,
        generationConfig: {
            maxOutputTokens: options.maxOutputTokens,
            temperature: options.temperature,
        },
        systemInstruction: {
            parts: [{ text: options.systemPrompt }],
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
        console.error(`[GeminiClient] Upstream error HTTP ${response.status}:`, data);
        return {
            status: response.status,
            data,
        };
    }

    return {
        status: 200,
        data,
    };
}

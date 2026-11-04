import { GeminiClientResult, GeminiGenerateOptions } from './geminiTypes';

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';

const UPSTREAM_TIMEOUT_MS = 18000;
const RETRY_DELAYS_MS = [600, 1500];
const RETRYABLE_STATUSES = new Set([500, 502, 503, 504]);

/** The currency scanner fires automatically, so it retries once; other modes are user-initiated and retry twice. */
export function getMaxRetries(mode?: string): number {
    return mode === 'currency' ? 1 : RETRY_DELAYS_MS.length;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Executes a call to the Google Gemini API with the given options.
 * Transient upstream failures (5xx, network errors, timeouts) are retried with backoff.
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
    const body = JSON.stringify(payload);
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
    const maxRetries = getMaxRetries(options.mode);

    let lastResult: GeminiClientResult = {
        status: 502,
        data: { error: { message: 'Upstream request failed' } },
    };

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
        if (attempt > 0) {
            const base = RETRY_DELAYS_MS[Math.min(attempt - 1, RETRY_DELAYS_MS.length - 1)];
            await sleep(base + Math.floor(Math.random() * 250));
        }

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
                body,
                signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
            });

            const data = await response.json().catch(() => ({}));

            if (response.ok) {
                return { status: 200, data };
            }

            console.error(`[GeminiClient] Upstream error HTTP ${response.status} (attempt ${attempt + 1}/${maxRetries + 1}):`, data);
            lastResult = { status: response.status, data };
            if (!RETRYABLE_STATUSES.has(response.status)) return lastResult;
        } catch (error: unknown) {
            const timedOut = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
            console.error(`[GeminiClient] ${timedOut ? 'Upstream timeout' : 'Network error'} (attempt ${attempt + 1}/${maxRetries + 1}):`, error instanceof Error ? error.message : error);
            lastResult = timedOut
                ? { status: 504, data: { error: { message: 'Upstream request timed out' } } }
                : { status: 502, data: { error: { message: 'Upstream request failed' } } };
        }
    }

    return lastResult;
}

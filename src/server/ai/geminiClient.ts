import { GeminiClientResult, GeminiGenerateOptions } from './geminiTypes';

// gemini-3.1-flash-lite was returning HTTP 503 (high demand) on every attempt; gemini-3.5-flash answered reliably.
export const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash';

// Each attempt gets this long, but all attempts together must fit inside the route's maxDuration (60s).
const ATTEMPT_TIMEOUT_MS = 25000;
const TOTAL_BUDGET_MS = 54000;
const MIN_RETRY_WINDOW_MS = 4000;
const RETRY_DELAYS_MS = [600, 1500];
const RETRYABLE_STATUSES = new Set([500, 502, 503, 504]);

/** The currency scanner fires automatically, so it retries once; other modes are user-initiated and retry twice. */
export function getMaxRetries(mode?: string): number {
    return mode === 'currency' ? 1 : RETRY_DELAYS_MS.length;
}

/**
 * Gemini 3.5+ models spend the output-token budget on hidden "thinking" by default, which truncates short
 * answers (the currency scanner asks for ~400 tokens). Scene description and OCR don't need it either.
 */
export function getThinkingConfig(model: string): { thinkingLevel: 'minimal' } | undefined {
    return /^gemini-3\.[5-9]-/.test(model) ? { thinkingLevel: 'minimal' } : undefined;
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

    const model = process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
    const thinkingConfig = getThinkingConfig(model);
    const payload = {
        contents: options.contents,
        generationConfig: {
            maxOutputTokens: options.maxOutputTokens,
            temperature: options.temperature,
            ...(thinkingConfig ? { thinkingConfig } : {}),
        },
        systemInstruction: {
            parts: [{ text: options.systemPrompt }],
        },
    };
    const body = JSON.stringify(payload);
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
    const maxRetries = getMaxRetries(options.mode);

    let lastResult: GeminiClientResult = {
        status: 502,
        data: { error: { message: 'Upstream request failed' } },
    };

    const startedAt = Date.now();
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
        if (attempt > 0) {
            const base = RETRY_DELAYS_MS[Math.min(attempt - 1, RETRY_DELAYS_MS.length - 1)];
            await sleep(base + Math.floor(Math.random() * 250));
        }
        const remainingMs = TOTAL_BUDGET_MS - (Date.now() - startedAt);
        if (attempt > 0 && remainingMs < MIN_RETRY_WINDOW_MS) break;

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
                body,
                signal: AbortSignal.timeout(Math.min(ATTEMPT_TIMEOUT_MS, remainingMs)),
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

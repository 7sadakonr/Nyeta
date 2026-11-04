import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { callGeminiVision as callServerGemini, DEFAULT_GEMINI_MODEL, getMaxRetries, getThinkingConfig } from '@/server/ai/geminiClient';
import { clampGenerationConfig } from '@/server/ai/geminiValidation';
import { GeminiRequestError, describeGeminiError, callGeminiVision as callClientGemini } from '@/features/blind-assistant/client/geminiVision';

const options = (mode?: string) => ({
    contents: [{ role: 'user' as const, parts: [{ text: 'hi' }] }],
    systemPrompt: 'system',
    maxOutputTokens: 100,
    temperature: 0,
    mode,
});

const jsonResponse = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

describe('server Gemini client resilience', () => {
    const fetchMock = vi.fn();

    beforeEach(() => {
        vi.useFakeTimers();
        vi.stubEnv('GEMINI_API_KEY', 'test-key');
        vi.stubGlobal('fetch', fetchMock);
        vi.spyOn(console, 'error').mockImplementation(() => {});
        fetchMock.mockReset();
    });
    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllEnvs();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    const run = async (mode?: string) => {
        const pending = callServerGemini(options(mode));
        await vi.runAllTimersAsync();
        return pending;
    };

    it('retries a 503 and returns the successful answer', async () => {
        fetchMock
            .mockResolvedValueOnce(jsonResponse(503, { error: { status: 'UNAVAILABLE' } }))
            .mockResolvedValueOnce(jsonResponse(200, { candidates: [] }));

        const result = await run('assistant');

        expect(result.status).toBe(200);
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('gives up after two retries and returns the upstream status', async () => {
        fetchMock.mockResolvedValue(jsonResponse(503, { error: { status: 'UNAVAILABLE' } }));

        const result = await run('reader');

        expect(result.status).toBe(503);
        expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('retries the automatic currency scan only once', async () => {
        fetchMock.mockResolvedValue(jsonResponse(503, {}));

        await run('currency');

        expect(getMaxRetries('currency')).toBe(1);
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('does not retry client errors or rate limits', async () => {
        fetchMock.mockResolvedValue(jsonResponse(429, {}));
        expect((await run('assistant')).status).toBe(429);
        expect(fetchMock).toHaveBeenCalledTimes(1);

        fetchMock.mockReset();
        fetchMock.mockResolvedValue(jsonResponse(400, {}));
        expect((await run('assistant')).status).toBe(400);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('retries network errors and reports 502 when they persist', async () => {
        fetchMock.mockRejectedValue(new TypeError('fetch failed'));

        const result = await run('assistant');

        expect(result.status).toBe(502);
        expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('uses the reliable default model and turns off hidden thinking so short answers are not truncated', async () => {
        fetchMock.mockResolvedValue(jsonResponse(200, {}));

        await run('currency');

        const [url, init] = fetchMock.mock.calls[0];
        expect(DEFAULT_GEMINI_MODEL).toBe('gemini-3.5-flash');
        expect(String(url)).toContain(`/models/${DEFAULT_GEMINI_MODEL}:generateContent`);
        const sent = JSON.parse(String((init as RequestInit).body));
        expect(sent.generationConfig.thinkingConfig).toEqual({ thinkingLevel: 'minimal' });
        expect(sent.generationConfig.maxOutputTokens).toBe(100);
    });

    it('honours GEMINI_MODEL and only sends thinkingConfig to models that support it', async () => {
        vi.stubEnv('GEMINI_MODEL', 'gemini-3.1-flash-lite');
        fetchMock.mockResolvedValue(jsonResponse(200, {}));

        await run('assistant');

        const [url, init] = fetchMock.mock.calls[0];
        expect(String(url)).toContain('/models/gemini-3.1-flash-lite:generateContent');
        expect(JSON.parse(String((init as RequestInit).body)).generationConfig.thinkingConfig).toBeUndefined();
        expect(getThinkingConfig('gemini-3.5-flash')).toEqual({ thinkingLevel: 'minimal' });
        expect(getThinkingConfig('gemini-3.1-flash-lite')).toBeUndefined();
        expect(getThinkingConfig('gemini-2.5-flash')).toBeUndefined();
    });

    it('stops retrying when the total time budget would be exceeded', async () => {
        // Each attempt "takes" 30s before timing out, so the 54s budget (not the retry count) ends the loop.
        fetchMock.mockImplementation(async () => {
            vi.setSystemTime(Date.now() + 30000);
            throw Object.assign(new Error('timeout'), { name: 'TimeoutError' });
        });

        const result = await run('assistant');

        expect(result.status).toBe(504);
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('sends the API key in a header, never in the URL', async () => {
        fetchMock.mockResolvedValue(jsonResponse(200, {}));

        await run('assistant');

        const [url, init] = fetchMock.mock.calls[0];
        expect(String(url)).not.toContain('test-key');
        expect(String(url)).not.toContain('key=');
        expect((init as RequestInit).headers).toMatchObject({ 'x-goog-api-key': 'test-key' });
    });
});

describe('token ceilings', () => {
    it('lets OCR requests ask for a full page of text but keeps other modes capped', () => {
        expect(clampGenerationConfig(4096, 0, 'reader').maxOutputTokens).toBe(4096);
        expect(clampGenerationConfig(9999, 0, 'reader').maxOutputTokens).toBe(4096);
        expect(clampGenerationConfig(4096, 0, 'assistant').maxOutputTokens).toBe(1500);
        expect(clampGenerationConfig(4096, 0, 'currency').maxOutputTokens).toBe(1500);
    });
});

describe('client Gemini error classification', () => {
    const fetchMock = vi.fn();

    beforeEach(() => {
        fetchMock.mockReset();
        vi.stubGlobal('fetch', fetchMock);
    });
    afterEach(() => vi.unstubAllGlobals());

    const kindFor = async (status: number) => {
        fetchMock.mockResolvedValue(jsonResponse(status, { error: { message: 'x' } }));
        try {
            await callClientGemini({ mode: 'assistant', userPrompt: 'hi' });
        } catch (error) {
            return (error as GeminiRequestError).kind;
        }
        return null;
    };

    it('maps HTTP statuses to error kinds', async () => {
        expect(await kindFor(503)).toBe('busy');
        expect(await kindFor(429)).toBe('rate_limited');
        expect(await kindFor(504)).toBe('timeout');
        expect(await kindFor(500)).toBe('server');
        expect(await kindFor(400)).toBe('server');
    });

    it('treats a failed fetch as offline and an invalid body as a server error', async () => {
        fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
        await expect(callClientGemini({ userPrompt: 'hi' })).rejects.toMatchObject({ kind: 'offline' });

        fetchMock.mockResolvedValue(new Response('<html>gateway</html>', { status: 200 }));
        await expect(callClientGemini({ userPrompt: 'hi' })).rejects.toMatchObject({ kind: 'server' });
    });

    it('passes caller aborts through untouched', async () => {
        const abort = new DOMException('aborted', 'AbortError');
        fetchMock.mockRejectedValue(abort);
        await expect(callClientGemini({ userPrompt: 'hi' })).rejects.toBe(abort);
    });

    it('only mentions the internet when that is the cause', () => {
        expect(describeGeminiError(new GeminiRequestError('busy', 'x', 503))).not.toContain('อินเทอร์เน็ต');
        expect(describeGeminiError(new GeminiRequestError('server', 'x', 500))).not.toContain('อินเทอร์เน็ต');
        expect(describeGeminiError(new GeminiRequestError('offline', 'x'))).toContain('อินเทอร์เน็ต');
    });
});

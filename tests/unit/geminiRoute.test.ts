import { beforeEach, describe, expect, it, vi } from 'vitest';

const { checkRateLimit, callGeminiVision } = vi.hoisted(() => ({
    checkRateLimit: vi.fn(),
    callGeminiVision: vi.fn(),
}));

vi.mock('@/server/security/rateLimit', () => ({ checkRateLimit }));
vi.mock('@/server/ai/geminiClient', () => ({ callGeminiVision }));

import { POST } from '@/app/api/gemini/route';

const request = (body: unknown) => new Request('http://localhost/api/gemini', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '1.2.3.4' },
    body: JSON.stringify(body),
}) as unknown as Parameters<typeof POST>[0];

describe('POST /api/gemini rate limiting', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        checkRateLimit.mockResolvedValue({ success: true, limit: 20, remaining: 19, reset: Date.now() + 1000 });
        callGeminiVision.mockResolvedValue({ status: 200, data: { ok: true } });
    });

    it('gives the currency scanner its own quota', async () => {
        await POST(request({ mode: 'currency', userPrompt: 'x' }));
        expect(checkRateLimit).toHaveBeenCalledWith('1.2.3.4', 'gemini_currency');
    });

    it('keeps assistant and reader requests on the shared quota', async () => {
        await POST(request({ mode: 'assistant', userPrompt: 'x' }));
        await POST(request({ mode: 'reader', userPrompt: 'x' }));
        await POST(request({ userPrompt: 'x' }));
        expect(checkRateLimit.mock.calls.map((call) => call[1])).toEqual(['gemini', 'gemini', 'gemini']);
    });

    it('passes the mode to the Gemini client so it can pick a retry policy', async () => {
        await POST(request({ mode: 'currency', userPrompt: 'x' }));
        expect(callGeminiVision.mock.calls[0][0]).toMatchObject({ mode: 'currency' });
    });

    it('rejects with 429 when the quota is exhausted', async () => {
        checkRateLimit.mockResolvedValue({ success: false, limit: 20, remaining: 0, reset: Date.now() + 5000 });
        const response = await POST(request({ mode: 'currency', userPrompt: 'x' }));
        expect(response.status).toBe(429);
        expect(callGeminiVision).not.toHaveBeenCalled();
    });
});

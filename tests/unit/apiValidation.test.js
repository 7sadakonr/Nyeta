import { describe, it, expect } from 'vitest';
import { getSystemPromptForMode, ASSISTANT_PROMPT, CURRENCY_PROMPT, OCR_PROMPT } from '@/lib/server/visionPrompts';
import { checkRateLimit } from '@/lib/server/rateLimit';

describe('Server Vision Prompts Mapping', () => {
    it('should return appropriate prompt for each supported mode', () => {
        expect(getSystemPromptForMode('assistant')).toBe(ASSISTANT_PROMPT);
        expect(getSystemPromptForMode('currency')).toBe(CURRENCY_PROMPT);
        expect(getSystemPromptForMode('reader')).toBe(OCR_PROMPT);
    });

    it('should fallback to ASSISTANT_PROMPT for unknown modes', () => {
        expect(getSystemPromptForMode('unknown_mode')).toBe(ASSISTANT_PROMPT);
    });
});

describe('Rate Limiter Utility', () => {
    it('should allow requests within limit and reject when exceeded', async () => {
        const testId = `test_user_${Date.now()}`;

        // Gemini limit is 20 in memory
        for (let i = 0; i < 20; i++) {
            const res = await checkRateLimit(testId, 'gemini');
            expect(res.success).toBe(true);
        }

        // 21st request must fail
        const blocked = await checkRateLimit(testId, 'gemini');
        expect(blocked.success).toBe(false);
        expect(blocked.remaining).toBe(0);
    });
});

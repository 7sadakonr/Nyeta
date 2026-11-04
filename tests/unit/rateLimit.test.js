import { describe, it, expect, beforeEach } from 'vitest';
import { checkRateLimit, VALID_LIMITER_TYPES, _resetMemoryRateLimitForTesting } from '@/server/security/rateLimit';

describe('Rate Limiter Policies & Enforcement', () => {
    beforeEach(() => {
        _resetMemoryRateLimitForTesting();
    });

    it('should include all required rate limiter types', () => {
        expect(VALID_LIMITER_TYPES).toContain('gemini');
        expect(VALID_LIMITER_TYPES).toContain('gemini_currency');
        expect(VALID_LIMITER_TYPES).toContain('pusher_trigger');
        expect(VALID_LIMITER_TYPES).toContain('session');
        expect(VALID_LIMITER_TYPES).toContain('calls_accept');
    });

    it('should give the currency scanner its own, larger quota than the shared gemini limit', async () => {
        const identifier = `test_ip_currency_${Date.now()}`;

        // Exhaust the shared gemini quota; currency scanning must be unaffected.
        for (let i = 0; i < 20; i++) {
            expect((await checkRateLimit(identifier, 'gemini')).success).toBe(true);
        }
        expect((await checkRateLimit(identifier, 'gemini')).success).toBe(false);

        for (let i = 0; i < 40; i++) {
            expect((await checkRateLimit(identifier, 'gemini_currency')).success).toBe(true);
        }
        expect((await checkRateLimit(identifier, 'gemini_currency')).success).toBe(false);
    });

    it('should enforce calls_accept rate limit (10 requests per minute)', async () => {
        const identifier = `test_ip_${Date.now()}`;

        // Allow 10 requests
        for (let i = 0; i < 10; i++) {
            const res = await checkRateLimit(identifier, 'calls_accept');
            expect(res.success).toBe(true);
            expect(res.remaining).toBe(10 - 1 - i);
        }

        // 11th request must be rate limited
        const blocked = await checkRateLimit(identifier, 'calls_accept');
        expect(blocked.success).toBe(false);
        expect(blocked.remaining).toBe(0);
    });

    it('should enforce session rate limit (30 requests per minute)', async () => {
        const identifier = `session_ip_${Date.now()}`;

        for (let i = 0; i < 30; i++) {
            const res = await checkRateLimit(identifier, 'session');
            expect(res.success).toBe(true);
        }

        const blocked = await checkRateLimit(identifier, 'session');
        expect(blocked.success).toBe(false);
    });

    it('should throw an error for unknown limiter types in non-production', async () => {
        await expect(checkRateLimit('client_1', 'unknown_type_xyz')).rejects.toThrow(
            /Unknown rate limiter type/
        );
    });
});

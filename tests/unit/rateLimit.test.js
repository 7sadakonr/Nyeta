import { describe, it, expect, beforeEach } from 'vitest';
import { checkRateLimit, VALID_LIMITER_TYPES, _resetMemoryRateLimitForTesting } from '@/lib/server/rateLimit';

describe('Rate Limiter Policies & Enforcement', () => {
    beforeEach(() => {
        _resetMemoryRateLimitForTesting();
    });

    it('should include all required rate limiter types', () => {
        expect(VALID_LIMITER_TYPES).toContain('gemini');
        expect(VALID_LIMITER_TYPES).toContain('pusher_trigger');
        expect(VALID_LIMITER_TYPES).toContain('session');
        expect(VALID_LIMITER_TYPES).toContain('calls_accept');
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

import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { RateLimitResult } from '@/types/server';

interface MemoryRecord {
    count: number;
    resetAt: number;
}

// In-memory sliding window fallback store for local development / testing
const memoryStore = new Map<string, MemoryRecord>();

export type RateLimiterType = 'gemini' | 'pusher_trigger' | 'session' | 'calls_accept';

export const VALID_LIMITER_TYPES: RateLimiterType[] = ['gemini', 'pusher_trigger', 'session', 'calls_accept'];

const MEMORY_LIMITS: Record<RateLimiterType, { max: number; windowMs: number }> = {
    gemini: { max: 20, windowMs: 60 * 1000 },
    pusher_trigger: { max: 60, windowMs: 60 * 1000 },
    session: { max: 30, windowMs: 60 * 1000 },
    calls_accept: { max: 10, windowMs: 60 * 1000 },
};

function checkMemoryRateLimit(identifier: string, maxRequests: number, windowMs: number): RateLimitResult {
    const now = Date.now();
    const key = `${identifier}`;
    let record = memoryStore.get(key);

    if (!record || now > record.resetAt) {
        record = { count: 1, resetAt: now + windowMs };
        memoryStore.set(key, record);
        return {
            success: true,
            limit: maxRequests,
            remaining: maxRequests - 1,
            reset: record.resetAt,
        };
    }

    if (record.count >= maxRequests) {
        return {
            success: false,
            limit: maxRequests,
            remaining: 0,
            reset: record.resetAt,
        };
    }

    record.count += 1;
    return {
        success: true,
        limit: maxRequests,
        remaining: maxRequests - record.count,
        reset: record.resetAt,
    };
}

// Clean up expired in-memory keys periodically
if (typeof setInterval !== 'undefined') {
    const interval = setInterval(() => {
        const now = Date.now();
        for (const [key, val] of memoryStore.entries()) {
            if (now > val.resetAt) {
                memoryStore.delete(key);
            }
        }
    }, 60000);
    if ('unref' in interval && typeof (interval as any).unref === 'function') {
        (interval as any).unref();
    }
}

let redisClient: Redis | null = null;
let ratelimiters: Record<RateLimiterType, Ratelimit> | null = null;

function getUpstashRatelimiters(): Record<RateLimiterType, Ratelimit> | null {
    if (ratelimiters) return ratelimiters;

    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;

    if (!url || !token) {
        return null;
    }

    try {
        redisClient = new Redis({ url, token });
        ratelimiters = {
            gemini: new Ratelimit({
                redis: redisClient,
                limiter: Ratelimit.slidingWindow(20, '60 s'),
                analytics: true,
                prefix: 'nyeta:ratelimit:gemini',
            }),
            pusher_trigger: new Ratelimit({
                redis: redisClient,
                limiter: Ratelimit.slidingWindow(60, '60 s'),
                analytics: true,
                prefix: 'nyeta:ratelimit:trigger',
            }),
            session: new Ratelimit({
                redis: redisClient,
                limiter: Ratelimit.slidingWindow(30, '60 s'),
                analytics: true,
                prefix: 'nyeta:ratelimit:session',
            }),
            calls_accept: new Ratelimit({
                redis: redisClient,
                limiter: Ratelimit.slidingWindow(10, '60 s'),
                analytics: true,
                prefix: 'nyeta:ratelimit:calls_accept',
            }),
        };
        return ratelimiters;
    } catch (err: any) {
        console.warn('Failed to initialize Upstash Redis rate limiter, using in-memory fallback:', err?.message);
        return null;
    }
}

/**
 * Check rate limit for a given identifier (IP, user token, etc.)
 */
export async function checkRateLimit(
    identifier: string = 'anonymous',
    type: RateLimiterType = 'gemini'
): Promise<RateLimitResult> {
    if (!VALID_LIMITER_TYPES.includes(type)) {
        if (process.env.NODE_ENV !== 'production') {
            throw new Error(`Unknown rate limiter type: "${type}". Expected one of: ${VALID_LIMITER_TYPES.join(', ')}`);
        }
        console.error(`[RateLimit] Invalid rate limiter policy "${type}", failing closed.`);
        return {
            success: false,
            limit: 0,
            remaining: 0,
            reset: Date.now() + 60000,
        };
    }

    const limiters = getUpstashRatelimiters();

    if (limiters && limiters[type]) {
        try {
            const result = await limiters[type].limit(identifier);
            return {
                success: result.success,
                limit: result.limit,
                remaining: result.remaining,
                reset: result.reset,
            };
        } catch (err: any) {
            console.error(`Upstash rate limit error for ${type}:`, err?.message);
            // Graceful fallback to memory on network/service glitch
        }
    }

    // In-memory fallback
    const config = MEMORY_LIMITS[type];
    return checkMemoryRateLimit(`${type}:${identifier}`, config.max, config.windowMs);
}

/**
 * Reset memory rate limiter store (for unit tests)
 */
export function _resetMemoryRateLimitForTesting(): void {
    memoryStore.clear();
}

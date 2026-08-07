import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

// In-memory sliding window fallback store for local development / testing
const memoryStore = new Map();

function checkMemoryRateLimit(identifier, maxRequests, windowMs) {
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
    setInterval(() => {
        const now = Date.now();
        for (const [key, val] of memoryStore.entries()) {
            if (now > val.resetAt) {
                memoryStore.delete(key);
            }
        }
    }, 60000).unref?.();
}

let redisClient = null;
let ratelimiters = null;

function getUpstashRatelimiters() {
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
        };
        return ratelimiters;
    } catch (err) {
        console.warn('Failed to initialize Upstash Redis rate limiter, using in-memory fallback:', err.message);
        return null;
    }
}

/**
 * Check rate limit for a given identifier (IP, user token, etc.)
 * @param {string} identifier - Unique client ID or IP address
 * @param {'gemini' | 'pusher_trigger' | 'session'} type - Limiter policy
 * @returns {Promise<{ success: boolean, limit: number, remaining: number, reset: number }>}
 */
export async function checkRateLimit(identifier = 'anonymous', type = 'gemini') {
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
        } catch (err) {
            console.error(`Upstash rate limit error for ${type}:`, err.message);
            // Graceful fallback to memory on network/service glitch
        }
    }

    // In-memory fallback limits
    const limits = {
        gemini: { max: 20, windowMs: 60 * 1000 },
        pusher_trigger: { max: 60, windowMs: 60 * 1000 },
        session: { max: 30, windowMs: 60 * 1000 },
    };

    const config = limits[type] || limits.gemini;
    return checkMemoryRateLimit(`${type}:${identifier}`, config.max, config.windowMs);
}

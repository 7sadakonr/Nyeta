import { Redis } from '@upstash/redis';
import crypto from 'crypto';
import { CallRecord } from '@/features/calling/types';
import { ClaimCallResult } from '@/server/types';

// In-memory call store fallback for local development / testing environments
const memoryCallStore = new Map<string, CallRecord & { expiresAt?: number }>();

// Periodic cleanup of expired in-memory calls
if (typeof setInterval !== 'undefined') {
    const interval = setInterval(() => {
        const now = Date.now();
        for (const [key, val] of memoryCallStore.entries()) {
            if (val.expiresAt && now > val.expiresAt) {
                memoryCallStore.delete(key);
            }
        }
    }, 60000);
    if ('unref' in interval && typeof (interval as any).unref === 'function') {
        (interval as any).unref();
    }
}

let redisClient: Redis | null = null;

function getRedisClient(): Redis | null {
    if (redisClient) return redisClient;

    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;

    if (!url || !token) {
        return null;
    }

    try {
        redisClient = new Redis({ url, token });
        return redisClient;
    } catch (err: any) {
        console.warn('[CallStore] Upstash Redis initialization error, using in-memory store:', err?.message);
        return null;
    }
}

const REDIS_CALL_PREFIX = 'nyeta:call:';
const DEFAULT_CALL_TTL_SECONDS = 600; // 10 minutes

// Lua script for atomic claim operation in Redis
// Returns array: [status_code (1=success, 0=failure), result_or_reason]
const ATOMIC_CLAIM_LUA = `
local key = KEYS[1]
local volunteerId = ARGV[1]
local claimedAt = tonumber(ARGV[2])

local val = redis.call('GET', key)
if not val then
    return {0, 'not_found'}
end

local call = cjson.decode(val)
if call.status ~= 'pending' then
    return {0, call.status}
end

call.status = 'claimed'
call.claimedBy = volunteerId
call.claimedAt = claimedAt

local ttl = redis.call('TTL', key)
if ttl < 0 then
    ttl = 600
end

redis.call('SET', key, cjson.encode(call), 'EX', ttl)
return {1, cjson.encode(call)}
`;

export interface CreateCallStateParams {
    blindUserId: string;
    callId?: string | null;
    ttlSeconds?: number;
}

/**
 * Create a new server-authoritative call record
 */
export async function createCallState({
    blindUserId,
    callId = null,
    ttlSeconds = DEFAULT_CALL_TTL_SECONDS,
}: CreateCallStateParams): Promise<CallRecord> {
    const id = callId || crypto.randomUUID();
    const now = Date.now();
    const record: CallRecord = {
        callId: id,
        status: 'pending',
        blindUserId,
        claimedBy: null,
        createdAt: now,
        claimedAt: null,
        endedAt: null,
    };

    const redis = getRedisClient();
    if (redis) {
        try {
            await redis.set(`${REDIS_CALL_PREFIX}${id}`, JSON.stringify(record), { ex: ttlSeconds });
            return record;
        } catch (err: any) {
            console.error('[CallStore] Redis set call error, falling back to memory:', err?.message);
        }
    }

    // In-memory fallback
    memoryCallStore.set(id, {
        ...record,
        expiresAt: now + ttlSeconds * 1000,
    });
    return record;
}

/**
 * Retrieve current call state
 */
export async function getCallState(callId: string | null | undefined): Promise<CallRecord | null> {
    if (!callId || typeof callId !== 'string') return null;

    const redis = getRedisClient();
    if (redis) {
        try {
            const data = await redis.get(`${REDIS_CALL_PREFIX}${callId}`);
            if (!data) return null;
            return typeof data === 'string' ? JSON.parse(data) : (data as CallRecord);
        } catch (err: any) {
            console.error('[CallStore] Redis get call error, checking memory:', err?.message);
        }
    }

    const memRecord = memoryCallStore.get(callId);
    if (!memRecord) return null;
    if (memRecord.expiresAt && Date.now() > memRecord.expiresAt) {
        memoryCallStore.delete(callId);
        return null;
    }
    return memRecord;
}

/**
 * Atomically claim a pending call by a volunteer
 */
export async function claimCallState(callId: string, volunteerUserId: string): Promise<ClaimCallResult> {
    if (!callId || !volunteerUserId) {
        return { success: false, reason: 'invalid_params' };
    }

    const redis = getRedisClient();
    const now = Date.now();

    if (redis) {
        try {
            const res = await redis.eval(
                ATOMIC_CLAIM_LUA,
                [`${REDIS_CALL_PREFIX}${callId}`],
                [volunteerUserId, String(now)]
            ) as [number, string];

            if (Array.isArray(res)) {
                const [code, result] = res;
                if (code === 1) {
                    const parsed = typeof result === 'string' ? JSON.parse(result) : result;
                    return { success: true, call: parsed };
                }
                return { success: false, reason: result || 'claim_failed' };
            }
        } catch (err: any) {
            console.error('[CallStore] Redis atomic claim error, checking memory:', err?.message);
        }
    }

    // In-memory atomic claim
    const memRecord = memoryCallStore.get(callId);
    if (!memRecord || (memRecord.expiresAt && now > memRecord.expiresAt)) {
        if (memRecord) memoryCallStore.delete(callId);
        return { success: false, reason: 'not_found' };
    }

    if (memRecord.status !== 'pending') {
        return { success: false, reason: memRecord.status };
    }

    memRecord.status = 'claimed';
    memRecord.claimedBy = volunteerUserId;
    memRecord.claimedAt = now;
    memoryCallStore.set(callId, memRecord);

    return { success: true, call: memRecord };
}

/**
 * Update call status (ended, cancelled)
 */
export async function updateCallStatus(callId: string, status: 'ended' | 'cancelled'): Promise<boolean> {
    if (!callId || !['ended', 'cancelled'].includes(status)) return false;

    const redis = getRedisClient();
    const now = Date.now();

    if (redis) {
        try {
            const existing = await redis.get(`${REDIS_CALL_PREFIX}${callId}`);
            if (existing) {
                const record = typeof existing === 'string' ? JSON.parse(existing) : (existing as any);
                record.status = status;
                if (status === 'ended') record.endedAt = now;
                if (status === 'cancelled') record.cancelledAt = now;
                // Keep for 60s for query/logging purposes then expire
                await redis.set(`${REDIS_CALL_PREFIX}${callId}`, JSON.stringify(record), { ex: 60 });
                return true;
            }
        } catch (err: any) {
            console.error('[CallStore] Redis update call status error:', err?.message);
        }
    }

    const memRecord = memoryCallStore.get(callId);
    if (memRecord) {
        memRecord.status = status;
        if (status === 'ended') memRecord.endedAt = now;
        if (status === 'cancelled') memRecord.cancelledAt = now;
        memRecord.expiresAt = now + 60000;
        memoryCallStore.set(callId, memRecord);
        return true;
    }

    return false;
}

/**
 * Reset memory store (strictly for testing)
 */
export function _resetMemoryCallStoreForTesting(): void {
    memoryCallStore.clear();
}

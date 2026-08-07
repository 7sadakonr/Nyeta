let cachedSession = null;

/**
 * Request or retrieve a signed session token from /api/session
 * @param {Object} params
 * @param {'blind' | 'volunteer'} [params.role='blind']
 * @param {boolean} [params.createCall=false]
 * @param {string} [params.userId]
 * @returns {Promise<{ token: string, role: string, callId: string | null, userId: string }>}
 */
export async function getCallSession({ role = 'blind', createCall = false, userId = null } = {}) {
    // If not requesting a new call and we have a valid cached session for the role, reuse it
    if (
        !createCall &&
        cachedSession &&
        cachedSession.role === role &&
        Date.now() < cachedSession.expiresAt
    ) {
        return cachedSession;
    }

    try {
        const response = await fetch('/api/session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role, createCall, userId }),
        });

        if (!response.ok) {
            throw new Error(`Failed to create session token: HTTP ${response.status}`);
        }

        const data = await response.json();
        cachedSession = {
            token: data.token,
            role: data.role,
            callId: data.callId,
            userId: data.userId,
            expiresAt: Date.now() + 3.5 * 60 * 60 * 1000, // 3.5 hours
        };

        return cachedSession;
    } catch (err) {
        console.error('Session creation error:', err);
        throw err;
    }
}

export function getActiveSession() {
    return cachedSession;
}

export function getActiveSessionToken() {
    return cachedSession?.token || null;
}

export function setActiveSession(session) {
    cachedSession = session;
}

export function clearCachedSession() {
    cachedSession = null;
}


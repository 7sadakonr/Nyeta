let cachedSession = null;

/**
 * Request or retrieve a signed session token
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
        const endpoint = (role === 'blind' && createCall) ? '/api/calls' : '/api/session';
        const headers = { 'Content-Type': 'application/json' };
        if (cachedSession?.token) {
            headers['Authorization'] = `Bearer ${cachedSession.token}`;
        }

        const response = await fetch(endpoint, {
            method: 'POST',
            headers,
            body: JSON.stringify({ role, createCall, userId }),
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            const err = new Error(errData.error || `Failed to create session token: HTTP ${response.status}`);
            err.status = response.status;
            throw err;
        }

        const data = await response.json();
        const ttlMs = data.callId ? 18 * 60 * 1000 : 3.5 * 60 * 60 * 1000;

        cachedSession = {
            token: data.token,
            role: data.role,
            callId: data.callId,
            userId: data.userId,
            expiresAt: Date.now() + ttlMs,
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

/**
 * Accept an incoming call as a volunteer and obtain a call-scoped session token
 * @param {string} callId
 * @param {string} [baseToken]
 * @returns {Promise<{ token: string, role: string, callId: string, userId: string }>}
 */
export async function acceptCallSession(callId, baseToken = null) {
    if (!callId) {
        throw new Error('callId is required to accept a call session');
    }

    const tokenToUse = baseToken || getActiveSessionToken();

    try {
        const response = await fetch(`/api/calls/${encodeURIComponent(callId)}/accept`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(tokenToUse ? { 'Authorization': `Bearer ${tokenToUse}` } : {}),
            },
            body: JSON.stringify({ token: tokenToUse }),
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            const err = new Error(errData.error || `Failed to accept call: HTTP ${response.status}`);
            err.status = response.status;
            throw err;
        }

        const data = await response.json();
        const callSession = {
            token: data.token,
            role: data.role,
            callId: data.callId,
            userId: data.userId,
            expiresAt: Date.now() + 18 * 60 * 1000, // 18 minutes for call-scoped token
        };

        setActiveSession(callSession);
        return callSession;
    } catch (err) {
        console.error('Accept call session error:', err);
        throw err;
    }
}

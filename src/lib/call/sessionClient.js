let cachedSession = null;

/**
 * Request or retrieve a signed session token from /api/session
 * @param {Object} params
 * @param {'blind' | 'volunteer'} params.role
 * @param {string} [params.callId]
 * @returns {Promise<{ token: string, role: string, callId: string | null }>}
 */
export async function getCallSession({ role = 'blind', callId = null } = {}) {
    // If we have a cached valid session for the same role and callId, reuse it
    if (
        cachedSession &&
        cachedSession.role === role &&
        cachedSession.callId === (callId || null) &&
        Date.now() < cachedSession.expiresAt
    ) {
        return cachedSession;
    }

    try {
        const response = await fetch('/api/session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role, callId }),
        });

        if (!response.ok) {
            throw new Error(`Failed to create session token: HTTP ${response.status}`);
        }

        const data = await response.json();
        cachedSession = {
            token: data.token,
            role: data.role,
            callId: data.callId,
            expiresAt: Date.now() + 3.5 * 60 * 60 * 1000, // 3.5 hours
        };

        return cachedSession;
    } catch (err) {
        console.error('Session creation error:', err);
        throw err;
    }
}

export function clearCachedSession() {
    cachedSession = null;
}

import crypto from 'crypto';

function getSecret() {
    const secret = process.env.SESSION_SECRET || process.env.PUSHER_SECRET;
    if (secret) return secret;
    if (process.env.NODE_ENV === 'production') {
        throw new Error('CRITICAL: SESSION_SECRET or PUSHER_SECRET must be set in production');
    }
    // Fallback for development/testing
    return 'nyeta-dev-session-secret-key-32chars-min!!';
}

function base64UrlEncode(str) {
    return Buffer.from(str)
        .toString('base64')
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
}

function base64UrlDecode(str) {
    let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) {
        base64 += '=';
    }
    return Buffer.from(base64, 'base64').toString('utf8');
}

function sign(data, secret) {
    return crypto
        .createHmac('sha256', secret)
        .update(data)
        .digest('base64')
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
}

/**
 * Generate a cryptographically signed session token
 * @param {Object} params
 * @param {string} params.userId - Unique user or device identifier
 * @param {'blind' | 'volunteer'} params.role - User role
 * @param {string} [params.callId] - Active call room ID (if applicable)
 * @param {number} [params.ttlMs] - Time to live in ms (default 4 hours)
 * @returns {string} Signed token string
 */
export function generateSessionToken({ userId, role, callId = null, ttlMs = 4 * 60 * 60 * 1000 }) {
    if (!role || !['blind', 'volunteer'].includes(role)) {
        throw new Error(`Invalid role: ${role}`);
    }

    const iat = Date.now();
    const exp = iat + ttlMs;
    const uid = userId || `${role}_${crypto.randomBytes(8).toString('hex')}`;

    const payload = JSON.stringify({
        userId: uid,
        role,
        callId: callId || null,
        iat,
        exp,
    });

    const encodedPayload = base64UrlEncode(payload);
    const signature = sign(encodedPayload, getSecret());

    return `${encodedPayload}.${signature}`;
}

/**
 * Verify and decode a session token
 * @param {string} token
 * @returns {{ userId: string, role: 'blind' | 'volunteer', callId: string | null, exp: number, iat: number } | null}
 */
export function verifySessionToken(token) {
    if (!token || typeof token !== 'string') return null;

    const parts = token.split('.');
    if (parts.length !== 2) return null;

    const [encodedPayload, signature] = parts;
    const expectedSignature = sign(encodedPayload, getSecret());

    // Timing-safe comparison
    try {
        const sigBuf = Buffer.from(signature);
        const expectedBuf = Buffer.from(expectedSignature);
        if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
            return null;
        }
    } catch {
        return null;
    }

    try {
        const payload = JSON.parse(base64UrlDecode(encodedPayload));
        if (!payload || !payload.exp || Date.now() > payload.exp) {
            return null; // Expired or malformed
        }
        return payload;
    } catch {
        return null;
    }
}

export const ALLOWED_CHANNELS = {
    PRESENCE_VOLUNTEERS: 'presence-volunteers',
    CALL_PREFIX: 'private-call-',
};

export const ALLOWED_EVENTS = {
    'presence-volunteers': ['incoming-call', 'call-claimed', 'call-cancelled'],
    'private-call': ['call-accepted', 'offer', 'answer', 'ice-candidate', 'call-ended'],
};

export const ALLOWED_ROLE_EVENTS = {
    'presence-volunteers': {
        'incoming-call': ['blind'],
        'call-cancelled': ['blind'],
        'call-claimed': ['volunteer', 'blind'],
    },
    'private-call': {
        'offer': ['blind'],
        'call-accepted': ['volunteer'],
        'answer': ['volunteer'],
        'ice-candidate': ['blind', 'volunteer'],
        'call-ended': ['blind', 'volunteer'],
    },
};

/**
 * Validate whether a decoded session token has permission to access a channel
 * @param {Object} tokenPayload
 * @param {string} channelName
 * @returns {boolean}
 */
export function validateChannelPermission(tokenPayload, channelName) {
    if (!tokenPayload || !channelName || typeof channelName !== 'string') return false;

    if (channelName === ALLOWED_CHANNELS.PRESENCE_VOLUNTEERS) {
        // Volunteer presence channel: Volunteers can join, and Blind users can broadcast incoming-call
        return tokenPayload.role === 'volunteer' || tokenPayload.role === 'blind';
    }

    if (channelName.startsWith(ALLOWED_CHANNELS.CALL_PREFIX)) {
        const targetCallId = channelName.replace(ALLOWED_CHANNELS.CALL_PREFIX, '');
        if (!targetCallId) return false;

        // Private call channels require a token issued specifically for targetCallId
        // Generic tokens with callId === null or mismatched callId are strictly rejected
        if (!tokenPayload.callId || tokenPayload.callId !== targetCallId) {
            return false;
        }
        return tokenPayload.role === 'blind' || tokenPayload.role === 'volunteer';
    }

    return false;
}

/**
 * Validate whether an event is allowed on a channel
 * @param {string} channelName
 * @param {string} eventName
 * @returns {boolean}
 */
export function validateEventPermission(channelName, eventName) {
    if (!channelName || !eventName || typeof channelName !== 'string' || typeof eventName !== 'string') return false;

    if (channelName === ALLOWED_CHANNELS.PRESENCE_VOLUNTEERS) {
        return ALLOWED_EVENTS['presence-volunteers'].includes(eventName);
    }

    if (channelName.startsWith(ALLOWED_CHANNELS.CALL_PREFIX)) {
        return ALLOWED_EVENTS['private-call'].includes(eventName);
    }

    return false;
}

/**
 * Validate whether a token has permission to trigger a specific event on a channel
 * @param {Object} tokenPayload
 * @param {string} channelName
 * @param {string} eventName
 * @param {Object} [eventData]
 * @returns {boolean}
 */
export function validateRoleEventPermission(tokenPayload, channelName, eventName, eventData = {}) {
    if (!tokenPayload || !tokenPayload.role || !channelName || !eventName) return false;

    if (!validateChannelPermission(tokenPayload, channelName)) return false;
    if (!validateEventPermission(channelName, eventName)) return false;

    let allowedRoles = [];
    if (channelName === ALLOWED_CHANNELS.PRESENCE_VOLUNTEERS) {
        allowedRoles = ALLOWED_ROLE_EVENTS['presence-volunteers'][eventName] || [];
    } else if (channelName.startsWith(ALLOWED_CHANNELS.CALL_PREFIX)) {
        allowedRoles = ALLOWED_ROLE_EVENTS['private-call'][eventName] || [];
    }

    if (!allowedRoles.includes(tokenPayload.role)) {
        return false;
    }

    // Role-specific data consistency checks
    if (channelName === ALLOWED_CHANNELS.PRESENCE_VOLUNTEERS) {
        if (eventName === 'incoming-call' || eventName === 'call-cancelled') {
            if (tokenPayload.callId && eventData?.callId && tokenPayload.callId !== eventData.callId) {
                return false;
            }
        }
    }

    return true;
}


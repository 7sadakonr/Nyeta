import { getPusherClient } from '../pusher-client';
import { getActiveSessionToken } from './sessionClient';

/**
 * Relay a signaling event through the serverless trigger route with authorization token.
 * @param {string} channel
 * @param {string} event
 * @param {any} data
 * @param {string} [token] - Optional session token for authorization (defaults to active session token)
 * @returns {Promise<boolean>}
 */
export async function sendEvent(channel, event, data, token = null) {
    const activeToken = token || getActiveSessionToken();
    try {
        const headers = { 'Content-Type': 'application/json' };
        if (activeToken) {
            headers['Authorization'] = `Bearer ${activeToken}`;
        }
        const res = await fetch('/api/pusher/trigger', {
            method: 'POST',
            headers,
            body: JSON.stringify({ channel, event, data, token: activeToken }),
        });
        if (!res.ok) {
            const errorData = await res.json().catch(() => ({}));
            console.error('sendEvent failed', res.status, errorData);
            return false;
        }
        return true;
    } catch (err) {
        console.error('sendEvent error', err);
        return false;
    }
}

/** Subscribe to a channel (reusing an existing subscription if present). */
export function subscribe(channelName) {
    const pusher = getPusherClient();
    if (!pusher) return null;
    return pusher.channel(channelName) || pusher.subscribe(channelName);
}

/** Leave a channel. */
export function unsubscribe(channelName) {
    const pusher = getPusherClient();
    if (!pusher) return;
    pusher.unsubscribe(channelName);
}

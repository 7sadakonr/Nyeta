'use client';

import { getPusherClient } from '../pusher-client';

/**
 * Relay a signaling event through the serverless trigger route.
 * We go through the server (instead of Pusher client events) so we don't depend
 * on the "client events" dashboard toggle and get more reliable delivery.
 */
export async function sendEvent(channel, event, data) {
    try {
        const res = await fetch('/api/pusher/trigger', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ channel, event, data }),
        });
        if (!res.ok) {
            const text = await res.text().catch(() => '');
            console.error('sendEvent failed', res.status, text);
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

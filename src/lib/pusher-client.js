'use client';

import PusherJS from 'pusher-js';

let pusherClient = null;

/**
 * Lazily create a single browser Pusher client.
 * Presence/private channels are authorized through our /api/pusher/auth route.
 */
export function getPusherClient() {
    if (typeof window === 'undefined') return null;
    if (pusherClient) return pusherClient;

    const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
    const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;

    if (!key || !cluster) {
        console.error('Pusher key/cluster missing. Check NEXT_PUBLIC_PUSHER_* env vars.');
        return null;
    }

    pusherClient = new PusherJS(key, {
        cluster,
        forceTLS: true,
        channelAuthorization: {
            endpoint: '/api/pusher/auth',
            transport: 'ajax',
        },
    });

    return pusherClient;
}

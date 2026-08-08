'use client';

import PusherJS from 'pusher-js';
import { getActiveSessionToken, getCallSession } from './sessionClient';
import { UserRole } from '@/server/types';

let pusherClient: PusherJS | MockPusher | null = null;

class MockPusherChannel {
    name: string;
    callbacks: Record<string, Function[]>;
    subscribed: boolean;

    constructor(name: string) {
        this.name = name;
        this.callbacks = {};
        this.subscribed = true;
    }

    bind(event: string, callback: Function): this {
        if (!this.callbacks[event]) this.callbacks[event] = [];
        this.callbacks[event].push(callback);
        if (event === 'pusher:subscription_succeeded') {
            setTimeout(() => callback({ count: 1 }), 10);
        }
        return this;
    }

    unbind(event: string, callback: Function): void {
        if (this.callbacks[event]) {
            this.callbacks[event] = this.callbacks[event].filter(cb => cb !== callback);
        }
    }

    emit(event: string, data: any): void {
        (this.callbacks[event] || []).forEach(cb => cb(data));
    }
}

class MockPusher {
    channels: Record<string, MockPusherChannel>;

    constructor() {
        this.channels = {};
    }

    channel(name: string): MockPusherChannel | null {
        return this.channels[name] || null;
    }

    subscribe(name: string): MockPusherChannel {
        if (!this.channels[name]) {
            this.channels[name] = new MockPusherChannel(name);
        }
        return this.channels[name];
    }

    unsubscribe(name: string): void {
        delete this.channels[name];
    }
}

/**
 * Lazily create a single browser Pusher client.
 * In development or CI when keys are not configured, uses a mock client to prevent UI breakages.
 */
export function getPusherClient(): any {
    if (typeof window === 'undefined') return null;
    if (pusherClient) return pusherClient;

    const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
    const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;

    if (!key || !cluster || key === 'ci-mock-pusher-key' || key.includes('your_')) {
        if (process.env.NODE_ENV !== 'production' || key === 'ci-mock-pusher-key') {
            pusherClient = new MockPusher();
            return pusherClient;
        }
        console.error('Pusher key/cluster missing. Check NEXT_PUBLIC_PUSHER_* env vars.');
        return null;
    }

    pusherClient = new PusherJS(key, {
        cluster,
        forceTLS: true,
        channelAuthorization: {
            customHandler: async ({ socketId, channelName }, callback) => {
                try {
                    let token = getActiveSessionToken();
                    if (!token) {
                        const role: UserRole = channelName === 'presence-volunteers' ? 'volunteer' : 'blind';
                        const session = await getCallSession({ role }).catch(() => null);
                        token = session?.token || null;
                    }

                    if (!token) {
                        return callback(new Error('No session token available for channel authorization'), null);
                    }

                    const res = await fetch('/api/pusher/auth', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`,
                        },
                        body: JSON.stringify({
                            socket_id: socketId,
                            channel_name: channelName,
                            token,
                        }),
                    });

                    if (!res.ok) {
                        const errData = await res.json().catch(() => ({}));
                        return callback(new Error(errData.error || `Auth failed: HTTP ${res.status}`), null);
                    }

                    const authData = await res.json();
                    callback(null, authData);
                } catch (err: any) {
                    callback(err, null);
                }
            },
        },
    });

    return pusherClient;
}

'use client';

import PusherJS from 'pusher-js';

let pusherClient = null;

class MockPusherChannel {
    constructor(name) {
        this.name = name;
        this.callbacks = {};
        this.subscribed = true;
    }
    bind(event, callback) {
        if (!this.callbacks[event]) this.callbacks[event] = [];
        this.callbacks[event].push(callback);
        if (event === 'pusher:subscription_succeeded') {
            setTimeout(() => callback({ count: 1 }), 10);
        }
        return this;
    }
    unbind(event, callback) {
        if (this.callbacks[event]) {
            this.callbacks[event] = this.callbacks[event].filter(cb => cb !== callback);
        }
    }
    emit(event, data) {
        (this.callbacks[event] || []).forEach(cb => cb(data));
    }
}

class MockPusher {
    constructor() {
        this.channels = {};
    }
    channel(name) {
        return this.channels[name] || null;
    }
    subscribe(name) {
        if (!this.channels[name]) {
            this.channels[name] = new MockPusherChannel(name);
        }
        return this.channels[name];
    }
    unsubscribe(name) {
        delete this.channels[name];
    }
}

/**
 * Lazily create a single browser Pusher client.
 * In development or CI when keys are not configured, uses a mock client to prevent UI breakages.
 */
export function getPusherClient() {
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
            endpoint: '/api/pusher/auth',
            transport: 'ajax',
        },
    });

    return pusherClient;
}

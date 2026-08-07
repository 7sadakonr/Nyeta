import { test, expect } from '@playwright/test';

test.describe('API Validation & Error Handling E2E', () => {
    test('rejects direct Gemini requests without valid contents', async ({ request }) => {
        const response = await request.post('/api/gemini', {
            data: {},
        });
        expect(response.status()).toBe(400);
        const json = await response.json();
        expect(json.error).toBeDefined();
    });

    test('rejects pusher auth without session token', async ({ request }) => {
        const response = await request.post('/api/pusher/auth', {
            data: {
                socket_id: '123.456',
                channel_name: 'presence-volunteers',
            },
        });
        expect(response.status()).toBe(401);
    });

    test('rejects pusher trigger without session token', async ({ request }) => {
        const response = await request.post('/api/pusher/trigger', {
            data: {
                channel: 'presence-volunteers',
                event: 'incoming-call',
                data: {},
            },
        });
        expect(response.status()).toBe(401);
    });

    test('rejects pusher trigger with invalid role event (e.g. volunteer triggering incoming-call)', async ({ request }) => {
        // First get a volunteer session token
        const sessionRes = await request.post('/api/session', {
            data: { role: 'volunteer' },
        });
        expect(sessionRes.status()).toBe(200);
        const { token } = await sessionRes.json();

        // Volunteer attempts to trigger blind incoming-call
        const triggerRes = await request.post('/api/pusher/trigger', {
            data: {
                channel: 'presence-volunteers',
                event: 'incoming-call',
                data: { callId: 'test-room' },
                token,
            },
        });
        expect(triggerRes.status()).toBe(403);
    });

    test('issues server-authoritative callId for blind and ignores client-requested callId on /api/session', async ({ request }) => {
        const response = await request.post('/api/session', {
            data: {
                role: 'blind',
                callId: 'client-injected-id',
            },
        });
        expect(response.status()).toBe(200);
        const json = await response.json();
        expect(json.token).toBeDefined();
        expect(json.userId).toBeDefined();
        // Server MUST NOT use client-injected-id
        expect(json.callId).not.toBe('client-injected-id');
        expect(typeof json.callId).toBe('string');
    });

    test('returns ICE servers on /api/webrtc/ice', async ({ request }) => {
        const response = await request.get('/api/webrtc/ice');
        expect(response.status()).toBe(200);
        const json = await response.json();
        expect(Array.isArray(json.iceServers)).toBe(true);
        expect(json.iceServers.length).toBeGreaterThan(0);
    });
});

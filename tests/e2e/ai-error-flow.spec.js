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

    test('rejects pusher trigger with unauthorized event', async ({ request }) => {
        const response = await request.post('/api/pusher/trigger', {
            data: {
                channel: 'presence-volunteers',
                event: 'unauthorized-event',
                data: {},
            },
        });
        expect(response.status()).toBe(403);
    });

    test('issues HMAC session token on /api/session', async ({ request }) => {
        const response = await request.post('/api/session', {
            data: {
                role: 'blind',
                callId: 'test-call-123',
            },
        });
        expect(response.status()).toBe(200);
        const json = await response.json();
        expect(json.token).toBeDefined();
        expect(json.userId).toBeDefined();
    });

    test('returns ICE servers on /api/webrtc/ice', async ({ request }) => {
        const response = await request.get('/api/webrtc/ice');
        expect(response.status()).toBe(200);
        const json = await response.json();
        expect(Array.isArray(json.iceServers)).toBe(true);
        expect(json.iceServers.length).toBeGreaterThan(0);
    });
});

import { test, expect } from '@playwright/test';

test.describe('API Validation & Call Lifecycle E2E', () => {
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

    test('issues server-authoritative callId via POST /api/calls', async ({ request }) => {
        const response = await request.post('/api/calls', {
            data: {
                callId: 'client-injected-id',
            },
        });
        expect(response.status()).toBe(200);
        const json = await response.json();
        expect(json.token).toBeDefined();
        expect(json.userId).toBeDefined();
        expect(json.callId).toBeDefined();
        expect(json.callId).not.toBe('client-injected-id');
        expect(json.status).toBe('pending');
    });

    test('returns ICE servers on /api/webrtc/ice with private no-store Cache-Control', async ({ request }) => {
        const response = await request.get('/api/webrtc/ice');
        expect(response.status()).toBe(200);
        const headers = response.headers();
        expect(headers['cache-control']).toContain('private');
        expect(headers['cache-control']).toContain('no-store');
        const json = await response.json();
        expect(Array.isArray(json.iceServers)).toBe(true);
        expect(json.iceServers.length).toBeGreaterThan(0);
    });

    test('/api/calls/:callId/accept rejects unauthenticated requests', async ({ request }) => {
        const response = await request.post('/api/calls/room-123/accept', {
            data: {},
        });
        expect(response.status()).toBe(401);
    });

    test('/api/calls/:callId/accept rejects blind role attempting to accept call', async ({ request }) => {
        const sessionRes = await request.post('/api/session', {
            data: { role: 'blind' },
        });
        const { token } = await sessionRes.json();

        const response = await request.post('/api/calls/room-123/accept', {
            headers: { Authorization: `Bearer ${token}` },
            data: {},
        });
        expect(response.status()).toBe(403);
    });

    test('/api/calls/:callId/accept returns 404 for non-existent call', async ({ request }) => {
        const sessionRes = await request.post('/api/session', {
            data: { role: 'volunteer' },
        });
        const { token } = await sessionRes.json();

        const response = await request.post('/api/calls/non-existent-room-999/accept', {
            headers: { Authorization: `Bearer ${token}` },
            data: {},
        });
        expect(response.status()).toBe(404);
    });

    test('/api/calls/:callId/accept claims call and blocks second volunteer with 409 Conflict', async ({ request }) => {
        // 1. Blind user creates call
        const callRes = await request.post('/api/calls', { data: {} });
        expect(callRes.status()).toBe(200);
        const { callId } = await callRes.json();

        // 2. Volunteer 1 accepts
        const vol1Res = await request.post('/api/session', { data: { role: 'volunteer' } });
        const { token: vol1Token } = await vol1Res.json();

        const accept1Res = await request.post(`/api/calls/${callId}/accept`, {
            headers: { Authorization: `Bearer ${vol1Token}` },
            data: {},
        });
        expect(accept1Res.status()).toBe(200);
        const accept1Json = await accept1Res.json();
        expect(accept1Json.callId).toBe(callId);
        expect(accept1Json.status).toBe('claimed');

        // 3. Volunteer 2 attempts to accept same call
        const vol2Res = await request.post('/api/session', { data: { role: 'volunteer' } });
        const { token: vol2Token } = await vol2Res.json();

        const accept2Res = await request.post(`/api/calls/${callId}/accept`, {
            headers: { Authorization: `Bearer ${vol2Token}` },
            data: {},
        });
        expect(accept2Res.status()).toBe(409);
        const accept2Json = await accept2Res.json();
        expect(accept2Json.error).toContain('already been accepted');
    });
});

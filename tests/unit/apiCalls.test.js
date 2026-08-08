import { describe, it, expect, beforeEach } from 'vitest';
import { POST as createCallRoute } from '@/app/api/calls/route';
import { POST as acceptCallRoute } from '@/app/api/calls/[callId]/accept/route';
import { generateSessionToken, verifySessionToken } from '@/server/auth/sessionAuth';
import { _resetMemoryCallStoreForTesting } from '@/server/calls/callStore';
import { _resetMemoryRateLimitForTesting } from '@/server/security/rateLimit';

function createMockRequest(url, { method = 'POST', headers = {}, body = null } = {}) {
    return new Request(url, {
        method,
        headers: new Headers({
            'Content-Type': 'application/json',
            ...headers,
        }),
        body: body ? JSON.stringify(body) : null,
    });
}

describe('Call Creation & Acceptance API Handlers (/api/calls)', () => {
    beforeEach(() => {
        _resetMemoryCallStoreForTesting();
        _resetMemoryRateLimitForTesting();
    });

    it('POST /api/calls creates a server-authoritative call and returns call-scoped blind token', async () => {
        const req = createMockRequest('http://localhost:3000/api/calls', {
            body: {},
        });

        const res = await createCallRoute(req);
        expect(res.status).toBe(200);

        const data = await res.json();
        expect(data.callId).toBeDefined();
        expect(typeof data.callId).toBe('string');
        expect(data.token).toBeDefined();
        expect(data.role).toBe('blind');
        expect(data.status).toBe('pending');

        const verification = verifySessionToken(data.token);
        expect(verification).not.toBeNull();
        expect(verification.role).toBe('blind');
        expect(verification.callId).toBe(data.callId);
    });

    it('POST /api/calls/:callId/accept returns 401 without session token', async () => {
        const req = createMockRequest('http://localhost:3000/api/calls/some-call/accept', {
            body: {},
        });

        const res = await acceptCallRoute(req, { params: Promise.resolve({ callId: 'some-call' }) });
        expect(res.status).toBe(401);
        const data = await res.json();
        expect(data.error).toContain('Missing session token');
    });

    it('POST /api/calls/:callId/accept returns 403 when blind user attempts to accept call', async () => {
        const blindToken = generateSessionToken({ role: 'blind' });
        const req = createMockRequest('http://localhost:3000/api/calls/some-call/accept', {
            headers: { Authorization: `Bearer ${blindToken}` },
            body: {},
        });

        const res = await acceptCallRoute(req, { params: Promise.resolve({ callId: 'some-call' }) });
        expect(res.status).toBe(403);
    });

    it('POST /api/calls/:callId/accept returns 404 when call does not exist', async () => {
        const volunteerToken = generateSessionToken({ role: 'volunteer' });
        const req = createMockRequest('http://localhost:3000/api/calls/non-existent-call/accept', {
            headers: { Authorization: `Bearer ${volunteerToken}` },
            body: {},
        });

        const res = await acceptCallRoute(req, { params: Promise.resolve({ callId: 'non-existent-call' }) });
        expect(res.status).toBe(404);
    });

    it('POST /api/calls/:callId/accept succeeds for volunteer on pending call and issues call-scoped token', async () => {
        // 1. Create pending call
        const createReq = createMockRequest('http://localhost:3000/api/calls', { body: {} });
        const createRes = await createCallRoute(createReq);
        const { callId } = await createRes.json();

        // 2. Volunteer accepts call
        const volunteerToken = generateSessionToken({ role: 'volunteer' });
        const acceptReq = createMockRequest(`http://localhost:3000/api/calls/${callId}/accept`, {
            headers: { Authorization: `Bearer ${volunteerToken}` },
            body: {},
        });

        const acceptRes = await acceptCallRoute(acceptReq, { params: Promise.resolve({ callId }) });
        expect(acceptRes.status).toBe(200);

        const data = await acceptRes.json();
        expect(data.token).toBeDefined();
        expect(data.role).toBe('volunteer');
        expect(data.callId).toBe(callId);

        const verification = verifySessionToken(data.token);
        expect(verification.role).toBe('volunteer');
        expect(verification.callId).toBe(callId);
    });

    it('POST /api/calls/:callId/accept returns 409 Conflict for second volunteer', async () => {
        // 1. Create pending call
        const createReq = createMockRequest('http://localhost:3000/api/calls', { body: {} });
        const createRes = await createCallRoute(createReq);
        const { callId } = await createRes.json();

        // 2. Volunteer 1 accepts call
        const vol1Token = generateSessionToken({ role: 'volunteer', userId: 'vol_1' });
        const acceptReq1 = createMockRequest(`http://localhost:3000/api/calls/${callId}/accept`, {
            headers: { Authorization: `Bearer ${vol1Token}` },
            body: {},
        });
        const acceptRes1 = await acceptCallRoute(acceptReq1, { params: Promise.resolve({ callId }) });
        expect(acceptRes1.status).toBe(200);

        // 3. Volunteer 2 attempts to accept the same call
        const vol2Token = generateSessionToken({ role: 'volunteer', userId: 'vol_2' });
        const acceptReq2 = createMockRequest(`http://localhost:3000/api/calls/${callId}/accept`, {
            headers: { Authorization: `Bearer ${vol2Token}` },
            body: {},
        });
        const acceptRes2 = await acceptCallRoute(acceptReq2, { params: Promise.resolve({ callId }) });
        expect(acceptRes2.status).toBe(409);

        const conflictData = await acceptRes2.json();
        expect(conflictData.error).toContain('already been accepted');
    });
});

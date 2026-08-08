import { describe, it, expect, beforeEach } from 'vitest';
import {
    createCallState,
    getCallState,
    claimCallState,
    updateCallStatus,
    _resetMemoryCallStoreForTesting,
} from '@/server/calls/callStore';

describe('Server-Side Call State Store', () => {
    beforeEach(() => {
        _resetMemoryCallStoreForTesting();
    });

    it('creates a pending call with server-generated ID and blind user ID', async () => {
        const blindUserId = 'blind_test123';
        const call = await createCallState({ blindUserId, ttlSeconds: 300 });

        expect(call).toBeDefined();
        expect(call.callId).toBeDefined();
        expect(typeof call.callId).toBe('string');
        expect(call.status).toBe('pending');
        expect(call.blindUserId).toBe(blindUserId);
        expect(call.claimedBy).toBeNull();
        expect(call.createdAt).toBeGreaterThan(0);

        const fetched = await getCallState(call.callId);
        expect(fetched).toBeDefined();
        expect(fetched.callId).toBe(call.callId);
        expect(fetched.status).toBe('pending');
    });

    it('allows a volunteer to atomically claim a pending call', async () => {
        const call = await createCallState({ blindUserId: 'blind_user_1' });
        const volunteerId = 'volunteer_alpha';

        const claimResult = await claimCallState(call.callId, volunteerId);
        expect(claimResult.success).toBe(true);
        expect(claimResult.call).toBeDefined();
        expect(claimResult.call.status).toBe('claimed');
        expect(claimResult.call.claimedBy).toBe(volunteerId);
        expect(claimResult.call.claimedAt).toBeGreaterThan(0);

        const updated = await getCallState(call.callId);
        expect(updated.status).toBe('claimed');
        expect(updated.claimedBy).toBe(volunteerId);
    });

    it('rejects duplicate claim by a second volunteer with already claimed reason', async () => {
        const call = await createCallState({ blindUserId: 'blind_user_2' });
        
        // First volunteer claims
        const firstClaim = await claimCallState(call.callId, 'volunteer_first');
        expect(firstClaim.success).toBe(true);

        // Second volunteer attempts to claim same call
        const secondClaim = await claimCallState(call.callId, 'volunteer_second');
        expect(secondClaim.success).toBe(false);
        expect(['claimed', 'already_claimed']).toContain(secondClaim.reason);
    });

    it('returns not_found when claiming non-existent callId', async () => {
        const claimResult = await claimCallState('non_existent_call_id', 'volunteer_1');
        expect(claimResult.success).toBe(false);
        expect(claimResult.reason).toBe('not_found');
    });

    it('updates call status to ended or cancelled', async () => {
        const call = await createCallState({ blindUserId: 'blind_user_3' });

        const endResult = await updateCallStatus(call.callId, 'ended');
        expect(endResult).toBe(true);

        const stateAfterEnd = await getCallState(call.callId);
        expect(stateAfterEnd.status).toBe('ended');
        expect(stateAfterEnd.endedAt).toBeGreaterThan(0);

        // Attempting to claim an ended call fails
        const claimAfterEnd = await claimCallState(call.callId, 'volunteer_late');
        expect(claimAfterEnd.success).toBe(false);
        expect(claimAfterEnd.reason).toBe('ended');
    });

    it('returns null for expired calls', async () => {
        // Create call with immediate expiration
        const call = await createCallState({ blindUserId: 'blind_fast', ttlSeconds: -1 });
        const fetched = await getCallState(call.callId);
        expect(fetched).toBeNull();
    });
});

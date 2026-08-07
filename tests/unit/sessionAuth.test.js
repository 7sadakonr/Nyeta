import { describe, it, expect } from 'vitest';
import {
    generateSessionToken,
    verifySessionToken,
    validateChannelPermission,
    validateEventPermission,
    validateRoleEventPermission,
    ALLOWED_CHANNELS,
} from '@/lib/server/sessionAuth';

describe('Server Session Authentication & Channel Authorization', () => {
    it('should generate and verify a valid session token for blind user', () => {
        const token = generateSessionToken({
            userId: 'user_123',
            role: 'blind',
            callId: 'call_abc',
        });

        expect(token).toBeDefined();
        expect(typeof token).toBe('string');

        const payload = verifySessionToken(token);
        expect(payload).not.toBeNull();
        expect(payload.userId).toBe('user_123');
        expect(payload.role).toBe('blind');
        expect(payload.callId).toBe('call_abc');
    });

    it('should reject tampered tokens', () => {
        const token = generateSessionToken({ role: 'blind' });
        const [payload, sig] = token.split('.');
        const tamperedToken = `${payload}.tampered_signature`;

        expect(verifySessionToken(tamperedToken)).toBeNull();
    });

    it('should reject expired tokens', () => {
        const expiredToken = generateSessionToken({
            role: 'volunteer',
            ttlMs: -1000, // already expired
        });

        expect(verifySessionToken(expiredToken)).toBeNull();
    });

    it('should validate channel permissions correctly', () => {
        const blindPayload = { userId: 'b1', role: 'blind', callId: 'room1' };
        const volunteerPayload = { userId: 'v1', role: 'volunteer', callId: null };

        // Presence channel: volunteers and blind can access
        expect(validateChannelPermission(blindPayload, ALLOWED_CHANNELS.PRESENCE_VOLUNTEERS)).toBe(true);
        expect(validateChannelPermission(volunteerPayload, ALLOWED_CHANNELS.PRESENCE_VOLUNTEERS)).toBe(true);

        // Private call channel matching callId
        expect(validateChannelPermission(blindPayload, 'private-call-room1')).toBe(true);
        // Disallow mismatched call channel
        expect(validateChannelPermission(blindPayload, 'private-call-room2')).toBe(false);

        // Disallow unknown channel patterns
        expect(validateChannelPermission(blindPayload, 'some-random-channel')).toBe(false);
    });

    it('should validate event permissions on allowed channels', () => {
        // Presence channel events
        expect(validateEventPermission('presence-volunteers', 'incoming-call')).toBe(true);
        expect(validateEventPermission('presence-volunteers', 'call-claimed')).toBe(true);
        expect(validateEventPermission('presence-volunteers', 'offer')).toBe(false);

        // Private call channel events
        expect(validateEventPermission('private-call-123', 'offer')).toBe(true);
        expect(validateEventPermission('private-call-123', 'answer')).toBe(true);
        expect(validateEventPermission('private-call-123', 'ice-candidate')).toBe(true);
        expect(validateEventPermission('private-call-123', 'incoming-call')).toBe(false);
    });

    it('should enforce role-based event matrix with validateRoleEventPermission', () => {
        const blindPayload = { userId: 'b1', role: 'blind', callId: 'room1' };
        const volunteerPayload = { userId: 'v1', role: 'volunteer', callId: null };

        // Presence channel: blind can send incoming-call / call-cancelled
        expect(validateRoleEventPermission(blindPayload, 'presence-volunteers', 'incoming-call', { callId: 'room1' })).toBe(true);
        expect(validateRoleEventPermission(blindPayload, 'presence-volunteers', 'call-cancelled', { callId: 'room1' })).toBe(true);
        // Blind cannot send with mismatched callId
        expect(validateRoleEventPermission(blindPayload, 'presence-volunteers', 'incoming-call', { callId: 'room2' })).toBe(false);

        // Volunteer CANNOT trigger incoming-call on presence channel
        expect(validateRoleEventPermission(volunteerPayload, 'presence-volunteers', 'incoming-call', { callId: 'room1' })).toBe(false);
        // Volunteer CAN trigger call-claimed
        expect(validateRoleEventPermission(volunteerPayload, 'presence-volunteers', 'call-claimed', { callId: 'room1' })).toBe(true);

        // Private call channel:
        // Blind can send offer, ice-candidate, call-ended
        expect(validateRoleEventPermission(blindPayload, 'private-call-room1', 'offer')).toBe(true);
        expect(validateRoleEventPermission(blindPayload, 'private-call-room1', 'ice-candidate')).toBe(true);
        expect(validateRoleEventPermission(blindPayload, 'private-call-room1', 'call-ended')).toBe(true);
        // Blind CANNOT send answer or call-accepted
        expect(validateRoleEventPermission(blindPayload, 'private-call-room1', 'answer')).toBe(false);
        expect(validateRoleEventPermission(blindPayload, 'private-call-room1', 'call-accepted')).toBe(false);

        // Volunteer can send call-accepted, answer, ice-candidate, call-ended
        expect(validateRoleEventPermission(volunteerPayload, 'private-call-room1', 'call-accepted')).toBe(true);
        expect(validateRoleEventPermission(volunteerPayload, 'private-call-room1', 'answer')).toBe(true);
        expect(validateRoleEventPermission(volunteerPayload, 'private-call-room1', 'ice-candidate')).toBe(true);
        expect(validateRoleEventPermission(volunteerPayload, 'private-call-room1', 'call-ended')).toBe(true);
        // Volunteer CANNOT send offer
        expect(validateRoleEventPermission(volunteerPayload, 'private-call-room1', 'offer')).toBe(false);
    });
});

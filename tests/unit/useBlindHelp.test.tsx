// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { sendEvent, subscribe, unsubscribe, getCallSession, createPeerConnection, closePeerConnection } = vi.hoisted(() => ({
    sendEvent: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    getCallSession: vi.fn(),
    createPeerConnection: vi.fn(),
    closePeerConnection: vi.fn(),
}));

vi.mock('@/features/calling/client/signaling', () => ({ sendEvent, subscribe, unsubscribe }));
vi.mock('@/features/calling/client/sessionClient', () => ({ getCallSession }));
vi.mock('@/features/calling/client/peerConnection', () => ({ createPeerConnection, closePeerConnection }));

import { EVENTS } from '@/features/calling/constants';
import { useBlindHelp } from '@/features/calling/hooks/useBlindHelp';

describe('useBlindHelp connection timeout', () => {
    const handlers: Record<string, (data?: any) => void> = {};
    let pc: any;
    let onConnectionStateChange: ((state: string) => void) | undefined;

    beforeEach(() => {
        vi.useFakeTimers();
        vi.clearAllMocks();
        Object.keys(handlers).forEach((key) => delete handlers[key]);
        const track = { stop: vi.fn() };
        Object.defineProperty(navigator, 'mediaDevices', {
            configurable: true,
            value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [track] }) },
        });
        getCallSession.mockResolvedValue({ token: 'token', callId: 'call-1' });
        subscribe.mockReturnValue({ bind: (event: string, handler: (data?: any) => void) => { handlers[event] = handler; } });
        pc = {
            createDataChannel: vi.fn(() => ({})),
            createOffer: vi.fn().mockResolvedValue({ type: 'offer', sdp: 'x' }),
            setLocalDescription: vi.fn().mockResolvedValue(undefined),
            localDescription: { type: 'offer', sdp: 'x' },
        };
        createPeerConnection.mockImplementation(async (options: any) => {
            onConnectionStateChange = options.onConnectionStateChange;
            return { pc };
        });
    });
    afterEach(() => vi.useRealTimers());

    const startAndAccept = async () => {
        const hook = renderHook(() => useBlindHelp());
        await act(async () => { await hook.result.current.startCall(); });
        expect(hook.result.current.status).toBe('calling');
        await act(async () => { await handlers[EVENTS.CALL_ACCEPTED]({ volunteerId: 'volunteer-1' }); });
        expect(hook.result.current.status).toBe('connecting');
        return hook;
    };

    it('gives up on a call stuck in "connecting" so the tabs are unlocked and the user can retry', async () => {
        const { result } = await startAndAccept();

        await act(async () => { await vi.advanceTimersByTimeAsync(29000); });
        expect(result.current.status).toBe('connecting');

        await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
        expect(result.current.status).toBe('error');
        expect(result.current.error).toContain('เชื่อมต่อ');
    });

    it('does not time out once the media connection comes up', async () => {
        const { result } = await startAndAccept();

        await act(async () => { onConnectionStateChange?.('connected'); });
        expect(result.current.status).toBe('connected');

        await act(async () => { await vi.advanceTimersByTimeAsync(60000); });
        expect(result.current.status).toBe('connected');
    });

    it('reports an error instead of staying silent when the answer cannot be applied', async () => {
        const { result } = await startAndAccept();
        pc.setRemoteDescription = vi.fn().mockRejectedValue(new Error('bad sdp'));
        vi.spyOn(console, 'error').mockImplementation(() => {});

        await act(async () => { await handlers[EVENTS.ANSWER]({ sdp: { type: 'answer', sdp: 'y' }, from: 'volunteer-1' }); });

        expect(result.current.status).toBe('error');
    });
});

// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mediaSessionManager } from '@/shared/media/mediaSessionManager';

describe('mediaSessionManager', () => {
    let mockVideoTrack: any;
    let mockAudioTrack: any;
    let mockCameraStream: any;
    let mockMicStream: any;
    let mockCallStream: any;
    let getUserMedia: any;

    beforeEach(() => {
        mockVideoTrack = { stop: vi.fn(), readyState: 'live', muted: false };
        mockAudioTrack = { stop: vi.fn(), readyState: 'live', muted: false };

        mockCameraStream = {
            getTracks: () => [mockVideoTrack],
            getVideoTracks: () => [mockVideoTrack],
        };

        mockMicStream = {
            getTracks: () => [mockAudioTrack],
            getAudioTracks: () => [mockAudioTrack],
        };

        mockCallStream = {
            getTracks: () => [mockVideoTrack, mockAudioTrack],
            getVideoTracks: () => [mockVideoTrack],
            getAudioTracks: () => [mockAudioTrack],
        };

        getUserMedia = vi.fn().mockImplementation((constraints: MediaStreamConstraints) => {
            if (constraints.video && constraints.audio) {
                return Promise.resolve(mockCallStream);
            }
            if (constraints.video) {
                return Promise.resolve(mockCameraStream);
            }
            if (constraints.audio) {
                return Promise.resolve(mockMicStream);
            }
            return Promise.resolve(mockCameraStream);
        });

        Object.defineProperty(navigator, 'mediaDevices', {
            configurable: true,
            value: { getUserMedia },
        });
    });

    afterEach(async () => {
        mediaSessionManager.releaseCamera('assistant', true);
        await mediaSessionManager.endVoiceCapture();
        await mediaSessionManager.endCall();
        vi.clearAllMocks();
    });

    it('acquires camera stream and reuses the same live stream across different owners', async () => {
        const stream1 = await mediaSessionManager.acquireCamera('assistant');
        expect(stream1).toBe(mockCameraStream);
        expect(mediaSessionManager.getOwner()).toBe('assistant');
        expect(mediaSessionManager.getMode()).toBe('camera');
        expect(getUserMedia).toHaveBeenCalledTimes(1);

        // Switch to currency mode: should reuse stream without calling getUserMedia again
        const stream2 = await mediaSessionManager.acquireCamera('currency');
        expect(stream2).toBe(mockCameraStream);
        expect(mediaSessionManager.getOwner()).toBe('currency');
        expect(getUserMedia).toHaveBeenCalledTimes(1);
    });

    it('force release stops camera tracks and resets owner and mode', async () => {
        await mediaSessionManager.acquireCamera('assistant');
        mediaSessionManager.releaseCamera('assistant', true);

        expect(mockVideoTrack.stop).toHaveBeenCalled();
        expect(mediaSessionManager.getCameraStream()).toBeNull();
        expect(mediaSessionManager.getOwner()).toBeNull();
        expect(mediaSessionManager.getMode()).toBe('idle');
    });

    it('beginVoiceCapture acquires mic and endVoiceCapture releases mic tracks', async () => {
        const micStream = await mediaSessionManager.beginVoiceCapture();
        expect(micStream).toBe(mockMicStream);
        expect(mediaSessionManager.getMode()).toBe('voice');

        await mediaSessionManager.endVoiceCapture();
        expect(mockAudioTrack.stop).toHaveBeenCalled();
        expect(mediaSessionManager.getMode()).toBe('idle');
    });

    it('beginCall stops existing camera and acquires call stream, endCall releases all call tracks', async () => {
        // Start assistant camera first
        await mediaSessionManager.acquireCamera('assistant');
        expect(mediaSessionManager.getMode()).toBe('camera');

        // Volunteer call starts
        const callStream = await mediaSessionManager.beginCall();
        expect(callStream).toBe(mockCallStream);
        expect(mockVideoTrack.stop).toHaveBeenCalled(); // Assistant camera stopped
        expect(mediaSessionManager.getOwner()).toBe('call');
        expect(mediaSessionManager.getMode()).toBe('call');

        // End call
        await mediaSessionManager.endCall();
        expect(mediaSessionManager.getOwner()).toBeNull();
        expect(mediaSessionManager.getMode()).toBe('idle');
    });

    it('waitUntilReady resolves when transition is complete', async () => {
        const readyPromise = mediaSessionManager.waitUntilReady();
        await expect(readyPromise).resolves.toBeUndefined();
    });
});

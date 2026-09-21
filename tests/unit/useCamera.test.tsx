// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useCamera } from '@/features/blind-assistant/hooks/useCamera';

const originalMediaDevices = navigator.mediaDevices;

afterEach(() => {
    Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: originalMediaDevices,
    });
});

describe('useCamera', () => {
    it('requests a 16:9 rear-camera stream for the assistant preview', async () => {
        const getUserMedia = vi.fn().mockResolvedValue({ getTracks: () => [] });
        Object.defineProperty(navigator, 'mediaDevices', {
            configurable: true,
            value: { getUserMedia },
        });
        const { result } = renderHook(() => useCamera());

        await act(async () => {
            await result.current.initCamera();
        });

        expect(getUserMedia).toHaveBeenCalledWith({
            video: {
                facingMode: 'environment',
                width: { ideal: 1280 },
                height: { ideal: 720 },
                aspectRatio: { ideal: 16 / 9 },
            },
        });
    });

    it('stops a stream that resolves after the camera has been stopped', async () => {
        let resolveStream: ((stream: MediaStream) => void) | undefined;
        const getUserMedia = vi.fn().mockImplementation(() => new Promise<MediaStream>((resolve) => {
            resolveStream = resolve;
        }));
        const stop = vi.fn();
        const lateStream = { getTracks: () => [{ stop }] } as unknown as MediaStream;
        Object.defineProperty(navigator, 'mediaDevices', {
            configurable: true,
            value: { getUserMedia },
        });
        const { result } = renderHook(() => useCamera());

        let pendingInit: Promise<void>;
        act(() => {
            pendingInit = result.current.initCamera();
            result.current.stopCamera();
        });
        await act(async () => {
            resolveStream?.(lateStream);
            await pendingInit!;
        });

        expect(stop).toHaveBeenCalledOnce();
        expect(result.current.stream).toBeNull();
    });

    it('sets muted and playsinline properties on video and configures ambient audio session', async () => {
        const audioSession = { type: 'auto' };
        Object.defineProperty(navigator, 'audioSession', {
            configurable: true,
            value: audioSession,
        });

        const fakeStream = { getTracks: () => [{ stop: vi.fn() }] } as unknown as MediaStream;
        const getUserMedia = vi.fn().mockResolvedValue(fakeStream);
        Object.defineProperty(navigator, 'mediaDevices', {
            configurable: true,
            value: { getUserMedia },
        });

        const { result } = renderHook(() => useCamera());
        const fakeVideo = document.createElement('video');
        (result.current.videoRef as any).current = fakeVideo;

        await act(async () => {
            await result.current.initCamera();
        });

        expect(audioSession.type).toBe('ambient');
        expect(fakeVideo.muted).toBe(true);
        expect(fakeVideo.defaultMuted).toBe(true);
        expect(fakeVideo.volume).toBe(0);
        expect(fakeVideo.hasAttribute('playsinline')).toBe(true);
        expect(fakeVideo.hasAttribute('webkit-playsinline')).toBe(true);
    });
});


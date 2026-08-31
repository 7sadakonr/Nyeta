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
});

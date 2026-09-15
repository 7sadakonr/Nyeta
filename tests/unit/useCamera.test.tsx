// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useCamera } from '@/features/blind-assistant/hooks/useCamera';
import { mediaSessionManager } from '@/shared/media/mediaSessionManager';

const originalMediaDevices = navigator.mediaDevices;

afterEach(() => {
    Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: originalMediaDevices,
    });
    mediaSessionManager.releaseCamera('assistant', true);
});

describe('useCamera', () => {
    it('requests a 16:9 rear-camera stream for the assistant preview', async () => {
        const getUserMedia = vi.fn().mockResolvedValue({
            getTracks: () => [{ stop: vi.fn(), readyState: 'live', muted: false }],
            getVideoTracks: () => [{ stop: vi.fn(), readyState: 'live', muted: false }],
        });
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
        expect(result.current.stream).not.toBeNull();
    });

    it('reuses existing live camera stream across repeated initCamera calls', async () => {
        const stopTrack = vi.fn();
        const activeTrack = { stop: stopTrack, readyState: 'live', muted: false };
        const activeStream = {
            getTracks: () => [activeTrack],
            getVideoTracks: () => [activeTrack],
        } as unknown as MediaStream;

        const getUserMedia = vi.fn().mockResolvedValue(activeStream);
        Object.defineProperty(navigator, 'mediaDevices', {
            configurable: true,
            value: { getUserMedia },
        });

        const { result } = renderHook(() => useCamera());
        await act(async () => {
            await result.current.initCamera('assistant');
        });

        expect(getUserMedia).toHaveBeenCalledTimes(1);

        // Second initCamera (e.g. switching to currency mode) should reuse the live stream
        await act(async () => {
            await result.current.initCamera('currency');
        });

        expect(getUserMedia).toHaveBeenCalledTimes(1); // Not called again!
        expect(result.current.stream).toBe(activeStream);
    });

    it('stopCamera releases the stream and resets state', async () => {
        const stopTrack = vi.fn();
        const activeTrack = { stop: stopTrack, readyState: 'live', muted: false };
        const activeStream = {
            getTracks: () => [activeTrack],
            getVideoTracks: () => [activeTrack],
        } as unknown as MediaStream;

        const getUserMedia = vi.fn().mockResolvedValue(activeStream);
        Object.defineProperty(navigator, 'mediaDevices', {
            configurable: true,
            value: { getUserMedia },
        });

        const { result } = renderHook(() => useCamera());
        await act(async () => {
            await result.current.initCamera();
        });

        act(() => {
            result.current.stopCamera();
        });

        expect(stopTrack).toHaveBeenCalled();
        expect(result.current.stream).toBeNull();
        expect(result.current.isReady).toBe(false);
    });
});

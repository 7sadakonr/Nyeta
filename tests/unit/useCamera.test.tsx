// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useCamera } from '@/features/blind-assistant/hooks/useCamera';

const originalMediaDevices = navigator.mediaDevices;
const originalWakeLock = (navigator as Navigator & { wakeLock?: unknown }).wakeLock;

afterEach(() => {
    Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: originalMediaDevices,
    });
    Object.defineProperty(navigator, 'wakeLock', {
        configurable: true,
        value: originalWakeLock,
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

    it('clears readiness when the browser ends the camera track', async () => {
        let onEnded: (() => void) | null = null;
        const track = {
            stop: vi.fn(),
            addEventListener: vi.fn((event: string, listener: () => void) => {
                if (event === 'ended') onEnded = listener;
            }),
            removeEventListener: vi.fn(),
        };
        const stream = { getTracks: () => [track] } as unknown as MediaStream;
        const getUserMedia = vi.fn().mockResolvedValue(stream);
        Object.defineProperty(navigator, 'mediaDevices', {
            configurable: true,
            value: { getUserMedia },
        });
        const { result } = renderHook(() => useCamera());

        await act(async () => {
            await result.current.initCamera();
        });
        expect(result.current.stream).toBe(stream);

        act(() => onEnded?.());

        expect(result.current.stream).toBeNull();
        expect(result.current.isReady).toBe(false);
    });

    it('releases a wake lock that resolves after the camera track has ended', async () => {
        let onEnded: (() => void) | null = null;
        let resolveWakeLock: ((sentinel: { addEventListener: ReturnType<typeof vi.fn>; release: ReturnType<typeof vi.fn> }) => void) | null = null;
        const release = vi.fn(() => Promise.resolve());
        const sentinel = { addEventListener: vi.fn(), release };
        const track = {
            stop: vi.fn(),
            addEventListener: vi.fn((event: string, listener: () => void) => {
                if (event === 'ended') onEnded = listener;
            }),
            removeEventListener: vi.fn(),
        };
        const stream = { getTracks: () => [track] } as unknown as MediaStream;
        Object.defineProperty(navigator, 'mediaDevices', {
            configurable: true,
            value: { getUserMedia: vi.fn().mockResolvedValue(stream) },
        });
        Object.defineProperty(navigator, 'wakeLock', {
            configurable: true,
            value: { request: vi.fn(() => new Promise(resolve => { resolveWakeLock = resolve; })) },
        });
        const { result } = renderHook(() => useCamera());

        await act(async () => {
            await result.current.initCamera();
        });
        act(() => onEnded?.());
        await act(async () => resolveWakeLock?.(sentinel));

        expect(release).toHaveBeenCalledOnce();
    });
});

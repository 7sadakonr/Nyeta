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
    const fakeStream = () => {
        const listeners: Record<string, Array<() => void>> = {};
        const track = {
            readyState: 'live',
            stop: vi.fn(),
            applyConstraints: vi.fn().mockResolvedValue(undefined),
            addEventListener: (type: string, fn: () => void) => { (listeners[type] ||= []).push(fn); },
            removeEventListener: (type: string, fn: () => void) => { listeners[type] = (listeners[type] || []).filter((l) => l !== fn); },
        };
        const stream = { getTracks: () => [track], getVideoTracks: () => [track] } as unknown as MediaStream;
        return { stream, track, emit: (type: string) => (listeners[type] || []).forEach((fn) => fn()) };
    };

    const mockDevices = (streams: MediaStream[]) => {
        const getUserMedia = vi.fn();
        streams.forEach((s) => getUserMedia.mockResolvedValueOnce(s));
        Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
        return getUserMedia;
    };

    it('reports ready only once the video is actually playing', async () => {
        const { stream } = fakeStream();
        mockDevices([stream]);
        const video = document.createElement('video');
        const { result } = renderHook(() => useCamera());
        result.current.videoRef.current = video;

        await act(async () => { await result.current.initCamera(); });
        expect(result.current.isReady).toBe(false);

        await act(async () => { video.dispatchEvent(new Event('playing')); });
        expect(result.current.isReady).toBe(true);
    });

    it('restarts the camera when the track ends while the app is in use', async () => {
        const first = fakeStream();
        const second = fakeStream();
        const getUserMedia = mockDevices([first.stream, second.stream]);
        const video = document.createElement('video');
        const { result } = renderHook(() => useCamera());
        result.current.videoRef.current = video;
        await act(async () => { await result.current.initCamera(); });
        await act(async () => { video.dispatchEvent(new Event('playing')); });

        await act(async () => { first.emit('ended'); });

        expect(getUserMedia).toHaveBeenCalledTimes(2);
        expect(result.current.isReady).toBe(false);
    });

    it('gives up and reports an error when the stream keeps dying', async () => {
        const streams = [fakeStream(), fakeStream(), fakeStream()];
        const getUserMedia = mockDevices(streams.map((s) => s.stream));
        const video = document.createElement('video');
        const { result } = renderHook(() => useCamera());
        result.current.videoRef.current = video;
        await act(async () => { await result.current.initCamera(); });

        for (const s of streams) {
            await act(async () => { s.emit('ended'); });
        }

        expect(getUserMedia).toHaveBeenCalledTimes(3);
        expect(result.current.error).toBeTruthy();
    });

    it('restarts a dead stream and resumes a paused video when the app returns to the foreground', async () => {
        const first = fakeStream();
        const second = fakeStream();
        const getUserMedia = mockDevices([first.stream, second.stream]);
        const video = document.createElement('video');
        const play = vi.spyOn(video, 'play').mockResolvedValue(undefined);
        const { result } = renderHook(() => useCamera());
        result.current.videoRef.current = video;
        await act(async () => { await result.current.initCamera(); });

        await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
        expect(getUserMedia).toHaveBeenCalledTimes(1);
        expect(play).toHaveBeenCalled();

        first.track.readyState = 'ended';
        await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
        expect(getUserMedia).toHaveBeenCalledTimes(2);
    });

    it('retryCamera clears the error and asks again', async () => {
        const getUserMedia = vi.fn()
            .mockRejectedValueOnce(new Error('denied'))
            .mockResolvedValueOnce(fakeStream().stream);
        Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
        const { result } = renderHook(() => useCamera());

        await act(async () => { await result.current.initCamera(); });
        expect(result.current.error).toBeTruthy();

        await act(async () => { await result.current.retryCamera(); });
        expect(result.current.error).toBeNull();
        expect(result.current.stream).not.toBeNull();
    });

    it('switches resolution on the running stream and uses it for the next request', async () => {
        const { stream, track } = fakeStream();
        const getUserMedia = mockDevices([stream, fakeStream().stream]);
        const { result } = renderHook(() => useCamera());
        await act(async () => { await result.current.initCamera(); });

        act(() => result.current.setHighResolution(true));
        expect(track.applyConstraints).toHaveBeenCalledWith({ width: { ideal: 1920 }, height: { ideal: 1080 } });

        await act(async () => { await result.current.initCamera(); });
        expect(getUserMedia.mock.calls[1][0].video.width).toEqual({ ideal: 1920 });
    });
    describe('stalled preview watchdog', () => {
        afterEach(() => vi.useRealTimers());

        it('retries play() and then restarts when the stream never starts playing', async () => {
            vi.useFakeTimers();
            const first = fakeStream();
            const second = fakeStream();
            const getUserMedia = mockDevices([first.stream, second.stream]);
            const video = document.createElement('video');
            const play = vi.spyOn(video, 'play').mockResolvedValue(undefined);
            const { result } = renderHook(() => useCamera());
            result.current.videoRef.current = video;
            await act(async () => { await result.current.initCamera(); });
            play.mockClear();

            await act(async () => { await vi.advanceTimersByTimeAsync(4100); });
            expect(play).toHaveBeenCalled();
            expect(getUserMedia).toHaveBeenCalledTimes(1);

            await act(async () => { await vi.advanceTimersByTimeAsync(3100); });
            expect(getUserMedia).toHaveBeenCalledTimes(2);
        });

        it('does nothing once the video is playing', async () => {
            vi.useFakeTimers();
            const getUserMedia = mockDevices([fakeStream().stream]);
            const video = document.createElement('video');
            vi.spyOn(video, 'play').mockResolvedValue(undefined);
            const { result } = renderHook(() => useCamera());
            result.current.videoRef.current = video;
            await act(async () => { await result.current.initCamera(); });

            await act(async () => { video.dispatchEvent(new Event('playing')); });
            await act(async () => { await vi.advanceTimersByTimeAsync(20000); });

            expect(getUserMedia).toHaveBeenCalledTimes(1);
            expect(result.current.isReady).toBe(true);
        });

        it('reports an error (so the retry button shows) after repeated stalls', async () => {
            vi.useFakeTimers();
            const getUserMedia = mockDevices([fakeStream().stream, fakeStream().stream, fakeStream().stream]);
            const video = document.createElement('video');
            vi.spyOn(video, 'play').mockResolvedValue(undefined);
            vi.spyOn(console, 'warn').mockImplementation(() => {});
            const { result } = renderHook(() => useCamera());
            result.current.videoRef.current = video;
            await act(async () => { await result.current.initCamera(); });

            for (let attempt = 0; attempt < 3; attempt += 1) {
                await act(async () => { await vi.advanceTimersByTimeAsync(7200); });
            }

            expect(getUserMedia).toHaveBeenCalledTimes(3);
            expect(result.current.error).toBeTruthy();
        });
    });
});

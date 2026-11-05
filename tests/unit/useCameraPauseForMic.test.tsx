// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCameraPauseForMic } from '@/features/blind-assistant/hooks/useCameraPauseForMic';

describe('useCameraPauseForMic', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    const setup = (initial: { isListening: boolean; isReady: boolean }) => {
        const stopCamera = vi.fn();
        const initCamera = vi.fn().mockResolvedValue(undefined);
        const hook = renderHook((props: { isListening: boolean; isReady: boolean }) => useCameraPauseForMic({ ...props, stopCamera, initCamera }), { initialProps: initial });
        return { ...hook, stopCamera, initCamera };
    };

    it('releases the camera before listening and brings it back when listening ends', () => {
        const { result, rerender, stopCamera, initCamera } = setup({ isListening: false, isReady: true });

        act(() => result.current.pauseForListening());
        expect(stopCamera).toHaveBeenCalledOnce();
        expect(initCamera).not.toHaveBeenCalled();

        rerender({ isListening: true, isReady: false });
        expect(initCamera).not.toHaveBeenCalled();

        rerender({ isListening: false, isReady: false });
        expect(initCamera).toHaveBeenCalledOnce();
    });

    it('restores the camera even if listening never started (unsupported or refused at once)', () => {
        const { result, initCamera } = setup({ isListening: false, isReady: true });

        act(() => result.current.pauseForListening());
        act(() => { vi.advanceTimersByTime(1600); });

        expect(initCamera).toHaveBeenCalledOnce();
    });

    it('does not restart the camera a second time while listening is genuinely running', () => {
        const { result, rerender, initCamera } = setup({ isListening: false, isReady: true });

        act(() => result.current.pauseForListening());
        rerender({ isListening: true, isReady: false });
        act(() => { vi.advanceTimersByTime(5000); });

        expect(initCamera).not.toHaveBeenCalled();
    });

    it('waits for the camera to come back, and gives up after the timeout', async () => {
        const { result, rerender } = setup({ isListening: false, isReady: false });

        let ready: boolean | undefined;
        const waiting = result.current.waitUntilReady(1000).then((value) => { ready = value; });
        await act(async () => { await vi.advanceTimersByTimeAsync(300); });
        expect(ready).toBeUndefined();

        rerender({ isListening: false, isReady: true });
        await act(async () => { await vi.advanceTimersByTimeAsync(200); await waiting; });
        expect(ready).toBe(true);

        rerender({ isListening: false, isReady: false });
        let timedOut: boolean | undefined;
        const second = result.current.waitUntilReady(500).then((value) => { timedOut = value; });
        await act(async () => { await vi.advanceTimersByTimeAsync(700); await second; });
        expect(timedOut).toBe(false);
    });
});

// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    analyze: vi.fn(),
    detect: vi.fn(),
    speak: vi.fn(),
    stopByOwner: vi.fn(),
}));

vi.mock('@/features/blind-assistant/client/currencyGemini', () => ({
    analyzeCurrencyFrame: mocks.analyze,
    detectCurrencyWithGemini: mocks.detect,
    hasCurrencySceneChanged: (previous: Uint8Array | null, current: Uint8Array | null) => !previous || previous.some((value, index) => value !== current![index]),
}));
vi.mock('@/shared/accessibility/speechManager', () => ({
    default: { speak: mocks.speak, stopByOwner: mocks.stopByOwner },
    Priority: { HIGH: 'high' },
}));

import { useCurrencyScanner } from '@/features/blind-assistant/hooks/useCurrencyScanner';

const notFound = { result: { status: 'not_found' as const }, rawText: '' };
const detected = (total = 100) => ({
    result: { status: 'detected' as const, total, signature: `note-${total}-1`, items: [{ type: 'note' as const, value: total, quantity: 1, locations: [] }] },
    rawText: '',
});

function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>(next => { resolve = next; });
    return { promise, resolve };
}

describe('useCurrencyScanner auto monitoring', () => {
    let frameValue = 40;
    const feedback = vi.fn();
    const videoRef = { current: document.createElement('video') };

    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
        frameValue = 40;
        feedback.mockReset();
        mocks.analyze.mockReset().mockImplementation(() => ({ quality: 'usable', fingerprint: new Uint8Array(192).fill(frameValue) }));
        mocks.detect.mockReset().mockResolvedValue(notFound);
        mocks.speak.mockReset();
        mocks.stopByOwner.mockReset();
        Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('starts automatically once ready, stays quiet on not_found, and stops when disabled', async () => {
        const { result, rerender, unmount } = renderHook(({ enabled, ready }) => useCurrencyScanner(videoRef, enabled, ready, feedback), { initialProps: { enabled: true, ready: true } });
        await act(async () => { await Promise.resolve(); });

        expect(result.current.currencyMonitoring).toBe(true);
        expect(mocks.detect).toHaveBeenCalledTimes(1);
        expect(mocks.speak).toHaveBeenCalledWith('โหมดดูสกุลเงินพร้อมแล้ว นำธนบัตรเข้ากล้องได้เลย', expect.any(Object));
        expect(mocks.speak).not.toHaveBeenCalledWith(expect.stringContaining('ไม่พบเงิน'), expect.anything());

        rerender({ enabled: false, ready: true });
        await act(async () => { await vi.advanceTimersByTimeAsync(6000); });
        expect(result.current.currencyMonitoring).toBe(false);
        expect(mocks.detect).toHaveBeenCalledTimes(1);
        unmount();
    });

    it('shares one lock between auto and manual scans', async () => {
        const pending = deferred<typeof notFound>();
        mocks.detect.mockReturnValueOnce(pending.promise);
        const { result } = renderHook(() => useCurrencyScanner(videoRef, true, true, feedback));
        await act(async () => { await Promise.resolve(); });
        await act(async () => { await result.current.captureCurrency(); await vi.advanceTimersByTimeAsync(1000); });
        expect(mocks.detect).toHaveBeenCalledTimes(1);

        await act(async () => { pending.resolve(notFound); await Promise.resolve(); });
        await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
        expect(mocks.detect).toHaveBeenCalledTimes(2);
    });

    it('skips unchanged scenes until the fallback probe', async () => {
        const { unmount } = renderHook(() => useCurrencyScanner(videoRef, true, true, feedback));
        await act(async () => { await Promise.resolve(); await vi.advanceTimersByTimeAsync(4800); });
        expect(mocks.detect).toHaveBeenCalledTimes(1);
        await act(async () => { await vi.advanceTimersByTimeAsync(400); });
        expect(mocks.detect).toHaveBeenCalledTimes(2);
        unmount();
    });

    it('counts a detection once, ignores it while waiting for removal, then re-arms after two empty checks', async () => {
        mocks.detect.mockResolvedValueOnce(detected(100)).mockResolvedValueOnce(detected(100)).mockResolvedValueOnce(notFound).mockResolvedValueOnce(notFound);
        const { result } = renderHook(() => useCurrencyScanner(videoRef, true, true, feedback));
        await act(async () => { await Promise.resolve(); });
        expect(result.current.totalAmount).toBe(100);
        expect(result.current.scannedHistory).toHaveLength(1);

        frameValue = 90;
        await act(async () => { await vi.advanceTimersByTimeAsync(3400); });
        expect(result.current.totalAmount).toBe(100);
        expect(result.current.scannedHistory).toHaveLength(1);

        frameValue = 140;
        await act(async () => { await vi.advanceTimersByTimeAsync(3400); });
        await act(async () => { await vi.advanceTimersByTimeAsync(3400); });
        expect(result.current.currencyMonitoring).toBe(true);
        expect(result.current.currencyResult).toBeNull();
        expect(mocks.speak).toHaveBeenCalledWith('พร้อมสแกนใบถัดไป', expect.any(Object));
    });

    it('pauses for a hidden tab and ignores a stale response after unmount', async () => {
        const pending = deferred<ReturnType<typeof detected>>();
        mocks.detect.mockReturnValueOnce(pending.promise);
        const { result, unmount } = renderHook(() => useCurrencyScanner(videoRef, true, true, feedback));
        await act(async () => { await Promise.resolve(); });

        Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
        await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
        expect(result.current.currencyMonitoring).toBe(false);
        unmount();

        await act(async () => { pending.resolve(detected(100)); await Promise.resolve(); await vi.advanceTimersByTimeAsync(6000); });
        expect(feedback).not.toHaveBeenCalledWith('success');
    });
});
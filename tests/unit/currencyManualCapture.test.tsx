// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { analyze, detect } = vi.hoisted(() => ({ analyze: vi.fn(), detect: vi.fn() }));

vi.mock('@/features/blind-assistant/client/currencyGemini', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/features/blind-assistant/client/currencyGemini')>()),
    analyzeCurrencyFrame: analyze,
    detectCurrencyWithGemini: detect,
}));
vi.mock('@/shared/accessibility/speechController', () => ({
    speechController: { speak: vi.fn(), stop: vi.fn() },
}));

import { GeminiRequestError } from '@/features/blind-assistant/client/geminiVision';
import { useCurrencyScanner } from '@/features/blind-assistant/hooks/useCurrencyScanner';

const detected = (value: number) => ({
    result: {
        status: 'detected' as const,
        total: value,
        signature: `note-${value}-1`,
        items: [{ type: 'note' as const, value, quantity: 1, locations: ['center' as const] }],
    },
    rawText: '',
});

describe('manual currency capture', () => {
    let quality: 'usable' | 'invalid' | 'blocked';
    let fingerprint: Uint8Array;
    const feedback = vi.fn();

    // The video ref must be stable across renders, as it is in the app; a new object per render would restart the scanner.
    const setup = () => {
        const videoRef = { current: document.createElement('video') };
        return renderHook(() => useCurrencyScanner(videoRef, true, true, true, feedback));
    };

    beforeEach(() => {
        vi.clearAllMocks();
        // Fake timers keep the automatic interval idle unless a test advances it.
        vi.useFakeTimers();
        // Keep auto-scan idle on mount so only the manual button drives requests.
        quality = 'invalid';
        fingerprint = new Uint8Array(Array.from({ length: 16 }, () => 10));
        analyze.mockImplementation(() => ({ quality, fingerprint: quality === 'invalid' ? null : fingerprint }));
    });

    afterEach(() => vi.useRealTimers());

    it('detects currency when the button is pressed', async () => {
        const { result } = setup();
        quality = 'usable';
        detect.mockResolvedValueOnce(detected(100));

        await act(async () => { await result.current.captureCurrency(); });

        expect(result.current.currencyResult?.total).toBe(100);
        expect(result.current.totalAmount).toBe(100);
        expect(feedback).toHaveBeenCalledWith('capture');
        expect(feedback).toHaveBeenCalledWith('success');
    });

    it('can rescan while the previous note is still in view (waiting for removal)', async () => {
        const { result } = setup();
        quality = 'usable';
        detect.mockResolvedValueOnce(detected(100));
        await act(async () => { await result.current.captureCurrency(); });
        expect(result.current.currencyResult?.total).toBe(100);

        detect.mockResolvedValueOnce(detected(50));
        await act(async () => { await result.current.captureCurrency(); });

        expect(detect).toHaveBeenCalledTimes(2);
        expect(result.current.currencyResult?.total).toBe(50);
    });

    it('reports a failed capture instead of staying silent', async () => {
        const { result } = setup();
        quality = 'usable';
        detect.mockResolvedValueOnce({ result: { status: 'not_found' }, rawText: '' });

        await act(async () => { await result.current.captureCurrency(); });

        expect(result.current.currencyResult).toBeNull();
        expect(result.current.captureMessage).toContain('ไม่พบ');
        expect(feedback).toHaveBeenCalledWith('error');
    });

    it('reports a blocked camera and a network failure, and recovers on the next press', async () => {
        const { result } = setup();
        quality = 'blocked';
        await act(async () => { await result.current.captureCurrency(); });
        expect(result.current.captureMessage).toContain('กล้องโดนบัง');
        expect(detect).not.toHaveBeenCalled();

        quality = 'usable';
        detect.mockRejectedValueOnce(new GeminiRequestError('offline', 'offline'));
        await act(async () => { await result.current.captureCurrency(); });
        expect(result.current.captureMessage).toContain('อินเทอร์เน็ต');

        // A busy model must not be reported as an internet problem.
        detect.mockRejectedValueOnce(new GeminiRequestError('busy', 'high demand', 503));
        await act(async () => { await result.current.captureCurrency(); });
        expect(result.current.captureMessage).toContain('ยุ่ง');
        expect(result.current.captureMessage).not.toContain('อินเทอร์เน็ต');

        // A failed attempt must not lock the button behind the auto-scan backoff.
        detect.mockResolvedValueOnce(detected(20));
        await act(async () => { await result.current.captureCurrency(); });
        expect(result.current.currencyResult?.total).toBe(20);
        expect(result.current.captureMessage).toBe('');
    });
    it('reports a different note placed in view without waiting for the old one to be removed', async () => {
        const { result } = setup();
        quality = 'usable';
        detect.mockResolvedValueOnce(detected(100));
        await act(async () => { await result.current.captureCurrency(); });
        expect(result.current.currencyResult?.total).toBe(100);

        // The scene changes (a new note), holds still, and the automatic scan picks it up.
        fingerprint = new Uint8Array(Array.from({ length: 16 }, () => 200));
        detect.mockResolvedValueOnce(detected(500));
        await act(async () => { await vi.advanceTimersByTimeAsync(2500); });

        expect(result.current.currencyResult?.total).toBe(500);
    });

    it('re-arms for the next note as soon as the scene changed and no currency is left', async () => {
        const { result } = setup();
        quality = 'usable';
        detect.mockResolvedValueOnce(detected(100));
        await act(async () => { await result.current.captureCurrency(); });

        fingerprint = new Uint8Array(Array.from({ length: 16 }, () => 200));
        detect.mockResolvedValueOnce({ result: { status: 'not_found' }, rawText: '' });
        await act(async () => { await vi.advanceTimersByTimeAsync(2500); });

        expect(result.current.currencyResult).toBeNull();
        expect(result.current.currencyHint).toBe('พร้อมสแกนใบถัดไป');
    });

    it('waits for the scene to settle before an automatic probe', async () => {
        const { result } = setup();
        quality = 'usable';
        detect.mockResolvedValue(detected(100));
        // A scene that keeps changing every frame never settles, so no request is made.
        let tick = 0;
        analyze.mockImplementation(() => {
            const value = tick++ % 2 ? 10 : 200;
            return { quality: 'usable', fingerprint: new Uint8Array(Array.from({ length: 16 }, () => value)) };
        });

        await act(async () => { await vi.advanceTimersByTimeAsync(3000); });

        expect(detect).not.toHaveBeenCalled();
        expect(result.current.currencyResult).toBeNull();
    });
});

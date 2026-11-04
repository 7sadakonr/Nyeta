// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { analyze, detect } = vi.hoisted(() => ({ analyze: vi.fn(), detect: vi.fn() }));

vi.mock('@/features/blind-assistant/client/currencyGemini', () => ({
    analyzeCurrencyFrame: analyze,
    detectCurrencyWithGemini: detect,
    hasCurrencySceneChanged: () => false,
}));
vi.mock('@/shared/accessibility/speechController', () => ({
    speechController: { speak: vi.fn(), stop: vi.fn() },
}));

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
    const feedback = vi.fn();

    const setup = () => renderHook(() => useCurrencyScanner(
        { current: document.createElement('video') },
        true,
        true,
        true,
        feedback,
    ));

    beforeEach(() => {
        vi.clearAllMocks();
        // Keep auto-scan idle on mount so only the manual button drives requests.
        quality = 'invalid';
        analyze.mockImplementation(() => ({ quality, fingerprint: quality === 'invalid' ? null : new Uint8Array([1, 2, 3]) }));
    });

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
        detect.mockRejectedValueOnce(new Error('offline'));
        await act(async () => { await result.current.captureCurrency(); });
        expect(result.current.captureMessage).toContain('เครือข่าย');

        // A failed attempt must not lock the button behind the auto-scan backoff.
        detect.mockResolvedValueOnce(detected(20));
        await act(async () => { await result.current.captureCurrency(); });
        expect(result.current.currencyResult?.total).toBe(20);
        expect(result.current.captureMessage).toBe('');
    });
});

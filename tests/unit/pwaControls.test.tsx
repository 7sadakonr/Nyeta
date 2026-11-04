// @vitest-environment jsdom

import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { speak } = vi.hoisted(() => ({ speak: vi.fn() }));

vi.mock('@/shared/accessibility/speechController', () => ({
    speechController: { speak },
}));

import PwaControls from '@/features/blind-app/PwaControls';

describe('PwaControls offline announcement', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
        window.matchMedia = vi.fn().mockImplementation((query: string) => ({ matches: false, media: query })) as unknown as typeof window.matchMedia;
    });
    afterEach(() => vi.restoreAllMocks());

    it('announces going offline exactly once and shows the banner as plain text', () => {
        const { queryByText, getByText } = render(<PwaControls callActive={false} audioReady />);
        expect(queryByText(/ออฟไลน์/)).toBeNull();

        act(() => {
            Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
            window.dispatchEvent(new Event('offline'));
        });

        const offlineCalls = speak.mock.calls.filter(([text]) => String(text).includes('ออฟไลน์'));
        expect(offlineCalls).toHaveLength(1);
        expect(offlineCalls[0][1]).toEqual({ channel: 'critical' });
        expect(getByText('ออฟไลน์ — AI และการโทรต้องใช้อินเทอร์เน็ต').getAttribute('aria-label')).toBeNull();
    });
});

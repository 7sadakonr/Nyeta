// @vitest-environment jsdom

import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { computeAppHeight, useAppViewportHeight } from '@/shared/hooks/useAppViewportHeight';

const setScreen = (height: number, width: number, innerHeight: number, innerWidth = width) => {
    Object.defineProperty(window, 'screen', { configurable: true, value: { height, width } });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: innerHeight });
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: innerWidth });
};

const setMedia = ({ standalone, portrait }: { standalone: boolean; portrait: boolean }) => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: query.includes('standalone') ? standalone : query.includes('portrait') ? portrait : false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
    })) as unknown as typeof window.matchMedia;
};

describe('app viewport height', () => {
    beforeEach(() => {
        Object.defineProperty(navigator, 'standalone', { configurable: true, value: false });
    });
    afterEach(() => document.documentElement.style.removeProperty('--nyeta-app-h'));

    it('uses the screen height for an installed app, so it does not depend on what the viewport reports', () => {
        setMedia({ standalone: true, portrait: true });
        // Right after launch iOS can report a viewport 34px short; the app height must still be the full screen.
        setScreen(852, 393, 818);
        expect(computeAppHeight()).toBe('852px');

        setScreen(852, 393, 852);
        expect(computeAppHeight()).toBe('852px');
    });

    it('uses the dynamic viewport height in a normal browser tab', () => {
        setMedia({ standalone: false, portrait: true });
        setScreen(852, 393, 700);
        expect(computeAppHeight()).toBe('100dvh');
    });

    it('falls back to the dynamic viewport when screen and viewport disagree a lot', () => {
        setMedia({ standalone: true, portrait: true });
        setScreen(1366, 1024, 640);
        expect(computeAppHeight()).toBe('100dvh');
    });

    it('treats the landscape height as the shorter screen side', () => {
        setMedia({ standalone: true, portrait: false });
        setScreen(852, 393, 393, 852);
        expect(computeAppHeight()).toBe('393px');
    });

    it('publishes the variable, refreshes it on pageshow and orientation change, and removes it on unmount', () => {
        setMedia({ standalone: true, portrait: true });
        setScreen(852, 393, 852);
        const { unmount } = renderHook(() => useAppViewportHeight());
        const root = document.documentElement;
        expect(root.style.getPropertyValue('--nyeta-app-h')).toBe('852px');

        setMedia({ standalone: false, portrait: true });
        window.dispatchEvent(new Event('pageshow'));
        expect(root.style.getPropertyValue('--nyeta-app-h')).toBe('100dvh');

        setMedia({ standalone: true, portrait: true });
        window.dispatchEvent(new Event('orientationchange'));
        expect(root.style.getPropertyValue('--nyeta-app-h')).toBe('852px');

        unmount();
        expect(root.style.getPropertyValue('--nyeta-app-h')).toBe('');
    });
});

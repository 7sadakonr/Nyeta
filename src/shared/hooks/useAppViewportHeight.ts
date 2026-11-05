'use client';

import { useEffect, useLayoutEffect } from 'react';

// iPhone standalone reports a layout/visual viewport that can be off by the home-indicator height depending on
// when it is read. If the screen and the reported viewport disagree by more than this, something unusual is going on
// (split view, floating window) and the dynamic viewport unit is the safer choice.
const VIEWPORT_ANOMALY_PX = 120;

const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

function isStandalone(): boolean {
    return Boolean(window.matchMedia?.('(display-mode: standalone)').matches)
        || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/**
 * The CSS height the app should occupy.
 *
 * Installed (standalone) app: the screen's own height, which never changes, instead of the viewport height that iOS
 * reports slightly differently after launch, rotation and returning from the background (that made the bottom tab
 * bar sit at different heights). Everywhere else: the dynamic viewport height.
 */
export function computeAppHeight(): string {
    if (!isStandalone()) return '100dvh';
    const portrait = window.matchMedia?.('(orientation: portrait)').matches ?? window.innerHeight >= window.innerWidth;
    const screenHeight = portrait
        ? Math.max(window.screen.height, window.screen.width)
        : Math.min(window.screen.height, window.screen.width);
    if (!screenHeight || Math.abs(screenHeight - window.innerHeight) > VIEWPORT_ANOMALY_PX) return '100dvh';
    return `${screenHeight}px`;
}

/** Publishes the app height as `--nyeta-app-h` on <html> and keeps it current. */
export function useAppViewportHeight(): void {
    useIsomorphicLayoutEffect(() => {
        const root = document.documentElement;
        const apply = () => root.style.setProperty('--nyeta-app-h', computeAppHeight());
        const onVisibility = () => {
            if (document.visibilityState === 'visible') apply();
        };

        apply();
        window.addEventListener('resize', apply);
        window.addEventListener('orientationchange', apply);
        window.addEventListener('pageshow', apply);
        document.addEventListener('visibilitychange', onVisibility);
        return () => {
            window.removeEventListener('resize', apply);
            window.removeEventListener('orientationchange', apply);
            window.removeEventListener('pageshow', apply);
            document.removeEventListener('visibilitychange', onVisibility);
            root.style.removeProperty('--nyeta-app-h');
        };
    }, []);
}

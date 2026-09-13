'use client';

import { useEffect } from 'react';

/**
 * useOrientationLock
 *
 * Attempts to lock the screen orientation to portrait using the Screen Orientation API
 * when available on supported mobile platforms.
 */
export function useOrientationLock(): void {
    useEffect(() => {
        const lockPortrait = async () => {
            if (typeof window === 'undefined' || typeof screen === 'undefined') return;
            const orientation = screen.orientation as any;
            if (orientation && typeof orientation.lock === 'function') {
                try {
                    await orientation.lock('portrait');
                } catch {
                    // Browser may deny orientation lock if not fullscreen or unsupported
                }
            }
        };

        void lockPortrait();

        // Also attempt re-locking on user gesture (required by most browsers) or visibility change
        const handleInteraction = () => {
            void lockPortrait();
        };

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                void lockPortrait();
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('click', handleInteraction, { passive: true });
        window.addEventListener('touchend', handleInteraction, { passive: true });
        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('click', handleInteraction);
            window.removeEventListener('touchend', handleInteraction);
        };
    }, []);
}

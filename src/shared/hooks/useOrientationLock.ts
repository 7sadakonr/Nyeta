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

        // Also attempt re-locking when window regains focus or visibility
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                void lockPortrait();
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, []);
}

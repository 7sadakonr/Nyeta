"use client";

import { useCallback, useEffect, useRef, useState } from 'react';

export interface UseWakeLockResult {
    isSupported: boolean;
    released: boolean;
    request: () => Promise<void>;
    release: () => Promise<void>;
}

/**
 * useWakeLock
 *
 * A custom hook to prevent the screen from going to sleep using the Screen Wake Lock API.
 */
export const useWakeLock = (): UseWakeLockResult => {
    const [isSupported] = useState<boolean>(() => typeof navigator !== 'undefined' && 'wakeLock' in navigator);
    const [released, setReleased] = useState<boolean>(false);
    const wakeLockRef = useRef<any>(null);

    const request = useCallback(async () => {
        if (typeof navigator === 'undefined' || !navigator.wakeLock) return;
        if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
            return;
        }

        try {
            const lock = await navigator.wakeLock.request('screen');
            wakeLockRef.current = lock;
            setReleased(false);

            lock.addEventListener('release', () => {
                setReleased(true);
            });
        } catch (err) {
            console.error('Wake Lock error:', err);
        }
    }, []);

    const release = useCallback(async () => {
        if (wakeLockRef.current) {
            await wakeLockRef.current.release();
            wakeLockRef.current = null;
        }
    }, []);

    useEffect(() => {
        if (!isSupported) return;

        let isMounted = true;

        const acquire = async () => {
            if (typeof navigator === 'undefined' || !navigator.wakeLock) return;
            if (document.visibilityState !== 'visible') return;

            try {
                const lock = await navigator.wakeLock.request('screen');
                if (!isMounted) {
                    lock.release();
                    return;
                }
                wakeLockRef.current = lock;
                setReleased(false);

                lock.addEventListener('release', () => {
                    if (isMounted) setReleased(true);
                });
            } catch (err) {
                console.error('Wake Lock error:', err);
            }
        };

        acquire();

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                acquire();
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            isMounted = false;
            release();
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [isSupported, release]);

    return { isSupported, released, request, release };
};

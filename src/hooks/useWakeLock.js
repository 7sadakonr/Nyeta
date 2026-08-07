"use client";

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * useWakeLock
 *
 * A custom hook to prevent the screen from going to sleep using the Screen Wake Lock API.
 * It automatically requests the lock on mount and releases it on unmount.
 * It also handles visibility changes (e.g., switching tabs) to re-acquire the lock.
 *
 * @returns {Object} { isSupported, released, request, release }
 */
export const useWakeLock = () => {
    const [isSupported] = useState(() => typeof navigator !== 'undefined' && 'wakeLock' in navigator);
    const [released, setReleased] = useState(false);
    const wakeLockRef = useRef(null);

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

"use client";

import { useEffect, useRef, useState } from "react";

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
    const [isSupported, setIsSupported] = useState(false);
    const [released, setReleased] = useState(false);
    const wakeLockRef = useRef(null);

    useEffect(() => {
        if ("wakeLock" in navigator) {
            setIsSupported(true);
        }
    }, []);

    const request = async () => {
        if (!isSupported) return;
        if (typeof document !== 'undefined' && document.visibilityState !== "visible") {
            return;
        }

        try {
            wakeLockRef.current = await navigator.wakeLock.request("screen");
            setReleased(false);
            console.log("Wake Lock is active");

            wakeLockRef.current.addEventListener("release", () => {
                console.log("Wake Lock has been released");
                setReleased(true);
            });
        } catch (err) {
            console.error("Wake Lock Check:", err);
        }
    };

    const release = async () => {
        if (wakeLockRef.current) {
            await wakeLockRef.current.release();
            wakeLockRef.current = null;
        }
    };

    useEffect(() => {
        // Request wake lock on mount
        request();

        // Re-request wake lock when the page becomes visible again
        const handleVisibilityChange = () => {
            if (document.visibilityState === "visible") {
                request();
            }
        };

        document.addEventListener("visibilitychange", handleVisibilityChange);

        return () => {
            release();
            document.removeEventListener("visibilitychange", handleVisibilityChange);
        };
    }, [isSupported]);

    return { isSupported, released, request, release };
};

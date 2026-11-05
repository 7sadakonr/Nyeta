import { useCallback, useEffect, useRef } from 'react';

// If recognition never actually starts (unsupported, refused instantly), bring the camera back after this long.
const START_GRACE_MS = 1500;
const READY_POLL_MS = 100;

interface Options {
    isListening: boolean;
    isReady: boolean;
    stopCamera: () => void;
    initCamera: () => Promise<void>;
}

/**
 * Keeps the camera and the microphone from being open at the same time.
 *
 * iOS treats an open camera plus an open microphone as a call-style capture session, and the camera preview can
 * freeze when speech recognition starts underneath it. So the camera is released before listening begins and
 * restarted when listening ends; the question is then sent once the camera is live again.
 */
export function useCameraPauseForMic({ isListening, isReady, stopCamera, initCamera }: Options) {
    const isReadyRef = useRef(isReady);
    const isListeningRef = useRef(isListening);
    const pausedRef = useRef(false);
    const wasListeningRef = useRef(false);

    useEffect(() => { isReadyRef.current = isReady; }, [isReady]);
    useEffect(() => { isListeningRef.current = isListening; }, [isListening]);

    const resume = useCallback(() => {
        if (!pausedRef.current) return;
        pausedRef.current = false;
        wasListeningRef.current = false;
        void initCamera();
    }, [initCamera]);

    // Listening just ended (sent, cancelled, errored): give the camera back.
    useEffect(() => {
        if (isListening) {
            wasListeningRef.current = true;
            return;
        }
        if (wasListeningRef.current) resume();
    }, [isListening, resume]);

    /** Call right before starting speech recognition (inside the tap, so recognition may still start from it). */
    const pauseForListening = useCallback(() => {
        pausedRef.current = true;
        stopCamera();
        setTimeout(() => {
            if (!isListeningRef.current) resume();
        }, START_GRACE_MS);
    }, [resume, stopCamera]);

    /** Resolves true once the camera is live again, false if it did not come back in time. */
    const waitUntilReady = useCallback(async (timeoutMs = 4000): Promise<boolean> => {
        const deadline = Date.now() + timeoutMs;
        while (!isReadyRef.current) {
            if (Date.now() >= deadline) return false;
            await new Promise((resolve) => setTimeout(resolve, READY_POLL_MS));
        }
        return true;
    }, []);

    return { pauseForListening, waitUntilReady };
}

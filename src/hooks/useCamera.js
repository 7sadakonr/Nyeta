import { useState, useCallback, useRef, useEffect } from 'react';

export function useCamera() {
    const [stream, setStream] = useState(null);
    const [isReady, setIsReady] = useState(false);
    const [error, setError] = useState(null);
    const videoRef = useRef(null);

    const wakeLockRef = useRef(null);

    const requestWakeLock = async () => {
        try {
            if ('wakeLock' in navigator) {
                wakeLockRef.current = await navigator.wakeLock.request('screen');
                wakeLockRef.current.addEventListener('release', () => {
                    console.log('Screen Wake Lock released');
                });
            }
        } catch (err) {
            console.error('Wake Lock Error:', err);
        }
    };

    const releaseWakeLock = () => {
        if (wakeLockRef.current) {
            wakeLockRef.current.release().catch(console.error);
            wakeLockRef.current = null;
        }
    };

    const initCamera = useCallback(async () => {
        setIsReady(false);
        setError(null);
        try {
            const mediaStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
            });
            setStream(mediaStream);
            if (videoRef.current) {
                videoRef.current.srcObject = mediaStream;
                videoRef.current.muted = true;
                videoRef.current.onloadedmetadata = () => videoRef.current.play().catch(console.error);
            }
            setIsReady(true);
            requestWakeLock();
        } catch (err) {
            console.error('Camera Init Error:', err);
            setError(err);
        }
    }, []);

    const stopCamera = useCallback(() => {
        setStream(prevStream => {
            if (prevStream) {
                prevStream.getTracks().forEach(track => track.stop());
            }
            return null;
        });
        setIsReady(false);
        releaseWakeLock();
    }, []);

    // Also handle visibility change for wake lock
    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible' && isReady) {
                requestWakeLock();
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            releaseWakeLock();
        };
    }, [isReady]);

    return { videoRef, stream, isReady, error, initCamera, stopCamera };
}

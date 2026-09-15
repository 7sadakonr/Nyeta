import { useState, useCallback, useRef, useEffect, RefObject } from 'react';
import { mediaSessionManager, MediaOwner } from '@/shared/media/mediaSessionManager';

export interface UseCameraResult {
    videoRef: RefObject<HTMLVideoElement | null>;
    stream: MediaStream | null;
    isReady: boolean;
    error: any;
    initCamera: (owner?: MediaOwner) => Promise<void>;
    stopCamera: () => void;
}

export function useCamera(): UseCameraResult {
    const [stream, setStream] = useState<MediaStream | null>(null);
    const [isReady, setIsReady] = useState<boolean>(false);
    const [error, setError] = useState<any>(null);
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const mountedRef = useRef(false);
    const operationIdRef = useRef(0);
    const wakeLockRef = useRef<any>(null);

    useEffect(() => {
        streamRef.current = stream;
    }, [stream]);

    const requestWakeLock = async () => {
        try {
            if ('wakeLock' in navigator) {
                wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
                wakeLockRef.current.addEventListener('release', () => {
                    if (process.env.NODE_ENV !== 'production') {
                        console.log('[Camera] Screen Wake Lock released');
                    }
                });
            }
        } catch (err) {
            if (process.env.NODE_ENV !== 'production') {
                console.warn('[Camera] Wake Lock Error:', err);
            }
        }
    };

    const releaseWakeLock = () => {
        if (wakeLockRef.current) {
            wakeLockRef.current.release().catch(() => {});
            wakeLockRef.current = null;
        }
    };

    // Attach stream to video element
    useEffect(() => {
        const video = videoRef.current;
        if (!video || !stream) return;

        video.srcObject = stream;
        video.defaultMuted = true;
        video.muted = true;

        const handleReady = () => {
            setIsReady(true);
            video.play().catch(() => {});
        };

        if (video.readyState >= 2) {
            handleReady();
        } else {
            video.addEventListener('loadedmetadata', handleReady);
            video.addEventListener('canplay', handleReady);
        }

        return () => {
            video.removeEventListener('loadedmetadata', handleReady);
            video.removeEventListener('canplay', handleReady);
            video.srcObject = null;
        };
    }, [stream]);

    const initCamera = useCallback(async (owner: MediaOwner = 'assistant') => {
        const operationId = operationIdRef.current + 1;
        operationIdRef.current = operationId;
        setError(null);

        try {
            const mediaStream = await mediaSessionManager.acquireCamera(owner);
            if (!mountedRef.current || operationId !== operationIdRef.current) {
                return;
            }
            streamRef.current = mediaStream;
            setStream(mediaStream);
            requestWakeLock();
        } catch (err) {
            if (!mountedRef.current || operationId !== operationIdRef.current) return;
            if (process.env.NODE_ENV !== 'production') {
                console.warn('[Camera] Init Error:', err);
            }
            setError(err);
            setIsReady(false);
        }
    }, []);

    const stopCamera = useCallback(() => {
        operationIdRef.current += 1;
        mediaSessionManager.releaseCamera('assistant', true);
        if (videoRef.current) {
            videoRef.current.srcObject = null;
        }
        setStream(null);
        setIsReady(false);
        releaseWakeLock();
    }, []);

    // Minimal, simplified watchdog: never aggressive, strictly obeys mediaSessionManager
    const checkAndRecoverCamera = useCallback((triggerSource: string) => {
        if (!mountedRef.current) return;
        if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
        if (mediaSessionManager.isTransitioning()) return;

        const video = videoRef.current;
        const currentStream = streamRef.current;
        if (!video || !currentStream) return;

        const tracks = currentStream.getVideoTracks();
        const track = tracks[0];

        // Track ended unexpectedly
        if (!track || track.readyState === 'ended') {
            if (process.env.NODE_ENV !== 'production') {
                console.log(`[Camera] Track ended (${triggerSource}), requesting recovery`);
            }
            void initCamera();
            return;
        }

        // Track muted by browser: wait for unmute
        if (track.muted) return;

        // Video playback paused while track is live: resume
        if (video.paused && track.readyState === 'live') {
            video.play().catch(() => {});
        }
    }, [initCamera]);

    // Track ended / unmute listeners
    useEffect(() => {
        if (!stream) return;
        const tracks = stream.getVideoTracks();
        const track = tracks[0];
        if (!track) return;

        const handleEnded = () => checkAndRecoverCamera('track.ended');
        const handleUnmute = () => checkAndRecoverCamera('track.unmute');

        track.addEventListener?.('ended', handleEnded);
        track.addEventListener?.('unmute', handleUnmute);

        return () => {
            track.removeEventListener?.('ended', handleEnded);
            track.removeEventListener?.('unmute', handleUnmute);
        };
    }, [stream, checkAndRecoverCamera]);

    // Handle visibility changes
    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible' && isReady) {
                requestWakeLock();
                checkAndRecoverCamera('visibilitychange');
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [isReady, checkAndRecoverCamera]);

    // Cleanup on unmount
    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
            operationIdRef.current += 1;
            mediaSessionManager.releaseCamera('assistant', false);
            releaseWakeLock();
        };
    }, []);

    return { videoRef, stream, isReady, error, initCamera, stopCamera };
}

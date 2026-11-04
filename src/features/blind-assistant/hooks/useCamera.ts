import { useState, useCallback, useRef, useEffect, RefObject } from 'react';

export interface UseCameraResult {
    videoRef: RefObject<HTMLVideoElement | null>;
    stream: MediaStream | null;
    isReady: boolean;
    error: any;
    initCamera: () => Promise<void>;
    /** Clears any error and requests the camera again. */
    retryCamera: () => Promise<void>;
    stopCamera: () => void;
    /** Ask for 1080p (document reading) or the lighter 720p used by every other mode. */
    setHighResolution: (on: boolean) => void;
}

const STANDARD_RESOLUTION = { width: 1280, height: 720 };
const HIGH_RESOLUTION = { width: 1920, height: 1080 };
// A stream that dies repeatedly is not going to recover by itself; stop retrying and report it.
const MAX_AUTOMATIC_RESTARTS = 2;

function videoTracksOf(stream: MediaStream | null): MediaStreamTrack[] {
    return stream?.getVideoTracks?.() ?? [];
}

export function useCamera(): UseCameraResult {
    const [stream, setStream] = useState<MediaStream | null>(null);
    const [isReady, setIsReady] = useState<boolean>(false);
    const [error, setError] = useState<any>(null);
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const mountedRef = useRef(false);
    const operationIdRef = useRef(0);
    // True between initCamera() and stopCamera(): the camera is supposed to be running.
    const wantedRef = useRef(false);
    const highResolutionRef = useRef(false);
    const restartCountRef = useRef(0);

    useEffect(() => {
        streamRef.current = stream;
    }, [stream]);

    const wakeLockRef = useRef<any>(null);

    const requestWakeLock = async () => {
        try {
            if ('wakeLock' in navigator) {
                wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
                wakeLockRef.current.addEventListener('release', () => {
                    console.log('Screen Wake Lock released');
                });
            }
        } catch (err) {
            console.warn('Wake Lock Error:', err);
        }
    };

    const releaseWakeLock = () => {
        if (wakeLockRef.current) {
            wakeLockRef.current.release().catch(() => {});
            wakeLockRef.current = null;
        }
    };

    const initCamera = useCallback(async () => {
        const operationId = operationIdRef.current + 1;
        operationIdRef.current = operationId;
        wantedRef.current = true;
        setIsReady(false);
        setError(null);
        try {
            const size = highResolutionRef.current ? HIGH_RESOLUTION : STANDARD_RESOLUTION;
            const mediaStream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: 'environment',
                    width: { ideal: size.width },
                    height: { ideal: size.height },
                    aspectRatio: { ideal: 16 / 9 },
                }
            });
            // A tab switch can unmount this feature while the permission prompt is open.
            // Never retain a stream which resolves after that switch.
            if (!mountedRef.current || operationId !== operationIdRef.current) {
                mediaStream.getTracks().forEach(track => track.stop());
                return;
            }
            streamRef.current = mediaStream;
            setStream(mediaStream);
            requestWakeLock();
        } catch (err) {
            if (!mountedRef.current || operationId !== operationIdRef.current) return;
            console.warn('Camera Init Error:', err);
            setError(err);
        }
    }, []);

    // Bind the stream to the <video> and only report "ready" once frames are actually playing.
    useEffect(() => {
        const video = videoRef.current;
        if (!video || !stream) return;

        video.srcObject = stream;
        video.muted = true;

        const markReady = () => {
            restartCountRef.current = 0;
            setIsReady(true);
        };

        let removeGestureRetry: (() => void) | null = null;
        const play = () => {
            Promise.resolve(video.play()).catch(() => {
                // Autoplay can be refused (page hidden, no gesture yet). Retry on the next touch.
                if (removeGestureRetry) return;
                const retry = () => {
                    removeGestureRetry?.();
                    video.play?.()?.catch?.(() => {});
                };
                document.addEventListener('pointerdown', retry, { once: true, capture: true });
                document.addEventListener('touchstart', retry, { once: true, capture: true });
                document.addEventListener('click', retry, { once: true, capture: true });
                removeGestureRetry = () => {
                    document.removeEventListener('pointerdown', retry, true);
                    document.removeEventListener('touchstart', retry, true);
                    document.removeEventListener('click', retry, true);
                    removeGestureRetry = null;
                };
            });
        };

        video.addEventListener('playing', markReady);
        if (!video.paused && video.readyState >= 2) markReady();
        else play();

        // An interruption (phone call, Siri, another app) can end or mute the track without any error.
        const tracks = videoTracksOf(stream);
        const handleEnded = () => {
            if (!mountedRef.current || streamRef.current !== stream || !wantedRef.current) return;
            setIsReady(false);
            if (restartCountRef.current >= MAX_AUTOMATIC_RESTARTS) {
                setError(new Error('Camera stream ended'));
                return;
            }
            restartCountRef.current += 1;
            void initCamera();
        };
        const handleMute = () => setIsReady(false);
        const handleUnmute = () => {
            play();
            if (!video.paused) markReady();
        };
        tracks.forEach((track) => {
            track.addEventListener?.('ended', handleEnded);
            track.addEventListener?.('mute', handleMute);
            track.addEventListener?.('unmute', handleUnmute);
        });

        return () => {
            video.removeEventListener('playing', markReady);
            removeGestureRetry?.();
            tracks.forEach((track) => {
                track.removeEventListener?.('ended', handleEnded);
                track.removeEventListener?.('mute', handleMute);
                track.removeEventListener?.('unmute', handleUnmute);
            });
        };
    }, [stream, initCamera]);

    const stopCamera = useCallback(() => {
        operationIdRef.current += 1;
        wantedRef.current = false;
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
        if (videoRef.current) {
            videoRef.current.srcObject = null;
        }
        setStream(null);
        setIsReady(false);
        releaseWakeLock();
    }, []);

    const setHighResolution = useCallback((on: boolean) => {
        if (highResolutionRef.current === on) return;
        highResolutionRef.current = on;
        const size = on ? HIGH_RESOLUTION : STANDARD_RESOLUTION;
        // Re-tune the running stream instead of restarting it; failure just keeps the current size.
        videoTracksOf(streamRef.current).forEach((track) => {
            track.applyConstraints?.({ width: { ideal: size.width }, height: { ideal: size.height } })?.catch?.(() => {});
        });
    }, []);

    // After the app was in the background: restart a dead stream, resume a paused video, renew the wake lock.
    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.visibilityState !== 'visible' || !wantedRef.current || !mountedRef.current) return;
            const current = streamRef.current;
            const tracks = videoTracksOf(current);
            const dead = !current || (tracks.length > 0 && tracks.every((track) => track.readyState === 'ended'));
            if (dead) {
                void initCamera();
                return;
            }
            const video = videoRef.current;
            if (video?.paused) Promise.resolve(video.play()).catch(() => {});
            requestWakeLock();
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [initCamera]);

    // Release wake lock and stop tracks on unmount
    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
            wantedRef.current = false;
            operationIdRef.current += 1;
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => track.stop());
            }
            releaseWakeLock();
        };
    }, []);

    return { videoRef, stream, isReady, error, initCamera, retryCamera: initCamera, stopCamera, setHighResolution };
}

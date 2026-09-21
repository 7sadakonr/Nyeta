import { useState, useCallback, useRef, useEffect, RefObject } from 'react';
import { captureMediaSnapshot, attachTrackListeners } from '../client/cameraMediaDebug';
import { isDiagnosticsEnabled } from '../client/investigationFlags';
import { speechController, configureAmbientAudioSession } from '@/shared/accessibility/speechController';

export interface UseCameraResult {
    videoRef: RefObject<HTMLVideoElement | null>;
    stream: MediaStream | null;
    isReady: boolean;
    error: any;
    initCamera: () => Promise<void>;
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

    useEffect(() => {
        const video = videoRef.current;
        if (!video || !stream) return;

        configureAmbientAudioSession();

        video.srcObject = stream;
        video.muted = true;
        video.defaultMuted = true;
        video.volume = 0;
        video.setAttribute('playsinline', '');
        video.setAttribute('webkit-playsinline', '');

        let cleanupDiag: (() => void) | null = null;
        if (isDiagnosticsEnabled()) {
            captureMediaSnapshot('camera-stream-bind', video);
            cleanupDiag = attachTrackListeners(video);
        }

        const handleReady = () => {
            setIsReady(true);
            video.play().catch(() => {});
            if (isDiagnosticsEnabled()) {
                captureMediaSnapshot('camera-ready', video);
            }
        };

        let pauseRecoveryTimer: ReturnType<typeof setTimeout> | null = null;
        let animationFrameId: number | null = null;

        const handlePause = () => {
            if (document.visibilityState !== 'visible' || !streamRef.current || video.ended) return;
            configureAmbientAudioSession();

            // WebKit on iOS may dispatch a transient pause event during audio category/speech transitions.
            // Resume immediately on the next animation frame (~16ms) and via short fallback timer
            // so the camera feed remains completely fluid and never stays frozen while TTS speaks.
            const resumePlayback = () => {
                if (video.paused && !video.ended && streamRef.current && document.visibilityState === 'visible') {
                    video.play().catch(() => {});
                }
            };

            if (animationFrameId !== null) cancelAnimationFrame(animationFrameId);
            animationFrameId = requestAnimationFrame(resumePlayback);

            if (pauseRecoveryTimer) clearTimeout(pauseRecoveryTimer);
            pauseRecoveryTimer = setTimeout(resumePlayback, 40);
        };

        video.addEventListener('pause', handlePause);

        const videoTrack = stream.getVideoTracks?.()?.[0];
        const handleTrackUnmute = () => {
            if (video.paused && !video.ended && streamRef.current && document.visibilityState === 'visible') {
                video.play().catch(() => {});
            }
        };
        videoTrack?.addEventListener('unmute', handleTrackUnmute);

        if (video.readyState >= 2) {
            handleReady();
        } else {
            video.addEventListener('loadedmetadata', handleReady);
            video.addEventListener('canplay', handleReady);
        }

        return () => {
            if (animationFrameId !== null) cancelAnimationFrame(animationFrameId);
            if (pauseRecoveryTimer) clearTimeout(pauseRecoveryTimer);
            videoTrack?.removeEventListener('unmute', handleTrackUnmute);
            video.removeEventListener('loadedmetadata', handleReady);
            video.removeEventListener('canplay', handleReady);
            video.removeEventListener('pause', handlePause);
            cleanupDiag?.();
        };
    }, [stream]);

    const initCamera = useCallback(async () => {
        configureAmbientAudioSession();
        const operationId = operationIdRef.current + 1;
        operationIdRef.current = operationId;
        setIsReady(false);
        setError(null);
        if (isDiagnosticsEnabled()) {
            captureMediaSnapshot('before-initCamera', videoRef.current);
        }
        try {
            let mediaStream: MediaStream;
            try {
                mediaStream = await navigator.mediaDevices.getUserMedia({
                    video: {
                        facingMode: 'environment',
                        width: { ideal: 1280 },
                        height: { ideal: 720 },
                        aspectRatio: { ideal: 16 / 9 },
                    }
                });
            } catch (constraintErr: any) {
                if (constraintErr?.name === 'OverconstrainedError' || constraintErr?.name === 'NotFoundError') {
                    mediaStream = await navigator.mediaDevices.getUserMedia({
                        video: {
                            width: { ideal: 1280 },
                            height: { ideal: 720 },
                            aspectRatio: { ideal: 16 / 9 },
                        }
                    });
                } else {
                    throw constraintErr;
                }
            }
            // A tab switch can unmount this feature while the permission prompt is open.
            // Never retain a stream which resolves after that switch.
            if (!mountedRef.current || operationId !== operationIdRef.current) {
                mediaStream.getTracks().forEach(track => track.stop());
                return;
            }
            if (isDiagnosticsEnabled()) {
                captureMediaSnapshot('after-getUserMedia-success', videoRef.current);
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

    const stopCamera = useCallback(() => {
        if (isDiagnosticsEnabled()) {
            captureMediaSnapshot('before-stopCamera', videoRef.current);
        }
        operationIdRef.current += 1;
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
        if (isDiagnosticsEnabled()) {
            captureMediaSnapshot('after-stopCamera', videoRef.current);
        }
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
        };
    }, [isReady]);

    // Release wake lock and stop tracks on unmount
    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
            operationIdRef.current += 1;
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => track.stop());
            }
            releaseWakeLock();
        };
    }, []);

    return { videoRef, stream, isReady, error, initCamera, stopCamera };
}

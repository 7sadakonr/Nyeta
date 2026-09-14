import { useState, useCallback, useRef, useEffect, RefObject } from 'react';
import { speechController } from '@/shared/accessibility/speechController';

export interface UseCameraResult {
    videoRef: RefObject<HTMLVideoElement | null>;
    stream: MediaStream | null;
    isReady: boolean;
    error: any;
    initCamera: () => Promise<void>;
    stopCamera: () => void;
}

const REOPEN_COOLDOWN_MS = 3000;
const MAX_REOPEN_RETRIES = 3;
const WATCHDOG_INTERVAL_MS = 2500;

export function useCamera(): UseCameraResult {
    const [stream, setStream] = useState<MediaStream | null>(null);
    const [isReady, setIsReady] = useState<boolean>(false);
    const [error, setError] = useState<any>(null);
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const mountedRef = useRef(false);
    const operationIdRef = useRef(0);

    const reopenCooldownRef = useRef<number>(0);
    const retryCountRef = useRef<number>(0);
    const isReopeningRef = useRef<boolean>(false);
    const playDebounceTimerRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        streamRef.current = stream;
    }, [stream]);

    const wakeLockRef = useRef<any>(null);

    const requestWakeLock = async () => {
        try {
            if ('wakeLock' in navigator) {
                wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
                wakeLockRef.current.addEventListener('release', () => {
                    if (process.env.NODE_ENV !== 'production') {
                        console.log('Screen Wake Lock released');
                    }
                });
            }
        } catch (err) {
            if (process.env.NODE_ENV !== 'production') {
                console.warn('Wake Lock Error:', err);
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

    const initCamera = useCallback(async () => {
        const operationId = operationIdRef.current + 1;
        operationIdRef.current = operationId;
        setIsReady(false);
        setError(null);

        // Before requesting a new stream, stop previous tracks and clear video source
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
        if (videoRef.current) {
            videoRef.current.srcObject = null;
        }

        try {
            const mediaStream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: 'environment',
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
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
            if (process.env.NODE_ENV !== 'production') {
                console.warn('Camera Init Error:', err);
            }
            setError(err);
        }
    }, []);

    const stopCamera = useCallback(() => {
        operationIdRef.current += 1;
        retryCountRef.current = 0;
        isReopeningRef.current = false;
        if (playDebounceTimerRef.current) {
            clearTimeout(playDebounceTimerRef.current);
            playDebounceTimerRef.current = null;
        }

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

    // Controlled camera reopen with rate limiting and cleanup
    const reopenCamera = useCallback(async (reason: string) => {
        if (!mountedRef.current || isReopeningRef.current) return;
        if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;

        const now = Date.now();
        if (now - reopenCooldownRef.current < REOPEN_COOLDOWN_MS) {
            if (process.env.NODE_ENV !== 'production') {
                console.log(`[Camera Watchdog] Reopen throttled (${reason}), cooldown active`);
            }
            return;
        }

        if (retryCountRef.current >= MAX_REOPEN_RETRIES) {
            if (process.env.NODE_ENV !== 'production') {
                console.warn(`[Camera Watchdog] Max reopen retries (${MAX_REOPEN_RETRIES}) reached. Reason: ${reason}`);
            }
            return;
        }

        isReopeningRef.current = true;
        reopenCooldownRef.current = now;
        retryCountRef.current++;

        if (process.env.NODE_ENV !== 'production') {
            console.log(`[Camera Watchdog] Reopening camera (${reason}). Retry ${retryCountRef.current}/${MAX_REOPEN_RETRIES}`);
        }

        // Before reopen: stop old tracks and clear srcObject
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
        if (videoRef.current) {
            videoRef.current.srcObject = null;
        }
        setStream(null);
        setIsReady(false);

        try {
            await initCamera();
            retryCountRef.current = 0;
        } catch (err) {
            if (process.env.NODE_ENV !== 'production') {
                console.warn('[Camera Watchdog] Camera reopen failed:', err);
            }
        } finally {
            isReopeningRef.current = false;
        }
    }, [initCamera]);

    const schedulePlaybackResume = useCallback((triggerSource: string, delayMs = 30) => {
        if (!mountedRef.current || isReopeningRef.current) return;
        if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;

        if (playDebounceTimerRef.current) return;

        playDebounceTimerRef.current = setTimeout(() => {
            playDebounceTimerRef.current = null;
            if (!mountedRef.current || isReopeningRef.current) return;
            if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;

            const video = videoRef.current;
            const currentStream = streamRef.current;
            if (!video || !currentStream) return;

            const tracks = currentStream.getVideoTracks ? currentStream.getVideoTracks() : currentStream.getTracks?.() ?? [];
            const track = tracks[0];
            if (!track || track.readyState !== 'live') return;

            const isPaused = video.paused;
            const isStalled = video.readyState < 2;
            const hasNoDimensions = isReady && (video.videoWidth === 0 || video.videoHeight === 0);

            if (process.env.NODE_ENV !== 'production') {
                console.log(`[Camera Watchdog] check (${triggerSource}) -> track.readyState=${track?.readyState}, track.muted=${track?.muted}, video.paused=${isPaused}, video.readyState=${video.readyState}`);
            }

            if (isPaused || isStalled || hasNoDimensions) {
                if (process.env.NODE_ENV !== 'production') {
                    console.log(`[Camera Watchdog] Resuming video playback (${triggerSource}). Paused=${isPaused}, readyState=${video.readyState}`);
                }
                video.play()
                    .then(() => {
                        if (process.env.NODE_ENV !== 'production') {
                            console.log(`[Camera Watchdog] video.play() succeeded (${triggerSource}). Dimensions: ${video.videoWidth}x${video.videoHeight}`);
                        }
                    })
                    .catch((err) => {
                        if (process.env.NODE_ENV !== 'production') {
                            console.warn(`[Camera Watchdog] video.play() rejected (${triggerSource}):`, err);
                        }
                    });
            }
        }, delayMs);
    }, [isReady]);

    // Check video and track state, attempt play() first, reopen only if recovery fails
    const checkAndRecoverCamera = useCallback((triggerSource: string) => {
        if (!mountedRef.current || isReopeningRef.current) return;
        if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;

        const video = videoRef.current;
        const currentStream = streamRef.current;
        if (!video || !currentStream) return;

        const tracks = currentStream.getVideoTracks ? currentStream.getVideoTracks() : currentStream.getTracks?.() ?? [];
        const track = tracks[0];

        // 1. Track is ended or missing
        if (!track || track.readyState === 'ended') {
            const speechSnap = speechController?.getSnapshot ? speechController.getSnapshot() : null;
            if (speechSnap?.isSpeaking) {
                if (process.env.NODE_ENV !== 'production') {
                    console.log(`[Camera Watchdog] Track ended while speech is speaking. Postponing reopen until idle (${triggerSource})`);
                }
                return;
            }
            reopenCamera(`track ended (${triggerSource})`);
            return;
        }

        // 2. Track is temporarily muted by iOS WebKit: do NOT reopen camera; wait for unmute
        if (track.muted) {
            if (process.env.NODE_ENV !== 'production') {
                console.log(`[Camera Watchdog] Track is muted (${triggerSource}); waiting for unmute`);
            }
            return;
        }

        // 3. Track is live: ensure video playback is running (never reopen while track is live)
        schedulePlaybackResume(triggerSource, 0);
    }, [reopenCamera, schedulePlaybackResume]);

    // Video element stall/pause events (resumes playback quickly even during speech)
    useEffect(() => {
        const video = videoRef.current;
        if (!video || !stream) return;

        const handlePause = () => {
            schedulePlaybackResume('video.pause', 30);
        };
        const handleStalled = () => {
            schedulePlaybackResume('video.stalled', 50);
        };
        const handleWaiting = () => {
            schedulePlaybackResume('video.waiting', 50);
        };

        video.addEventListener('pause', handlePause);
        video.addEventListener('stalled', handleStalled);
        video.addEventListener('waiting', handleWaiting);

        return () => {
            video.removeEventListener('pause', handlePause);
            video.removeEventListener('stalled', handleStalled);
            video.removeEventListener('waiting', handleWaiting);
        };
    }, [stream, schedulePlaybackResume]);

    // Track ended and unmute events (mute does not restart camera)
    useEffect(() => {
        if (!stream) return;
        const tracks = stream.getVideoTracks ? stream.getVideoTracks() : stream.getTracks?.() ?? [];
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

    // Speech state synchronization: ensure camera plays smoothly throughout speech guidance
    useEffect(() => {
        if (!speechController?.subscribe) return;

        let wasSpeaking = false;
        let wasListening = false;

        const unsubscribe = speechController.subscribe(() => {
            const snap = speechController.getSnapshot();
            if (snap.isSpeaking) {
                // Keep video playback continuously active while speech is speaking
                schedulePlaybackResume('speech: speaking', 30);
            } else if (wasSpeaking && snap.state === 'idle') {
                schedulePlaybackResume('speech: idle', 50);

                // If track ended while speech was active, reopen now that speech is idle
                const tracks = streamRef.current?.getVideoTracks ? streamRef.current.getVideoTracks() : streamRef.current?.getTracks?.() ?? [];
                const track = tracks[0];
                if (!track || track.readyState === 'ended') {
                    checkAndRecoverCamera('speech: idle (deferred track ended)');
                }
            } else if (wasListening && snap.state === 'idle') {
                // Microphone ended: gently validate video playback without restarting camera (Requirement 7)
                schedulePlaybackResume('mic: idle', 50);

                const tracks = streamRef.current?.getVideoTracks ? streamRef.current.getVideoTracks() : streamRef.current?.getTracks?.() ?? [];
                const track = tracks[0];
                if (!track || track.readyState === 'ended') {
                    checkAndRecoverCamera('mic: idle (deferred track ended)');
                }
            }
            wasSpeaking = snap.isSpeaking;
            wasListening = snap.isListening;
        });

        return () => {
            unsubscribe();
        };
    }, [checkAndRecoverCamera, schedulePlaybackResume]);

    // Periodic watchdog to catch stalled frames (non-aggressive to save battery)
    useEffect(() => {
        if (!isReady || !stream) return;

        const interval = setInterval(() => {
            checkAndRecoverCamera('watchdog-interval');
        }, WATCHDOG_INTERVAL_MS);

        return () => clearInterval(interval);
    }, [isReady, stream, checkAndRecoverCamera]);

    // Handle visibility change
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

    // Release wake lock and stop tracks on unmount
    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
            operationIdRef.current += 1;
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => track.stop());
                streamRef.current = null;
            }
            if (playDebounceTimerRef.current) {
                clearTimeout(playDebounceTimerRef.current);
                playDebounceTimerRef.current = null;
            }
            releaseWakeLock();
        };
    }, []);

    return { videoRef, stream, isReady, error, initCamera, stopCamera };
}

'use client';

const IS_DEV = process.env.NODE_ENV !== 'production';

export interface MediaSnapshot {
    timestamp: number;
    event: string;
    video: {
        paused: boolean;
        ended: boolean;
        readyState: number;
        networkState: number;
        currentTime: number;
        videoWidth: number;
        videoHeight: number;
        hasSrcObject: boolean;
    } | null;
    track: {
        readyState: string;
        muted: boolean;
        enabled: boolean;
        settings: MediaTrackSettings | null;
        capabilities: MediaTrackCapabilities | null;
    } | null;
    speech: {
        speaking: boolean;
        pending: boolean;
        paused: boolean;
    } | null;
    visibility: string;
}

export type FreezeCase = 'A' | 'B' | 'C' | 'D' | 'E' | 'none';

export interface FreezeProbeResult {
    case: FreezeCase;
    description: string;
    videoPaused: boolean;
    currentTimeMoving: boolean;
    frameCallbackActive: boolean;
    trackMuted: boolean;
    trackEnded: boolean;
}

import { speechController, SpeechLifecycleEvent } from '@/shared/accessibility/speechController';

let _snapshotLog: MediaSnapshot[] = [];
let _trackListenersAttached = false;
let _currentVideo: HTMLVideoElement | null = null;
let _unsubscribeSpeechLifecycle: (() => void) | null = null;

function getVideoTrack(v?: HTMLVideoElement | null): MediaStreamTrack | null {
    if (!v || !v.srcObject) return null;
    if (typeof MediaStream !== 'undefined' && v.srcObject instanceof MediaStream) {
        return v.srcObject.getVideoTracks()[0] ?? null;
    }
    return typeof (v.srcObject as any)?.getVideoTracks === 'function'
        ? (v.srcObject as any).getVideoTracks()[0] ?? null
        : null;
}

export function captureMediaSnapshot(
    event: string,
    video?: HTMLVideoElement | null
): MediaSnapshot | null {
    if (!IS_DEV) return null;
    const v = video || _currentVideo;
    const track = getVideoTrack(v);

    const snapshot: MediaSnapshot = {
        timestamp: performance.now(),
        event,
        video: v ? {
            paused: v.paused,
            ended: v.ended,
            readyState: v.readyState,
            networkState: v.networkState,
            currentTime: v.currentTime,
            videoWidth: v.videoWidth,
            videoHeight: v.videoHeight,
            hasSrcObject: !!v.srcObject,
        } : null,
        track: track ? {
            readyState: track.readyState,
            muted: track.muted,
            enabled: track.enabled,
            settings: (() => {
                try {
                    return typeof track.getSettings === 'function' ? track.getSettings() : null;
                } catch {
                    return null;
                }
            })(),
            capabilities: (() => {
                try {
                    return typeof (track as any).getCapabilities === 'function' ? (track as any).getCapabilities() : null;
                } catch {
                    return null;
                }
            })(),
        } : null,
        speech: typeof window !== 'undefined' && 'speechSynthesis' in window ? {
            speaking: Boolean((window as any).speechSynthesis?.['speaking']),
            pending: Boolean((window as any).speechSynthesis?.['pending']),
            paused: Boolean((window as any).speechSynthesis?.['paused']),
        } : null,
        visibility: typeof document !== 'undefined' ? document.visibilityState : 'unknown',
    };

    _snapshotLog.push(snapshot);
    if (_snapshotLog.length > 200) {
        _snapshotLog = _snapshotLog.slice(-200);
    }

    console.log(`[CameraDebug] ${event}`, snapshot);
    return snapshot;
}

export function attachTrackListeners(video: HTMLVideoElement): () => void {
    if (!IS_DEV) return () => {};
    _currentVideo = video;
    if (_trackListenersAttached) return () => {};

    if (!_unsubscribeSpeechLifecycle && typeof speechController?.subscribeLifecycle === 'function') {
        _unsubscribeSpeechLifecycle = speechController.subscribeLifecycle((speechEvent: SpeechLifecycleEvent, details?: any) => {
            captureMediaSnapshot(details ? `${speechEvent}:${details}` : speechEvent, video);
        });
    }

    const getTrack = () => getVideoTrack(video);

    const onMute = () => captureMediaSnapshot('track-mute', video);
    const onUnmute = () => captureMediaSnapshot('track-unmute', video);
    const onEnded = () => captureMediaSnapshot('track-ended', video);
    const onPause = () => captureMediaSnapshot('video-pause', video);
    const onPlaying = () => captureMediaSnapshot('video-playing', video);
    const onStalled = () => captureMediaSnapshot('video-stalled', video);
    const onSuspend = () => captureMediaSnapshot('video-suspend', video);

    video.addEventListener('pause', onPause);
    video.addEventListener('playing', onPlaying);
    video.addEventListener('stalled', onStalled);
    video.addEventListener('suspend', onSuspend);

    let activeTrack: MediaStreamTrack | null = null;

    const bindTrackEvents = () => {
        const track = getTrack();
        if (track && track !== activeTrack) {
            if (activeTrack) {
                activeTrack.removeEventListener('mute', onMute);
                activeTrack.removeEventListener('unmute', onUnmute);
                activeTrack.removeEventListener('ended', onEnded);
            }
            activeTrack = track;
            track.addEventListener('mute', onMute);
            track.addEventListener('unmute', onUnmute);
            track.addEventListener('ended', onEnded);
        }
    };

    bindTrackEvents();

    const observer = new MutationObserver(bindTrackEvents);
    observer.observe(video, { attributes: true });

    _trackListenersAttached = true;

    return () => {
        _trackListenersAttached = false;
        _currentVideo = null;
        video.removeEventListener('pause', onPause);
        video.removeEventListener('playing', onPlaying);
        video.removeEventListener('stalled', onStalled);
        video.removeEventListener('suspend', onSuspend);
        if (activeTrack) {
            activeTrack.removeEventListener('mute', onMute);
            activeTrack.removeEventListener('unmute', onUnmute);
            activeTrack.removeEventListener('ended', onEnded);
            activeTrack = null;
        }
        if (_unsubscribeSpeechLifecycle) {
            _unsubscribeSpeechLifecycle();
            _unsubscribeSpeechLifecycle = null;
        }
        observer.disconnect();
    };
}

export function startFrameFreezeProbe(
    video: HTMLVideoElement,
    durationMs = 3000
): Promise<FreezeProbeResult> {
    if (!IS_DEV) {
        return Promise.resolve({
            case: 'none',
            description: 'Production mode',
            videoPaused: false,
            currentTimeMoving: true,
            frameCallbackActive: true,
            trackMuted: false,
            trackEnded: false,
        });
    }

    return new Promise((resolve) => {
        const startCurrentTime = video.currentTime;
        let frameCallbackFired = false;
        let rVFCId: number | undefined;

        if (typeof (video as any).requestVideoFrameCallback === 'function') {
            try {
                rVFCId = (video as any).requestVideoFrameCallback(() => {
                    frameCallbackFired = true;
                });
            } catch {
                frameCallbackFired = true;
            }
        } else {
            frameCallbackFired = true;
        }

        const samples: number[] = [startCurrentTime];
        const sampleInterval = setInterval(() => {
            samples.push(video.currentTime);
        }, 500);

        setTimeout(() => {
            clearInterval(sampleInterval);
            if (rVFCId !== undefined && !frameCallbackFired && typeof (video as any).cancelVideoFrameCallback === 'function') {
                try {
                    (video as any).cancelVideoFrameCallback(rVFCId);
                } catch {}
            }

            const track = getVideoTrack(video);

            const currentTimeMoving = samples.length > 2 &&
                samples[samples.length - 1] !== samples[0];
            const trackMuted = track?.muted ?? false;
            const trackEnded = track?.readyState === 'ended';

            let freezeCase: FreezeCase = 'none';
            let description = 'No freeze detected';

            if (video.paused) {
                freezeCase = 'A';
                description = 'video.paused = true';
            } else if (trackEnded) {
                freezeCase = 'E';
                description = 'track.readyState = ended';
            } else if (trackMuted) {
                freezeCase = 'D';
                description = 'track.muted = true';
            } else if (!currentTimeMoving) {
                freezeCase = 'B';
                description = 'video.paused = false but currentTime not advancing';
            } else if (!frameCallbackFired) {
                freezeCase = 'C';
                description = 'currentTime advancing but requestVideoFrameCallback not firing';
            }

            const result: FreezeProbeResult = {
                case: freezeCase,
                description,
                videoPaused: video.paused,
                currentTimeMoving,
                frameCallbackActive: frameCallbackFired,
                trackMuted,
                trackEnded,
            };

            captureMediaSnapshot(`freeze-probe-result:${freezeCase}`, video);
            console.log('[CameraDebug] Freeze probe result:', result);
            resolve(result);
        }, durationMs);
    });
}

export function getSnapshotLog(): MediaSnapshot[] {
    return IS_DEV ? [..._snapshotLog] : [];
}

export function clearSnapshotLog(): void {
    _snapshotLog = [];
}

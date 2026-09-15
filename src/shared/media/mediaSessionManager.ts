/**
 * Single source of truth for all hardware media streams (camera, microphone, call),
 * audio session management, and cross-feature transitions.
 */

export type MediaMode = 'idle' | 'camera' | 'voice' | 'call' | 'restoring';
export type MediaOwner = 'assistant' | 'currency' | 'reader' | 'voice' | 'call' | null;

class MediaSessionManager {
    private cameraStream: MediaStream | null = null;
    private micStream: MediaStream | null = null;
    private callStream: MediaStream | null = null;

    private currentOwner: MediaOwner = null;
    private currentMode: MediaMode = 'idle';
    private transitionPromise: Promise<any> | null = null;
    private listeners = new Set<() => void>();

    private log(message: string, ...args: any[]) {
        if (process.env.NODE_ENV !== 'production') {
            console.log(`[Media] ${message}`, ...args);
        }
    }

    private notify() {
        this.listeners.forEach((listener) => {
            try {
                listener();
            } catch (err) {
                console.error('[Media] Listener error:', err);
            }
        });
    }

    public subscribe(listener: () => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    public getMode(): MediaMode {
        return this.currentMode;
    }

    public getOwner(): MediaOwner {
        return this.currentOwner;
    }

    public getCameraStream(): MediaStream | null {
        return this.cameraStream;
    }

    public isTransitioning(): boolean {
        return (
            this.transitionPromise !== null ||
            this.currentMode === 'restoring' ||
            this.currentMode === 'voice' ||
            this.currentMode === 'call'
        );
    }

    public async waitUntilReady(): Promise<void> {
        if (this.transitionPromise) {
            try {
                await this.transitionPromise;
            } catch {}
        }
    }

    /**
     * Acquire or reuse the single assistant camera stream.
     * Assistant, Currency, and Reader modes share this stream without restarting hardware tracks.
     */
    public async acquireCamera(owner: MediaOwner): Promise<MediaStream> {
        await this.waitUntilReady();

        // Check if existing camera stream is still valid and active
        if (this.cameraStream) {
            const tracks = this.cameraStream.getVideoTracks();
            const activeTrack = tracks[0];
            if (activeTrack && activeTrack.readyState === 'live') {
                const prevOwner = this.currentOwner;
                this.currentOwner = owner;
                this.currentMode = 'camera';
                this.log(`owner: ${prevOwner || 'none'} -> ${owner} (reusing active camera stream)`);
                this.notify();
                return this.cameraStream;
            }
            // If track is ended or invalid, clean it up before opening new
            this.stopTracks(this.cameraStream);
            this.cameraStream = null;
        }

        const acquireOp = (async () => {
            this.currentMode = 'restoring';
            this.log(`acquire camera for ${owner}`);
            this.notify();

            try {
                if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
                    throw new Error('MediaDevices not supported in this environment');
                }

                const stream = await navigator.mediaDevices.getUserMedia({
                    video: {
                        facingMode: 'environment',
                        width: { ideal: 1280 },
                        height: { ideal: 720 },
                        aspectRatio: { ideal: 16 / 9 },
                    },
                });

                this.cameraStream = stream;
                this.currentOwner = owner;
                this.currentMode = 'camera';
                this.log(`camera ready for ${owner}`);
                return stream;
            } catch (err) {
                this.currentMode = 'idle';
                this.currentOwner = null;
                throw err;
            } finally {
                this.transitionPromise = null;
                this.notify();
            }
        })();

        this.transitionPromise = acquireOp;
        return acquireOp;
    }

    /**
     * Release camera stream.
     * When switching between assistant/currency/reader, force is false so tracks stay alive.
     */
    public releaseCamera(owner: MediaOwner, force = false): void {
        if (!force && owner !== this.currentOwner) return;

        if (force) {
            this.log(`release camera (forced by ${owner})`);
            if (this.cameraStream) {
                this.stopTracks(this.cameraStream);
                this.cameraStream = null;
            }
            this.currentOwner = null;
            this.currentMode = 'idle';
            this.notify();
        }
    }

    /**
     * Begin voice capture: acquire microphone track for MediaRecorder.
     */
    public async beginVoiceCapture(): Promise<MediaStream> {
        await this.waitUntilReady();

        const voiceOp = (async () => {
            this.log('begin voice');
            this.currentMode = 'voice';
            this.notify();

            try {
                if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
                    throw new Error('MediaDevices not supported in this environment');
                }

                const stream = await navigator.mediaDevices.getUserMedia({
                    audio: true,
                });

                this.micStream = stream;
                this.log('mic acquired');
                return stream;
            } catch (err) {
                this.currentMode = this.cameraStream ? 'camera' : 'idle';
                throw err;
            } finally {
                this.transitionPromise = null;
                this.notify();
            }
        })();

        this.transitionPromise = voiceOp;
        return voiceOp;
    }

    /**
     * End voice capture: release mic tracks, reset audio session, and restore normal media mode.
     */
    public async endVoiceCapture(): Promise<void> {
        this.log('end voice capture');
        await this.releaseMicrophone();
        this.currentMode = this.cameraStream ? 'camera' : 'idle';
        this.log('media ready');
        this.notify();
    }

    /**
     * Release microphone tracks, reset audio session if supported, and settle.
     */
    public async releaseMicrophone(): Promise<void> {
        if (this.micStream) {
            this.stopTracks(this.micStream);
            this.micStream = null;
        }

        // Feature detection: reset audioSession if supported
        if (typeof navigator !== 'undefined' && 'audioSession' in navigator) {
            try {
                (navigator as any).audioSession.type = 'auto';
            } catch {}
        }

        this.log('mic released');
        // Bounded settle period to allow native audio routing to return to media playback
        await new Promise((r) => setTimeout(r, 60));
    }

    /**
     * Begin volunteer call: ensure assistant camera is stopped so WebRTC has exclusive hardware access.
     */
    public async beginCall(constraints?: MediaStreamConstraints): Promise<MediaStream> {
        await this.waitUntilReady();

        const callOp = (async () => {
            this.log('begin call');
            this.currentMode = 'call';
            this.currentOwner = 'call';

            // Cleanly stop assistant camera before call stream acquisition
            if (this.cameraStream) {
                this.stopTracks(this.cameraStream);
                this.cameraStream = null;
            }
            this.notify();

            try {
                if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
                    throw new Error('MediaDevices not supported in this environment');
                }

                const stream = await navigator.mediaDevices.getUserMedia(
                    constraints || {
                        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
                        audio: true,
                    }
                );

                this.callStream = stream;
                this.log('call stream acquired');
                return stream;
            } catch (err) {
                this.currentMode = 'idle';
                this.currentOwner = null;
                throw err;
            } finally {
                this.transitionPromise = null;
                this.notify();
            }
        })();

        this.transitionPromise = callOp;
        return callOp;
    }

    /**
     * End volunteer call: stop all call tracks, reset audio session, and wait for media to settle.
     */
    public async endCall(): Promise<void> {
        this.log('end call');
        const cleanupOp = (async () => {
            if (this.callStream) {
                this.stopTracks(this.callStream);
                this.callStream = null;
            }
            this.log('call tracks released');

            if (typeof navigator !== 'undefined' && 'audioSession' in navigator) {
                try {
                    (navigator as any).audioSession.type = 'auto';
                } catch {}
            }

            // Bounded settle for WebRTC audio subsystem
            await new Promise((r) => setTimeout(r, 80));
            this.currentOwner = null;
            this.currentMode = 'idle';
            this.log('media ready');
        })();

        this.transitionPromise = cleanupOp;
        await cleanupOp;
        this.transitionPromise = null;
        this.notify();
    }

    private stopTracks(stream: MediaStream) {
        try {
            stream.getTracks().forEach((track) => {
                track.stop();
            });
        } catch {}
    }
}

export const mediaSessionManager = new MediaSessionManager();

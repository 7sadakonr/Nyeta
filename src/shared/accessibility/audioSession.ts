export type AudioSessionType = 'auto' | 'playback' | 'play-and-record';

/**
 * Lightweight helper to configure navigator.audioSession with feature detection.
 * Used on iOS Safari / WebKit to switch between 'playback' and 'play-and-record'.
 */
export function setWebAudioSession(type: AudioSessionType): void {
    if (typeof window === 'undefined') return;
    try {
        const audioSession = (navigator as any).audioSession;
        if (audioSession && typeof audioSession === 'object') {
            if (audioSession.type !== type) {
                if (process.env.NODE_ENV !== 'production') {
                    console.log(`[AudioSession] ${audioSession.type || 'auto'} -> ${type}`);
                }
                audioSession.type = type;
            }
        }
    } catch {}
}

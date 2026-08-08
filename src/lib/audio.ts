let _audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext {
    if (!_audioCtx) {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        _audioCtx = new AudioContextClass();
    }
    if (_audioCtx.state === 'suspended') {
        _audioCtx.resume();
    }
    return _audioCtx;
}

export type EarconType = 'ring' | 'connect' | 'disconnect' | 'error' | 'bell' | string;

export function playEarcon(type?: EarconType): void {
    try {
        const ctx = getAudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        const now = ctx.currentTime;
        if (type === 'ring') {
            osc.frequency.value = 880;
        } else if (type === 'connect') {
            osc.frequency.value = 660;
        } else {
            osc.frequency.value = 330;
        }
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
        osc.start(now);
        osc.stop(now + 0.2);
    } catch {
        /* noop */
    }
}

export function playBeep(freq: number = 440, duration: number = 0.5): void {
    try {
        const ctx = getAudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        const now = ctx.currentTime;
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + duration);
        osc.start(now);
        osc.stop(now + duration);
    } catch {
        // Fallback for browsers that block AudioContext
    }
}

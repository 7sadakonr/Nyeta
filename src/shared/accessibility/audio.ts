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
        const now = ctx.currentTime;

        switch (type) {
            case 'success': {
                _playTwoTone(ctx, 523, 659, 0.12, 0.15, now);
                break;
            }
            case 'error': {
                _playTwoTone(ctx, 330, 220, 0.15, 0.15, now);
                break;
            }
            case 'capture': {
                _playSingleTone(ctx, 1200, 0.06, 0.25, now);
                break;
            }
            case 'ring': {
                _playTwoTone(ctx, 880, 1047, 0.15, 0.2, now);
                break;
            }
            case 'connect': {
                _playThreeTone(ctx, 523, 659, 784, 0.1, 0.15, now);
                break;
            }
            case 'end': {
                _playTwoTone(ctx, 440, 262, 0.2, 0.12, now);
                break;
            }
            case 'button': {
                _playSingleTone(ctx, 700, 0.04, 0.12, now);
                break;
            }
            default: {
                _playSingleTone(ctx, 440, 0.15, 0.15, now);
                break;
            }
        }
    } catch {
        /* noop */
    }
}

function _playSingleTone(
    ctx: AudioContext,
    freq: number,
    duration: number,
    volume: number,
    startTime: number,
): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(volume, startTime);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
    osc.start(startTime);
    osc.stop(startTime + duration + 0.01);
}

function _playTwoTone(
    ctx: AudioContext,
    freq1: number,
    freq2: number,
    toneDuration: number,
    volume: number,
    startTime: number,
): void {
    _playSingleTone(ctx, freq1, toneDuration, volume, startTime);
    _playSingleTone(ctx, freq2, toneDuration, volume, startTime + toneDuration);
}

function _playThreeTone(
    ctx: AudioContext,
    freq1: number,
    freq2: number,
    freq3: number,
    toneDuration: number,
    volume: number,
    startTime: number,
): void {
    _playSingleTone(ctx, freq1, toneDuration, volume, startTime);
    _playSingleTone(ctx, freq2, toneDuration, volume, startTime + toneDuration);
    _playSingleTone(ctx, freq3, toneDuration, volume, startTime + toneDuration * 2);
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

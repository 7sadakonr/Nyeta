'use client';

export type SpeechChannel = 'realtime' | 'result' | 'status' | 'critical';

export interface SpeechOptions {
    channel: SpeechChannel;
    key?: string;
    rate?: number;
    lang?: string;
    dedupeMs?: number;
    onStart?: () => void;
    onEnd?: (completed?: boolean) => void;
}

export type SpeechState = 'idle' | 'speaking' | 'screen-reader-quiet' | 'listening';

export interface SpeechSnapshot {
    state: SpeechState;
    channel: SpeechChannel | null;
    isSpeaking: boolean;
    isListening: boolean;
    isQuiet: boolean;
}

const ACCESSIBILITY_QUIET_DURATION_MS = 3500;
const MAX_CHUNK_LENGTH = 150;

const CHANNEL_PRIORITY: Record<SpeechChannel, number> = {
    realtime: 0,
    status: 1,
    result: 2,
    critical: 3,
};

type StoredSpeech = { text: string; options: Omit<SpeechOptions, 'onStart' | 'onEnd'> };

/**
 * Splits text into chunks of at most `max` characters. Thai has no spaces between words,
 * so oversized pieces are cut on word boundaries from Intl.Segmenter when available.
 */
export function splitSpeechText(text: string, max = MAX_CHUNK_LENGTH): string[] {
    const pieces: string[] = [];
    for (const word of text.split(/[\n\s]+/).filter(Boolean)) {
        if (word.length <= max) {
            pieces.push(word);
            continue;
        }
        let segments: string[] | null = null;
        const SegmenterCtor = (Intl as unknown as { Segmenter?: new (locale: string, options: { granularity: string }) => { segment: (input: string) => Iterable<{ segment: string }> } }).Segmenter;
        if (SegmenterCtor) {
            try {
                segments = Array.from(new SegmenterCtor('th', { granularity: 'word' }).segment(word), (item) => item.segment);
            } catch {
                segments = null;
            }
        }
        let current = '';
        for (const segment of segments ?? []) {
            if (segment.length > max) {
                if (current) pieces.push(current);
                current = '';
                for (let index = 0; index < segment.length; index += max) pieces.push(segment.substring(index, index + max));
            } else if (current.length + segment.length > max) {
                pieces.push(current);
                current = segment;
            } else {
                current += segment;
            }
        }
        if (segments) {
            if (current) pieces.push(current);
        } else {
            for (let index = 0; index < word.length; index += max) pieces.push(word.substring(index, index + max));
        }
    }

    const chunks: string[] = [];
    let currentChunk = '';
    for (const piece of pieces) {
        if (piece.length >= max || (currentChunk && currentChunk.length + 1 + piece.length > max)) {
            if (currentChunk) chunks.push(currentChunk);
            currentChunk = piece.length >= max ? '' : piece;
            if (piece.length >= max) chunks.push(piece);
        } else {
            currentChunk += (currentChunk ? ' ' : '') + piece;
        }
    }
    if (currentChunk) chunks.push(currentChunk);
    return chunks;
}

class SpeechController {
    private _audioUnlocked = false;

    private _pendingUnlockSpeech: { text: string, options: SpeechOptions } | null = null;
    private _guidanceSuppressed = false;
    private _guidanceSuppressedListeners = new Set<() => void>();
    private _guidanceMuted = false;
    private _guidanceMutedListeners = new Set<() => void>();

    /**
     * User-controlled mute toggle for real-time guidance channels.
     * Unlike temporary result suppression, this persists until the user toggles it back on.
     */
    public setGuidanceMuted(muted: boolean): void {
        if (this._guidanceMuted === muted) return;
        this._guidanceMuted = muted;

        if (muted) {
            if (this._currentChannel === 'realtime' || this._currentChannel === 'status') {
                this._cancelInternal();
                this._activeRequest++;
                this._state = this._isQuiet() ? 'screen-reader-quiet' : 'idle';
                this.notify();
            }
        }

        this._guidanceMutedListeners.forEach(listener => listener());
        this.notify();
    }

    public get isGuidanceMuted(): boolean {
        return this._guidanceMuted;
    }

    public subscribeGuidanceMuted(listener: () => void): () => void {
        this._guidanceMutedListeners.add(listener);
        return () => this._guidanceMutedListeners.delete(listener);
    }

    /**
     * Persistently suppress guidance (realtime/status) channels.
     * Used when VoiceOver is focused on result regions.
     * Critical channel is never suppressed.
     */
    public setGuidanceSuppressed(suppressed: boolean): void {
        if (this._guidanceSuppressed === suppressed) return;
        this._guidanceSuppressed = suppressed;

        if (suppressed) {
            // Cancel any active guidance speech
            if (this._currentChannel === 'realtime' || this._currentChannel === 'status') {
                this._cancelInternal();
                this._activeRequest++;
                this._state = this._isQuiet() ? 'screen-reader-quiet' : 'idle';
                this.notify();
            }
        }
        // When unsuppressed: do not resume old speech, wait for next natural guidance

        this._guidanceSuppressedListeners.forEach(listener => listener());
    }

    public get isGuidanceSuppressed(): boolean {
        return this._guidanceSuppressed;
    }

    public subscribeGuidanceSuppressed(listener: () => void): () => void {
        this._guidanceSuppressedListeners.add(listener);
        return () => this._guidanceSuppressedListeners.delete(listener);
    }

    private _orientationBlocked = false;

    /**
     * Suppress all non-critical speech when the device is oriented incorrectly (e.g. landscape).
     * Prevents any camera/detection speech from interfering with the orientation warning.
     */
    public setOrientationBlocked(blocked: boolean): void {
        if (this._orientationBlocked === blocked) return;
        this._orientationBlocked = blocked;

        if (blocked) {
            // Immediately stop any non-critical speech
            if (this._currentChannel !== 'critical') {
                this._cancelInternal();
                this._activeRequest++;
                this._state = 'idle';
                this.notify();
            }
        }
    }

    public get isOrientationBlocked(): boolean {
        return this._orientationBlocked;
    }

    
    public unlockAudio(): void {
        if (this._audioUnlocked || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
        this._audioUnlocked = true;
        try {
            if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
                window.speechSynthesis.resume();
                return;
            }

            if (this._pendingUnlockSpeech) {
                const { text, options } = this._pendingUnlockSpeech;
                this._pendingUnlockSpeech = null;
                this.speak(text, options);
                return;
            }

            const utterance = new SpeechSynthesisUtterance('');
            utterance.volume = 0;
            window.speechSynthesis.speak(utterance);
        } catch {}
    }

    private _voices: SpeechSynthesisVoice[] = [];
    private _voicesListening = false;

    /** iOS often returns no voices on the first call and fills them in later (voiceschanged), so cache and refresh. */
    private _getVoices(): SpeechSynthesisVoice[] {
        try {
            if (!this._voicesListening && typeof window.speechSynthesis.addEventListener === 'function') {
                this._voicesListening = true;
                window.speechSynthesis.addEventListener('voiceschanged', () => {
                    this._voices = window.speechSynthesis.getVoices();
                });
            }
            const current = window.speechSynthesis.getVoices();
            if (current.length > 0) this._voices = current;
        } catch {}
        return this._voices;
    }

    private _state: SpeechState = 'idle';
    private _activeRequest: number = 0;
    private _currentChannel: SpeechChannel | null = null;
    
    // Callbacks for the currently active request
    private _currentOnStart: (() => void) | null = null;
    private _currentOnEnd: ((completed?: boolean) => void) | null = null;
    private _currentSpeechOptions: Omit<SpeechOptions, 'onStart' | 'onEnd'> | null = null;
    private _resumeAfterNavigation: StoredSpeech | null = null;
    private _pendingCritical: StoredSpeech | null = null;
    
    // Internal deduplication and tracking
    private _lastRealtimeGuidance: string | null = null;
    private _lastRealtimeTime: number = 0;
    private _quietTimer: ReturnType<typeof setTimeout> | null = null;
    
    // Listeners for React reactive hooks
    private _listeners = new Set<() => void>();

    private _activeUtterance: SpeechSynthesisUtterance | null = null;
    
    // Chunking state
    private _chunkIndex: number = 0;
    private _chunks: string[] = [];
    private _chunkOptions: Omit<SpeechOptions, 'onStart' | 'onEnd'> & { rate: number, lang: string } | null = null;

    private notify() {
        this._listeners.forEach(listener => listener());
    }

    public subscribe(listener: () => void): () => void {
        this._listeners.add(listener);
        return () => this._listeners.delete(listener);
    }

    private _lastSnapshot: SpeechSnapshot | null = null;

    public getSnapshot(): SpeechSnapshot {
        if (!this._lastSnapshot || 
            this._lastSnapshot.state !== this._state || 
            this._lastSnapshot.channel !== this._currentChannel) {
            this._lastSnapshot = {
                state: this._state,
                channel: this._currentChannel,
                isSpeaking: this._state === 'speaking',
                isListening: this._state === 'listening',
                isQuiet: this._state === 'screen-reader-quiet',
            };
        }
        return this._lastSnapshot;
    }

    public speak(text: string, options: SpeechOptions): boolean {
        if (!text || typeof window === 'undefined' || !('speechSynthesis' in window)) {
            options.onEnd?.(false);
            return false;
        }

        const cleanText = text.trim();
        if (!cleanText) {
            options.onEnd?.(false);
            return false;
        }

        if (this._orientationBlocked && options.channel !== 'critical') {
            options.onEnd?.(false);
            return false;
        }

        if (
            this._state === 'speaking' &&
            this._currentChannel !== null &&
            CHANNEL_PRIORITY[options.channel] < CHANNEL_PRIORITY[this._currentChannel]
        ) {
            options.onEnd?.(false);
            return false;
        }

        if (this._state === 'listening' && options.channel !== 'critical') {
            options.onEnd?.(false);
            return false;
        }

        if ((this._guidanceMuted || this._guidanceSuppressed) && (options.channel === 'realtime' || options.channel === 'status')) {
            options.onEnd?.(false);
            return false;
        }

        if (this._isQuiet() && options.channel === 'critical') {
            // Do not talk over the screen reader: hold the latest critical message until the quiet window ends.
            this._pendingCritical = {
                text: cleanText,
                options: {
                    channel: options.channel,
                    key: options.key,
                    rate: options.rate,
                    lang: options.lang,
                    dedupeMs: options.dedupeMs,
                },
            };
            options.onEnd?.(false);
            return true;
        }

        if (this._isQuiet() && options.channel !== 'critical') {
            if (options.channel === 'result') {
                this._resumeAfterNavigation = {
                    text: cleanText,
                    options: {
                        channel: options.channel,
                        key: options.key,
                        rate: options.rate,
                        lang: options.lang,
                        dedupeMs: options.dedupeMs,
                    },
                };
                return true;
            }
            options.onEnd?.(false);
            return false;
        }

        if (options.channel === 'critical') {
            this._resumeAfterNavigation = null;
        }

        if (options.channel === 'realtime') {
            if (options.key) {
                // Deduplicate realtime
                const now = Date.now();
                if (
                    this._lastRealtimeGuidance === options.key &&
                    (now - this._lastRealtimeTime) < (options.dedupeMs || 1000)
                ) {
                    options.onEnd?.(false);
                    return false;
                }
                this._lastRealtimeGuidance = options.key;
                this._lastRealtimeTime = now;
            }
        } else {
             // Reset realtime dedupe when something explicitly spoken
             this._lastRealtimeGuidance = null;
        }

        // Cancel previous
        this._cancelInternal();

        this._activeRequest++;
        const requestId = this._activeRequest;
        this._state = 'speaking';
        this._currentChannel = options.channel;
        this._currentOnStart = options.onStart || null;
        this._currentOnEnd = options.onEnd || null;
        this._currentSpeechOptions = {
            channel: options.channel,
            key: options.key,
            rate: options.rate,
            lang: options.lang,
            dedupeMs: options.dedupeMs,
        };

        if (!this._audioUnlocked) {
            this._pendingUnlockSpeech = { text: cleanText, options };
        }
        
        this.notify();

        // Start new utterance
        const rate = options.rate || 1.1;
        const lang = options.lang || 'th-TH';

        if (cleanText.length > MAX_CHUNK_LENGTH) {
            this._startChunked(cleanText, requestId, { rate, lang, channel: options.channel });
        } else {
            this._speakDirect(cleanText, requestId, { rate, lang });
        }
        return true;
    }

    public stop(): void {
        this._resumeAfterNavigation = null;
        this._pendingCritical = null;
        const hasPendingSpeech = this._state === 'speaking' ||
            this._pendingUnlockSpeech !== null ||
            this._activeUtterance !== null ||
            this._chunks.length > 0;
        if (!hasPendingSpeech) return;

        this._cancelInternal();
        this._activeRequest++; // Invalidate
        if (this._state === 'speaking') {
            this._state = this._isQuiet() ? 'screen-reader-quiet' : 'idle';
        }
        this.notify();
    }

    public notifyUserNavigation(): void {
        // While the microphone is open, a tap must not turn "listening" into a quiet window: the quiet timer
        // would expire into 'idle' and let TTS speak into the open microphone.
        if (this._state === 'listening') return;
        this._captureResultForResume();
        this._cancelInternal();
        this._activeRequest++;
        
        this._state = 'screen-reader-quiet';
        this.notify();

        if (this._quietTimer) {
            clearTimeout(this._quietTimer);
        }
        
        this._quietTimer = setTimeout(() => {
            this._quietTimer = null;
            if (this._state === 'screen-reader-quiet') {
                this._state = 'idle';
            }
            const pendingCritical = this._pendingCritical;
            this._pendingCritical = null;
            const pendingResult = this._resumeAfterNavigation;
            if (pendingCritical) {
                // Critical goes first; the interrupted result is replayed after it finishes.
                this.speak(pendingCritical.text, {
                    ...pendingCritical.options,
                    onEnd: pendingResult
                        ? (completed) => {
                            if (completed) this.speak(pendingResult.text, pendingResult.options);
                        }
                        : undefined,
                });
            } else if (pendingResult) {
                this._resumeAfterNavigation = null;
                this.speak(pendingResult.text, pendingResult.options);
            } else {
                this.notify();
            }
        }, ACCESSIBILITY_QUIET_DURATION_MS);
    }

    public beginListening(): void {
        this._resumeAfterNavigation = null;
        this._pendingCritical = null;
        this._cancelInternal();
        this._activeRequest++;
        this._state = 'listening';
        this.notify();
    }

    public endListening(): void {
        if (this._state === 'listening') {
            this._state = this._isQuiet() ? 'screen-reader-quiet' : 'idle';
            this.notify();
        }
    }

    private _isQuiet(): boolean {
        return this._quietTimer !== null;
    }

    private _captureResultForResume(): void {
        if (this._currentChannel !== 'result' || !this._currentSpeechOptions) return;

        const remainingText = this._chunks.length > 0
            ? this._chunks.slice(this._chunkIndex).join(' ')
            : this._activeUtterance?.text;
        if (!remainingText) return;

        this._resumeAfterNavigation = {
            text: remainingText,
            options: { ...this._currentSpeechOptions },
        };
    }

    private _cancelInternal(): void {
        if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
            try {
                window.speechSynthesis.cancel();
            } catch (e) {}
        }
        
        // Fire onEnd for the current request
        const onEnd = this._currentOnEnd;
        this._currentOnEnd = null;
        this._currentOnStart = null;
        this._currentSpeechOptions = null;
        this._currentChannel = null;
        this._activeUtterance = null;
        this._chunks = [];
        this._chunkIndex = 0;
        this._chunkOptions = null;
        this._pendingUnlockSpeech = null;
        
        if (onEnd) {
            try {
                onEnd(false);
            } catch (e) {
                console.error('SpeechController onEnd error:', e);
            }
        }
    }

    private _startChunked(text: string, requestId: number, options: { rate: number, lang: string, channel: SpeechChannel }) {
        const chunks = splitSpeechText(text);

        this._chunks = chunks;
        this._chunkIndex = 0;
        this._chunkOptions = options;
        
        this._speakNextChunk(requestId);
    }
    
    private _speakNextChunk(requestId: number) {
        if (this._activeRequest !== requestId || this._chunkIndex >= this._chunks.length) {
            if (this._activeRequest === requestId) {
                this._finishSuccess(requestId);
            }
            return;
        }
        
        const text = this._chunks[this._chunkIndex];
        const isFirst = this._chunkIndex === 0;
        this._speakDirect(text, requestId, this._chunkOptions!, isFirst, true);
    }

    private _speakDirect(text: string, requestId: number, options: { rate: number, lang: string }, isFirst = true, isChunked = false) {
        try {
            if (window.speechSynthesis.paused) {
                window.speechSynthesis.resume();
            }
        } catch {}

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = options.lang;
        utterance.rate = options.rate;
        
        // Setup voice
        const voices = this._getVoices();
        const thVoice = voices.find(v => 
            (v.lang && v.lang.replace('_', '-').toLowerCase().startsWith('th')) ||
            (v.name && /thai|kanya|narisa|ภาษาไทย/i.test(v.name))
        );
        if (thVoice) {
            utterance.voice = thVoice;
        }

        utterance.onstart = () => {
            this._pendingUnlockSpeech = null;
            if (this._activeRequest !== requestId) return;
            if (isFirst && this._currentOnStart) {
                const cb = this._currentOnStart;
                this._currentOnStart = null;
                cb();
            }
        };

        utterance.onend = () => {
            if (this._activeRequest !== requestId) return;
            
            if (isChunked) {
                this._chunkIndex++;
                this._speakNextChunk(requestId);
            } else {
                this._finishSuccess(requestId);
            }
        };

        utterance.onerror = (e) => {
            if (this._activeRequest !== requestId) return;
            if (e.error === 'interrupted' || e.error === 'canceled') {
                return; // handled by cancelInternal
            }
            console.warn('SpeechController utterance error:', e.error);
            this._cancelInternal();
            this._state = 'idle';
            this.notify();
        };

        this._activeUtterance = utterance;
        
        try {
            window.speechSynthesis.speak(utterance);
        } catch (e) {
            console.error('SpeechSynthesis.speak failed:', e);
            if (this._activeRequest === requestId) {
                this._cancelInternal();
                this._state = 'idle';
                this.notify();
            }
        }
    }
    
    private _finishSuccess(requestId: number) {
        if (this._activeRequest !== requestId) return;
        
        const cb = this._currentOnEnd;
        this._currentOnEnd = null;
        this._currentOnStart = null;
        this._currentSpeechOptions = null;
        this._currentChannel = null;
        this._activeUtterance = null;
        this._chunks = [];
        this._chunkIndex = 0;
        this._chunkOptions = null;
        this._state = this._isQuiet() ? 'screen-reader-quiet' : 'idle';
        this.notify();
        
        if (cb) {
            try {
                cb(true);
            } catch (e) {
                console.error('SpeechController onEnd cb error:', e);
            }
        }
    }
}

export const speechController = typeof window !== 'undefined' ? new SpeechController() : ({} as SpeechController);

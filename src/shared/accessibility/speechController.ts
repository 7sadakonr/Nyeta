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

class SpeechController {
    private _audioUnlocked = false;

    private _pendingUnlockSpeech: { text: string, options: SpeechOptions } | null = null;
    
    public unlockAudio(): void {
        if (this._audioUnlocked || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
        this._audioUnlocked = true;
        try {
            if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
                // If it's already working, just resume to be safe
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
        } catch (e) {}
    }

    private _state: SpeechState = 'idle';
    private _activeRequest: number = 0;
    private _currentChannel: SpeechChannel | null = null;
    
    // Callbacks for the currently active request
    private _currentOnStart: (() => void) | null = null;
    private _currentOnEnd: ((completed?: boolean) => void) | null = null;
    
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

    public speak(text: string, options: SpeechOptions): void {
        if (!this._audioUnlocked) {
            this._pendingUnlockSpeech = { text, options };
        }
        if (!text || typeof window === 'undefined' || !('speechSynthesis' in window)) {
            options.onEnd?.(false);
            return;
        }

        const cleanText = text.trim();
        if (!cleanText) {
            options.onEnd?.(false);
            return;
        }

        if (this._state === 'listening' && options.channel !== 'critical') {
            options.onEnd?.(false);
            return;
        }

        if (this._state === 'screen-reader-quiet' && options.channel !== 'critical') {
            if (options.channel === 'result' || options.channel === 'status') {
                if (this._quietTimer) {
                    clearTimeout(this._quietTimer);
                    this._quietTimer = null;
                }
            } else {
                options.onEnd?.(false);
                return;
            }
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
                    return;
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
        
        this.notify();

        // Start new utterance
        const rate = options.rate || 1.1;
        const lang = options.lang || 'th-TH';

        if (cleanText.length > 150) {
            this._startChunked(cleanText, requestId, { rate, lang, channel: options.channel });
        } else {
            this._speakDirect(cleanText, requestId, { rate, lang });
        }
    }

    public stop(): void {
        if (this._state === 'speaking') {
            this._cancelInternal();
            this._state = 'idle';
            this._activeRequest++; // Invalidate
            this.notify();
        }
    }

    public notifyUserNavigation(): void {
        if (this._state === 'listening') return; // Don't interrupt mic logic
        
        this._cancelInternal();
        this._activeRequest++;
        
        this._state = 'screen-reader-quiet';
        this.notify();

        if (this._quietTimer) {
            clearTimeout(this._quietTimer);
        }
        
        this._quietTimer = setTimeout(() => {
            if (this._state === 'screen-reader-quiet') {
                this._state = 'idle';
                this.notify();
            }
        }, ACCESSIBILITY_QUIET_DURATION_MS);
    }

    public beginListening(): void {
        this._cancelInternal();
        this._activeRequest++;
        this._state = 'listening';
        this.notify();
    }

    public endListening(): void {
        if (this._state === 'listening') {
            this._state = 'idle';
            this.notify();
        }
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
        this._currentChannel = null;
        this._activeUtterance = null;
        this._chunks = [];
        
        if (onEnd) {
            try {
                onEnd(false);
            } catch (e) {
                console.error('SpeechController onEnd error:', e);
            }
        }
    }

    private _startChunked(text: string, requestId: number, options: { rate: number, lang: string, channel: SpeechChannel }) {
        // Split by sentences or approx 150 chars
        const words = text.split(/[\n\s]+/).filter(Boolean);
        const chunks: string[] = [];
        let currentChunk = '';
        
        for (const word of words) {
            if (word.length > 150) {
                if (currentChunk) chunks.push(currentChunk);
                for (let index = 0; index < word.length; index += 150) {
                    chunks.push(word.substring(index, index + 150));
                }
                currentChunk = '';
            } else if (currentChunk.length + word.length > 150) {
                chunks.push(currentChunk);
                currentChunk = word;
            } else {
                currentChunk += (currentChunk ? ' ' : '') + word;
            }
        }
        if (currentChunk) chunks.push(currentChunk);

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
        const voices = window.speechSynthesis.getVoices();
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
        this._currentChannel = null;
        this._activeUtterance = null;
        this._chunks = [];
        this._state = 'idle';
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

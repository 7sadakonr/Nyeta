/**
 * SpeechManager — Centralized speech output controller
 * 
 * ทุกการพูดในแอปต้องผ่านที่นี่ ห้ามเรียก speechSynthesis ตรง
 */

import { Priority, PriorityLevel, SpeechOptions } from '@/shared/types/speech';

export { Priority };

export interface QueueItem extends SpeechOptions {
  text: string;
  priority: PriorityLevel;
  owner: string;
}

declare global {
  interface Window {
    __tts_utterances?: SpeechSynthesisUtterance[];
  }
}

export class SpeechManager {
  private _speaking: boolean = false;
  private _currentPriority: number = -1;
  private _currentOwner: string | null = null;
  private _queue: QueueItem[] = [];
  private _cancelled: boolean = false;
  private _timeoutId: NodeJS.Timeout | null = null;
  private _safetyTimeoutId: NodeJS.Timeout | null = null;
  private _keepAliveIntervalId: NodeJS.Timeout | null = null;
  private _currentOnEnd: ((completed?: boolean) => void) | null = null;
  private _listeners: Set<() => void> = new Set();
  private _activeUtterances: Set<SpeechSynthesisUtterance> = new Set();
  private _speechCounter: number = 0;
  private _currentSpeechId: number = 0;
  private _voices: SpeechSynthesisVoice[] = [];

  constructor() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      this._loadVoices();
      if (window.speechSynthesis.onvoiceschanged !== undefined) {
        window.speechSynthesis.onvoiceschanged = () => this._loadVoices();
      }
    }
  }

  private _loadVoices(): void {
    try {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        this._voices = window.speechSynthesis.getVoices() || [];
      }
    } catch {
      this._voices = [];
    }
  }

  private _getBestVoice(lang: string = 'th-TH'): SpeechSynthesisVoice | null {
    if (!this._voices || this._voices.length === 0) {
      this._loadVoices();
    }
    if (!this._voices || this._voices.length === 0) return null;

    // 1. Exact match or Thai lang prefix
    const isThai = lang.toLowerCase().startsWith('th');
    if (isThai) {
      const thaiVoice = this._voices.find(v => 
        (v.lang && v.lang.replace('_', '-').toLowerCase().startsWith('th')) ||
        (v.name && /thai|kanya|narisa|ภาษาไทย/i.test(v.name))
      );
      if (thaiVoice) return thaiVoice;
    }

    // 2. Generic lang match
    const langPrefix = lang.split('-')[0].toLowerCase();
    const matchedVoice = this._voices.find(v => v.lang && v.lang.toLowerCase().startsWith(langPrefix));
    return matchedVoice || null;
  }

  /**
   * Unlock & resume speech synthesis on user interaction gestures
   */
  public unlock(): void {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        if (window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
        }
      } catch (e) {
        console.warn('SpeechManager unlock error:', e);
      }
    }
  }

  /**
   * Subscribe to speech state changes
   */
  public subscribe(listener: () => void): () => void {
    if (typeof listener !== 'function') return () => {};
    this._listeners.add(listener);
    return () => {
      this._listeners.delete(listener);
    };
  }

  private _notify(): void {
    this._listeners.forEach(listener => {
      try {
        listener();
      } catch (err) {
        console.error('SpeechManager listener error:', err);
      }
    });
  }

  /**
   * Request speech output
   */
  public speak(
    text: string | null | undefined,
    {
      priority = Priority.NORMAL,
      owner = 'unknown',
      rate = 1.1,
      lang = 'th-TH',
      chunk = false,
      onEnd,
    }: SpeechOptions = {}
  ): boolean {
    if (!text || typeof window === 'undefined' || !('speechSynthesis' in window)) {
      onEnd?.();
      return false;
    }

    const cleanText = String(text).trim();
    if (!cleanText) {
      onEnd?.();
      return false;
    }

    // LOW priority: drop if anything is speaking
    if (priority === Priority.LOW && this._speaking) {
      onEnd?.();
      return false;
    }

    // If currently speaking...
    if (this._speaking) {
      if (priority > this._currentPriority) {
        // Higher priority: interrupt current speech
        this._interruptCurrent();
      } else if (priority === this._currentPriority && priority >= Priority.NORMAL) {
        // Same priority, NORMAL+: queue it
        this._queue.push({ text: cleanText, priority, owner, rate, lang, chunk, onEnd });
        return true;
      } else {
        // Lower or equal LOW priority: drop
        onEnd?.();
        return false;
      }
    }

    // Speak now
    this._doSpeak(cleanText, { text: cleanText, priority, owner, rate, lang, chunk, onEnd });
    return true;
  }

  /** Stop all speech, clear queue */
  public stopAll(): void {
    this._cancelled = true;
    this._currentSpeechId = ++this._speechCounter;
    this._queue = [];
    this._cleanup();
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        speechSynthesis.cancel();
      } catch {}
    }
    this._notify();
  }

  /** Stop speech from a specific owner only */
  public stopByOwner(owner: string): void {
    this._queue = this._queue.filter(item => item.owner !== owner);
    if (this._currentOwner === owner) {
      this._cancelled = true;
      this._currentSpeechId = ++this._speechCounter;
      this._cleanup();
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        try {
          speechSynthesis.cancel();
        } catch {}
      }
      this._notify();
      // Process next in queue
      this._processQueue();
    }
  }

  /** Check if currently speaking */
  public get isSpeaking(): boolean { return this._speaking; }
  public get currentOwner(): string | null { return this._currentOwner; }
  public get currentPriority(): number { return this._currentPriority; }

  // --- Internal ---

  private _interruptCurrent(): void {
    this._cancelled = true;
    this._currentSpeechId = ++this._speechCounter;
    if (this._timeoutId) {
      clearTimeout(this._timeoutId);
      this._timeoutId = null;
    }
    if (this._safetyTimeoutId) {
      clearTimeout(this._safetyTimeoutId);
      this._safetyTimeoutId = null;
    }
    this._stopKeepAlive();

    const cb = this._currentOnEnd;
    this._currentOnEnd = null;
    cb?.(false);

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        speechSynthesis.cancel();
      } catch {}
    }
    this._speaking = false;
    this._notify();
  }

  private _cleanup(): void {
    if (this._timeoutId) {
      clearTimeout(this._timeoutId);
      this._timeoutId = null;
    }
    if (this._safetyTimeoutId) {
      clearTimeout(this._safetyTimeoutId);
      this._safetyTimeoutId = null;
    }
    this._stopKeepAlive();

    this._speaking = false;
    this._currentPriority = -1;
    this._currentOwner = null;
    const cb = this._currentOnEnd;
    this._currentOnEnd = null;
    cb?.(false);

    this._activeUtterances.clear();
    if (typeof window !== 'undefined') {
      window.__tts_utterances = [];
    }
    this._notify();
  }

  private _startKeepAlive(): void {
    this._stopKeepAlive();
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

    // Chrome 15-second speech pause bug workaround
    this._keepAliveIntervalId = setInterval(() => {
      if (this._speaking && typeof window !== 'undefined' && 'speechSynthesis' in window) {
        try {
          if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
            window.speechSynthesis.pause();
            window.speechSynthesis.resume();
          }
        } catch {}
      }
    }, 10000);
  }

  private _stopKeepAlive(): void {
    if (this._keepAliveIntervalId) {
      clearInterval(this._keepAliveIntervalId);
      this._keepAliveIntervalId = null;
    }
  }

  private _setSafetyWatchdog(speechId: number, textLength: number, rate: number = 1.0): void {
    if (this._safetyTimeoutId) {
      clearTimeout(this._safetyTimeoutId);
      this._safetyTimeoutId = null;
    }
    // Estimated max duration + 6s buffer
    const maxDurationMs = Math.max(6000, Math.ceil((textLength * 350) / Math.max(0.5, rate)) + 6000);
    this._safetyTimeoutId = setTimeout(() => {
      if (this._currentSpeechId === speechId && this._speaking) {
        console.warn(`SpeechManager: Safety timeout triggered for speechId ${speechId}`);
        const onEnd = this._currentOnEnd;
        this._cleanup();
        onEnd?.();
        this._processQueue();
      }
    }, maxDurationMs);
  }

  private _doSpeak(text: string, options: QueueItem): void {
    const { priority, owner, rate = 1.1, lang = 'th-TH', chunk = false, onEnd } = options;
    const speechId = ++this._speechCounter;
    this._currentSpeechId = speechId;
    this._speaking = true;
    this._currentPriority = priority;
    this._currentOwner = owner;
    this._cancelled = false;
    this._currentOnEnd = onEnd || null;
    this._notify();

    this._startKeepAlive();
    this._setSafetyWatchdog(speechId, text.length, rate);

    if (chunk) {
      this._speakChunked(text, { speechId, rate, lang, onEnd });
    } else {
      this._speakDirect(text, { speechId, rate, lang, onEnd });
    }
  }

  private _speakDirect(
    text: string,
    { speechId, rate, lang, onEnd }: { speechId: number; rate: number; lang: string; onEnd?: () => void }
  ): void {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      onEnd?.();
      return;
    }

    try {
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }
    } catch {}

    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang || 'th-TH';
    u.rate = rate || 1.1;

    const voice = this._getBestVoice(u.lang);
    if (voice) u.voice = voice;

    // Retain reference to prevent Garbage Collection drop in Chrome/WebKit
    this._activeUtterances.add(u);
    if (typeof window !== 'undefined') {
      window.__tts_utterances = window.__tts_utterances || [];
      window.__tts_utterances.push(u);
    }

    const handleEnd = () => {
      this._activeUtterances.delete(u);
      if (typeof window !== 'undefined' && window.__tts_utterances) {
        window.__tts_utterances = window.__tts_utterances.filter(item => item !== u);
      }

      if (this._currentSpeechId === speechId) {
        if (this._safetyTimeoutId) {
          clearTimeout(this._safetyTimeoutId);
          this._safetyTimeoutId = null;
        }
        this._stopKeepAlive();
        this._speaking = false;
        this._currentPriority = -1;
        this._currentOwner = null;
        this._currentOnEnd = null;
        this._notify();
        onEnd?.();
        this._processQueue();
      }
    };

    u.onend = handleEnd;
    u.onerror = (e) => {
      // Ignore errors from intentional cancellations
      if (e?.error !== 'interrupted' && e?.error !== 'canceled') {
        console.warn('SpeechSynthesis error:', e?.error);
      }
      handleEnd();
    };

    try {
      window.speechSynthesis.speak(u);
    } catch (err) {
      console.error('SpeechSynthesis.speak failed:', err);
      handleEnd();
    }
  }

  private _speakChunked(
    text: string,
    { speechId, rate, lang, onEnd }: { speechId: number; rate: number; lang: string; onEnd?: () => void }
  ): void {
    // Reuse chunking logic for iOS Safari & Android
    const words = text.split(/[\n\s]+/).filter(Boolean);
    const chunks: string[] = [];
    let currentChunk = '';

    for (const word of words) {
      if (word.length > 150) {
        if (currentChunk) chunks.push(currentChunk);
        for (let i = 0; i < word.length; i += 150) {
          chunks.push(word.substring(i, i + 150));
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

    if (chunks.length === 0) {
      if (this._currentSpeechId === speechId) {
        this._cleanup();
        onEnd?.();
        this._processQueue();
      }
      return;
    }

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        if (window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
        }
      } catch {}
    }
    let index = 0;

    const speakNext = () => {
      if (this._cancelled || this._currentSpeechId !== speechId || index >= chunks.length) {
        if (this._currentSpeechId === speechId) {
          if (this._safetyTimeoutId) {
            clearTimeout(this._safetyTimeoutId);
            this._safetyTimeoutId = null;
          }
          this._stopKeepAlive();
          this._speaking = false;
          this._currentPriority = -1;
          this._currentOwner = null;
          this._currentOnEnd = null;
          this._notify();
          onEnd?.();
          this._processQueue();
        }
        return;
      }

      const utterance = new SpeechSynthesisUtterance(chunks[index]);
      utterance.lang = lang;
      utterance.rate = rate;

      const voice = this._getBestVoice(lang);
      if (voice) utterance.voice = voice;

      this._activeUtterances.add(utterance);
      if (typeof window !== 'undefined') {
        window.__tts_utterances = window.__tts_utterances || [];
        window.__tts_utterances.push(utterance);
      }

      const handleNext = () => {
        this._activeUtterances.delete(utterance);
        if (typeof window !== 'undefined' && window.__tts_utterances) {
          window.__tts_utterances = window.__tts_utterances.filter(u => u !== utterance);
        }

        if (this._cancelled || this._currentSpeechId !== speechId) {
          return;
        }

        index += 1;
        this._timeoutId = setTimeout(speakNext, 200);
      };

      utterance.onend = handleNext;
      utterance.onerror = (e) => {
        if (e?.error !== 'interrupted' && e?.error !== 'canceled') {
          console.warn('Chunked Speech error:', e?.error);
        }
        handleNext();
      };

      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        try {
          speechSynthesis.speak(utterance);
        } catch (err) {
          console.error('SpeechSynthesis chunk speak failed:', err);
          handleNext();
        }
      }
    };

    speakNext();
  }

  private _processQueue(): void {
    if (this._queue.length === 0) return;
    // Sort by priority (highest first)
    this._queue.sort((a, b) => b.priority - a.priority);
    const next = this._queue.shift();
    if (next) {
      this._doSpeak(next.text, next);
    }
  }
}

// Singleton export
const speechManager: SpeechManager | null = typeof window !== 'undefined' ? new SpeechManager() : null;
export default speechManager;

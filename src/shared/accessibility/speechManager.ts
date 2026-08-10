/**
 * SpeechManager — Centralized speech output controller.
 *
 * ทุกการพูดในแอปต้องผ่านที่นี่ ห้ามเรียก speechSynthesis ตรง
 */

import { Priority, PriorityLevel, SpeechOptions } from '@/shared/types/speech';

export { Priority };

const ACCESSIBILITY_NAVIGATION_COOLDOWN_MS = 1000;

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
  private _speaking = false;
  private _currentPriority = -1;
  private _currentOwner: string | null = null;
  private _queue: QueueItem[] = [];
  private _cancelled = false;
  private _timeoutId: ReturnType<typeof setTimeout> | null = null;
  private _safetyTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private _keepAliveIntervalId: ReturnType<typeof setInterval> | null = null;
  private _accessibilityCooldownTimerId: ReturnType<typeof setTimeout> | null = null;
  private _accessibilityNavigationUntil = 0;
  private _currentOnEnd: ((completed?: boolean) => void) | null = null;
  private _listeners = new Set<() => void>();
  private _activeUtterances = new Set<SpeechSynthesisUtterance>();
  private _speechCounter = 0;
  private _currentSpeechId = 0;
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

  private _getBestVoice(lang = 'th-TH'): SpeechSynthesisVoice | null {
    if (this._voices.length === 0) this._loadVoices();
    if (this._voices.length === 0) return null;

    if (lang.toLowerCase().startsWith('th')) {
      const thaiVoice = this._voices.find(v =>
        (v.lang && v.lang.replace('_', '-').toLowerCase().startsWith('th')) ||
        (v.name && /thai|kanya|narisa|ภาษาไทย/i.test(v.name))
      );
      if (thaiVoice) return thaiVoice;
    }

    const langPrefix = lang.split('-')[0].toLowerCase();
    return this._voices.find(v => v.lang && v.lang.toLowerCase().startsWith(langPrefix)) || null;
  }

  /** Unlock speech synthesis after a user gesture when the browser requires it. */
  public unlock(): void {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    try {
      if (window.speechSynthesis.paused) window.speechSynthesis.resume();
    } catch (error) {
      console.warn('SpeechManager unlock error:', error);
    }
  }

  public subscribe(listener: () => void): () => void {
    if (typeof listener !== 'function') return () => {};
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  private _notify(): void {
    this._listeners.forEach(listener => {
      try {
        listener();
      } catch (error) {
        console.error('SpeechManager listener error:', error);
      }
    });
  }

  /**
   * Gives assistive-technology focus/navigation exclusive audio space.
   * It intentionally does not try to detect VoiceOver, which browsers do not expose.
   */
  public interruptForAccessibilityNavigation(): void {
    this._accessibilityNavigationUntil = Date.now() + ACCESSIBILITY_NAVIGATION_COOLDOWN_MS;
    this._scheduleAccessibilityCooldownDrain();

    // Navigation makes queued realtime guidance stale. Retain CRITICAL events, but
    // defer them until navigation has been quiet for the full cooldown.
    this._discardQueued(item => item.priority < Priority.CRITICAL);
    this._cancelCurrent();
  }

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
      onEnd?.(false);
      return false;
    }

    const cleanText = String(text).trim();
    if (!cleanText) {
      onEnd?.(false);
      return false;
    }

    const item: QueueItem = { text: cleanText, priority, owner, rate, lang, chunk, onEnd };
    if (this._isAccessibilityNavigationCoolingDown()) {
      if (priority === Priority.LOW) {
        onEnd?.(false);
        return false;
      }
      this._queue.push(item);
      this._scheduleAccessibilityCooldownDrain();
      return true;
    }

    if (priority === Priority.LOW && this._speaking) {
      onEnd?.(false);
      return false;
    }

    if (this._speaking) {
      if (priority > this._currentPriority) {
        this._interruptCurrent();
      } else if (priority === this._currentPriority && priority >= Priority.NORMAL) {
        this._queue.push(item);
        return true;
      } else {
        onEnd?.(false);
        return false;
      }
    }

    this._doSpeak(cleanText, item);
    return true;
  }

  /** Stop all speech and queued events without removing the manager instance. */
  public stopAll(): void {
    this._discardQueued(() => true);
    this._cancelCurrent();
  }

  /** Stop speech owned by one feature only. */
  public stopByOwner(owner: string): void {
    this._discardQueued(item => item.owner === owner);
    if (this._currentOwner === owner) {
      this._cancelCurrent();
      this._processQueue();
    }
  }

  public get isSpeaking(): boolean { return this._speaking; }
  public get currentOwner(): string | null { return this._currentOwner; }
  public get currentPriority(): number { return this._currentPriority; }

  private _isAccessibilityNavigationCoolingDown(): boolean {
    return Date.now() < this._accessibilityNavigationUntil;
  }

  private _scheduleAccessibilityCooldownDrain(): void {
    if (this._accessibilityCooldownTimerId) clearTimeout(this._accessibilityCooldownTimerId);
    const waitMs = Math.max(0, this._accessibilityNavigationUntil - Date.now());
    this._accessibilityCooldownTimerId = setTimeout(() => {
      this._accessibilityCooldownTimerId = null;
      this._processQueue();
    }, waitMs);
  }

  private _discardQueued(shouldDiscard: (item: QueueItem) => boolean): void {
    const retained: QueueItem[] = [];
    for (const item of this._queue) {
      if (shouldDiscard(item)) item.onEnd?.(false);
      else retained.push(item);
    }
    this._queue = retained;
  }

  private _clearTimers(): void {
    if (this._timeoutId) clearTimeout(this._timeoutId);
    if (this._safetyTimeoutId) clearTimeout(this._safetyTimeoutId);
    this._timeoutId = null;
    this._safetyTimeoutId = null;
    this._stopKeepAlive();
  }

  private _finishCurrent(completed: boolean): void {
    this._clearTimers();
    this._speaking = false;
    this._currentPriority = -1;
    this._currentOwner = null;
    const callback = this._currentOnEnd;
    this._currentOnEnd = null;
    this._activeUtterances.clear();
    if (typeof window !== 'undefined') window.__tts_utterances = [];
    this._notify();
    callback?.(completed);
  }

  private _cancelCurrent(): void {
    if (!this._speaking) return;
    this._cancelled = true;
    this._currentSpeechId = ++this._speechCounter;
    this._finishCurrent(false);
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {}
    }
  }

  private _interruptCurrent(): void {
    this._cancelCurrent();
  }

  private _startKeepAlive(): void {
    this._stopKeepAlive();
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    this._keepAliveIntervalId = setInterval(() => {
      if (!this._speaking) return;
      try {
        if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
          window.speechSynthesis.pause();
          window.speechSynthesis.resume();
        }
      } catch {}
    }, 10000);
  }

  private _stopKeepAlive(): void {
    if (this._keepAliveIntervalId) clearInterval(this._keepAliveIntervalId);
    this._keepAliveIntervalId = null;
  }

  private _setSafetyWatchdog(speechId: number, textLength: number, rate = 1): void {
    if (this._safetyTimeoutId) clearTimeout(this._safetyTimeoutId);
    const maxDurationMs = Math.max(6000, Math.ceil((textLength * 350) / Math.max(0.5, rate)) + 6000);
    this._safetyTimeoutId = setTimeout(() => {
      if (this._currentSpeechId !== speechId || !this._speaking) return;
      console.warn(`SpeechManager: Safety timeout triggered for speechId ${speechId}`);
      this._finishCurrent(true);
      this._processQueue();
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

    if (chunk) this._speakChunked(text, { speechId, rate, lang });
    else this._speakDirect(text, { speechId, rate, lang });
  }

  private _speakDirect(text: string, { speechId, rate, lang }: { speechId: number; rate: number; lang: string }): void {
    try {
      if (window.speechSynthesis.paused) window.speechSynthesis.resume();
    } catch {}

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.rate = rate;
    const voice = this._getBestVoice(lang);
    if (voice) utterance.voice = voice;
    this._activeUtterances.add(utterance);
    window.__tts_utterances = [...(window.__tts_utterances || []), utterance];

    const handleEnd = () => {
      this._activeUtterances.delete(utterance);
      window.__tts_utterances = (window.__tts_utterances || []).filter(item => item !== utterance);
      if (this._currentSpeechId !== speechId) return;
      this._finishCurrent(true);
      this._processQueue();
    };
    utterance.onend = handleEnd;
    utterance.onerror = event => {
      if (event?.error !== 'interrupted' && event?.error !== 'canceled') console.warn('SpeechSynthesis error:', event?.error);
      handleEnd();
    };

    try {
      window.speechSynthesis.speak(utterance);
    } catch (error) {
      console.error('SpeechSynthesis.speak failed:', error);
      handleEnd();
    }
  }

  private _speakChunked(text: string, { speechId, rate, lang }: { speechId: number; rate: number; lang: string }): void {
    const words = text.split(/[\n\s]+/).filter(Boolean);
    const chunks: string[] = [];
    let currentChunk = '';
    for (const word of words) {
      if (word.length > 150) {
        if (currentChunk) chunks.push(currentChunk);
        for (let index = 0; index < word.length; index += 150) chunks.push(word.substring(index, index + 150));
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
        this._finishCurrent(true);
        this._processQueue();
      }
      return;
    }

    let index = 0;
    const speakNext = () => {
      if (this._cancelled || this._currentSpeechId !== speechId || index >= chunks.length) {
        if (this._currentSpeechId === speechId) {
          this._finishCurrent(true);
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
      window.__tts_utterances = [...(window.__tts_utterances || []), utterance];
      const handleNext = () => {
        this._activeUtterances.delete(utterance);
        window.__tts_utterances = (window.__tts_utterances || []).filter(item => item !== utterance);
        if (this._cancelled || this._currentSpeechId !== speechId) return;
        index += 1;
        this._timeoutId = setTimeout(speakNext, 200);
      };
      utterance.onend = handleNext;
      utterance.onerror = event => {
        if (event?.error !== 'interrupted' && event?.error !== 'canceled') console.warn('Chunked Speech error:', event?.error);
        handleNext();
      };
      try {
        window.speechSynthesis.speak(utterance);
      } catch (error) {
        console.error('SpeechSynthesis chunk speak failed:', error);
        handleNext();
      }
    };
    speakNext();
  }

  private _processQueue(): void {
    if (this._speaking || this._queue.length === 0) return;
    if (this._isAccessibilityNavigationCoolingDown()) {
      this._scheduleAccessibilityCooldownDrain();
      return;
    }
    this._queue.sort((a, b) => b.priority - a.priority);
    const next = this._queue.shift();
    if (next) this._doSpeak(next.text, next);
  }
}

const speechManager: SpeechManager | null = typeof window !== 'undefined' ? new SpeechManager() : null;
export default speechManager;

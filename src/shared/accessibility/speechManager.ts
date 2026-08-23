/**
 * SpeechManager — Centralized speech output controller.
 *
 * ทุกการพูดในแอปต้องผ่านที่นี่ ห้ามเรียก speechSynthesis ตรง
 */

import { CancelSpeechOptions, Priority, PriorityLevel, SpeechCategory, SpeechCategoryValue, SpeechOptions } from '@/shared/types/speech';

export { Priority };

const ACCESSIBILITY_NAVIGATION_COOLDOWN_MS = 1000;
const MAX_DEDUPE_HISTORY_ENTRIES = 128;
const DEFAULT_REALTIME_MAX_AGE_MS = 1500;

export interface QueueItem extends SpeechOptions {
  text: string;
  priority: PriorityLevel;
  owner: string;
  category: SpeechCategoryValue;
  scope?: string;
  realtimeKey?: string;
  createdAt: number;
  speechKey?: string;
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
  private _currentCategory: SpeechCategoryValue | null = null;
  private _currentScope: string | null = null;
  private _currentRealtimeKey: string | null = null;
  private _queue: QueueItem[] = [];
  private _cancelled = false;
  private _timeoutId: ReturnType<typeof setTimeout> | null = null;
  private _safetyTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private _keepAliveIntervalId: ReturnType<typeof setInterval> | null = null;
  private _accessibilityCooldownTimerId: ReturnType<typeof setTimeout> | null = null;
  private _accessibilityNavigationUntil = 0;
  private _currentOnEnd: ((completed?: boolean) => void) | null = null;
  private _currentSpeechKey: string | null = null;
  private _spokenAt = new Map<string, number>();
  private _listeners = new Set<() => void>();
  private _activeUtterances = new Set<SpeechSynthesisUtterance>();
  private _speechCounter = 0;
  private _currentSpeechId = 0;
  private _voices: SpeechSynthesisVoice[] = [];
  private _audioPrimed = false;
  private _listeningExclusive = false;
  private _abortRecognition: (() => void) | null = null;
  private _criticalAbortRequested = false;

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
      if (this._audioPrimed || this._speaking) return;

      // Mobile Safari only accepts an utterance created synchronously from a
      // user gesture. This silent prime authorizes later async guidance without
      // adding another audible announcement.
      const prime = new SpeechSynthesisUtterance(' ');
      prime.volume = 0;
      prime.rate = 10;
      window.speechSynthesis.speak(prime);
      this._audioPrimed = true;
    } catch (error) {
      console.warn('SpeechManager unlock error:', error);
    }
  }

  /** Makes microphone capture exclusive over every non-critical speech request. */
  public beginListeningSession({ abortRecognition }: { abortRecognition: () => void }): boolean {
    if (this._listeningExclusive) return false;
    if (this._currentCategory === SpeechCategory.CRITICAL || this._queue.some(item => item.category === SpeechCategory.CRITICAL)) return false;

    this._listeningExclusive = true;
    this._abortRecognition = abortRecognition;
    this._criticalAbortRequested = false;
    this._discardQueued(item => item.category !== SpeechCategory.CRITICAL);
    if (this._speaking) this._cancelCurrent();
    this._notify();
    return true;
  }

  /** Releases microphone exclusivity and drains any deferred critical warning. */
  public endListeningSession(): void {
    if (!this._listeningExclusive) return;
    this._listeningExclusive = false;
    this._abortRecognition = null;
    this._criticalAbortRequested = false;
    this._notify();
    this._processQueue();
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

    // Legacy behavior for callers outside the blind assistant: only realtime
    // guidance yields to navigation. The blind screen opts out of this policy.
    this._discardQueued(item => item.category === SpeechCategory.REALTIME);
    if (this._speaking && this._currentCategory === SpeechCategory.REALTIME) this._cancelCurrent();
  }

  public speak(
    text: string | null | undefined,
    {
      category,
      priority: suppliedPriority,
      owner = 'unknown',
      scope,
      realtimeKey,
      maxAgeMs,
      rate = 1.1,
      lang = 'th-TH',
      chunk = false,
      interrupt = false,
      dedupe = false,
      cooldown = 0,
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

    const resolvedCategory = this._resolveCategory(category, suppliedPriority);
    const priority = this._priorityForCategory(resolvedCategory, suppliedPriority);
    const speechKey = this._getSpeechKey(cleanText, owner, dedupe, cooldown);
    if (speechKey && this._isDuplicate(speechKey, cooldown)) {
      onEnd?.(false);
      return false;
    }

    const item: QueueItem = {
      text: cleanText,
      priority,
      owner,
      category: resolvedCategory,
      scope,
      realtimeKey: resolvedCategory === SpeechCategory.REALTIME ? (realtimeKey || owner) : undefined,
      maxAgeMs: resolvedCategory === SpeechCategory.REALTIME ? (maxAgeMs ?? DEFAULT_REALTIME_MAX_AGE_MS) : maxAgeMs,
      createdAt: Date.now(),
      rate,
      lang,
      chunk,
      interrupt,
      dedupe,
      cooldown,
      onEnd,
      speechKey: speechKey || undefined,
    };

    if (this._listeningExclusive) {
      if (resolvedCategory !== SpeechCategory.CRITICAL) {
        onEnd?.(false);
        return false;
      }
      this._queue.push(item);
      if (!this._criticalAbortRequested) {
        this._criticalAbortRequested = true;
        this._abortRecognition?.();
      }
      return true;
    }

    if (resolvedCategory === SpeechCategory.REALTIME) {
      if (this._isAccessibilityNavigationCoolingDown()) {
        onEnd?.(false);
        return false;
      }
      this._discardQueued(queued => queued.category === SpeechCategory.REALTIME && queued.realtimeKey === item.realtimeKey);
      if (this._speaking) {
        if (this._currentCategory === SpeechCategory.REALTIME) {
          this._interruptCurrent();
        } else {
          this._queue.push(item);
          return true;
        }
      }
      this._doSpeak(cleanText, item);
      return true;
    }

    if (this._isAccessibilityNavigationCoolingDown()) {
      this._queue.push(item);
      this._scheduleAccessibilityCooldownDrain();
      return true;
    }

    if (this._speaking) {
      if (priority > this._currentPriority) {
        this._interruptCurrent();
      } else if (interrupt && priority === this._currentPriority) {
        this._interruptCurrent();
      } else if (priority === this._currentPriority && priority >= Priority.ACTION) {
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
    this.cancel({ owner });
  }

  /** Cancel selected speech without exposing the Web Speech API to components. */
  public cancel({ owner, scope, categories, atOrBelow }: CancelSpeechOptions = {}): void {
    const matches = (item: { owner: string; scope?: string; category?: SpeechCategoryValue; priority: number }) =>
      (owner === undefined || item.owner === owner)
      && (scope === undefined || item.scope === scope)
      && (categories === undefined || (!!item.category && categories.includes(item.category)))
      && (atOrBelow === undefined || item.priority <= atOrBelow);
    this._discardQueued(matches);
    if (this._speaking && this._currentOwner && matches({
      owner: this._currentOwner,
      scope: this._currentScope || undefined,
      category: this._currentCategory || undefined,
      priority: this._currentPriority,
    })) {
      this._cancelCurrent();
      this._processQueue();
    }
  }

  public get isSpeaking(): boolean { return this._speaking; }
  public get currentOwner(): string | null { return this._currentOwner; }
  public get currentPriority(): number { return this._currentPriority; }
  public get currentCategory(): SpeechCategoryValue | null { return this._currentCategory; }
  public get currentScope(): string | null { return this._currentScope; }
  public get isListeningExclusive(): boolean { return this._listeningExclusive; }

  private _resolveCategory(category: SpeechCategoryValue | undefined, priority: PriorityLevel | undefined): SpeechCategoryValue {
    if (category) return category;
    if (priority === Priority.CRITICAL) return SpeechCategory.CRITICAL;
    if (priority !== undefined && priority <= Priority.GUIDANCE) return SpeechCategory.REALTIME;
    return SpeechCategory.TASK;
  }

  private _priorityForCategory(category: SpeechCategoryValue, legacyPriority: PriorityLevel | undefined): PriorityLevel {
    if (category === SpeechCategory.CRITICAL) return Priority.CRITICAL;
    if (category === SpeechCategory.REALTIME) return Priority.GUIDANCE;
    return legacyPriority ?? Priority.ACTION;
  }

  private _isRealtimeExpired(item: QueueItem): boolean {
    return item.category === SpeechCategory.REALTIME
      && typeof item.maxAgeMs === 'number'
      && Date.now() - item.createdAt > item.maxAgeMs;
  }

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

  private _getSpeechKey(text: string, owner: string, dedupe: SpeechOptions['dedupe'], cooldown: number): string | null {
    if (!dedupe && cooldown <= 0) return null;
    if (typeof dedupe === 'string') return dedupe;
    return `${owner}:${text.replace(/\s+/g, ' ').trim().toLocaleLowerCase()}`;
  }

  private _isDuplicate(speechKey: string, cooldown: number): boolean {
    if (this._currentSpeechKey === speechKey || this._queue.some(item => item.speechKey === speechKey)) return true;
    const lastSpokenAt = this._spokenAt.get(speechKey);
    return lastSpokenAt !== undefined && cooldown > 0 && Date.now() - lastSpokenAt < cooldown;
  }

  private _markSpeechKey(item: QueueItem): void {
    if (!item.speechKey || !item.cooldown || item.cooldown <= 0) return;
    const now = Date.now();
    this._spokenAt.set(item.speechKey, now);
    for (const [key, spokenAt] of this._spokenAt) {
      if (now - spokenAt > 60_000) this._spokenAt.delete(key);
    }
    while (this._spokenAt.size > MAX_DEDUPE_HISTORY_ENTRIES) {
      const oldestKey = this._spokenAt.keys().next().value;
      if (oldestKey === undefined) break;
      this._spokenAt.delete(oldestKey);
    }
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
    this._currentCategory = null;
    this._currentScope = null;
    this._currentRealtimeKey = null;
    this._currentSpeechKey = null;
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
      this._cancelCurrent();
      this._processQueue();
    }, maxDurationMs);
  }

  private _doSpeak(text: string, options: QueueItem): void {
    const { priority, owner, category, scope, realtimeKey, rate = 1.1, lang = 'th-TH', chunk = false, onEnd, speechKey } = options;
    const speechId = ++this._speechCounter;
    this._currentSpeechId = speechId;
    this._speaking = true;
    this._currentPriority = priority;
    this._currentOwner = owner;
    this._currentCategory = category;
    this._currentScope = scope || null;
    this._currentRealtimeKey = realtimeKey || null;
    this._currentSpeechKey = speechKey || null;
    this._cancelled = false;
    this._currentOnEnd = onEnd || null;
    this._markSpeechKey(options);
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
    if (this._speaking || this._listeningExclusive || this._queue.length === 0) return;
    if (this._isAccessibilityNavigationCoolingDown()) {
      this._scheduleAccessibilityCooldownDrain();
      return;
    }
    this._discardQueued(item => this._isRealtimeExpired(item));
    if (this._queue.length === 0) return;
    this._queue.sort((a, b) => b.priority - a.priority || a.createdAt - b.createdAt);
    const next = this._queue.shift();
    if (next) this._doSpeak(next.text, next);
  }
}

const speechManager: SpeechManager | null = typeof window !== 'undefined' ? new SpeechManager() : null;
export default speechManager;

/**
 * SpeechManager — Centralized speech output controller.
 *
 * ทุกการพูดในแอปต้องผ่านที่นี่ ห้ามเรียก speechSynthesis ตรง
 */

import { CancelSpeechOptions, Priority, PriorityLevel, SpeechCategory, SpeechCategoryValue, SpeechOptions } from '@/shared/types/speech';

export { Priority };

export type AudioActivationState = 'idle' | 'pending' | 'active';
type AudioActivationSource = 'automatic' | 'gesture';

const ACCESSIBILITY_NAVIGATION_COOLDOWN_MS = 3500;
const MAX_DEDUPE_HISTORY_ENTRIES = 128;
const DEFAULT_REALTIME_MAX_AGE_MS = 1500;

/** Saved state for a pause-resumable speech interrupted by navigation. */
interface PausedSpeechState {
  remainingChunks: string[];
  options: QueueItem;
}

/** Progress tracker for chunked speech. */
interface ChunkProgress {
  chunks: string[];
  lastStartedIndex: number;
  totalChunks: number;
  currentCharacterIndex?: number;
}

export interface QueueItem extends SpeechOptions {
  text: string;
  priority: PriorityLevel;
  owner: string;
  category: SpeechCategoryValue;
  scope?: string;
  realtimeKey?: string;
  createdAt: number;
  speechKey?: string;
  navigationBehavior?: 'pause-resume' | 'cancel' | 'defer';
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
  private _currentExclusive = false;
  private _queue: QueueItem[] = [];
  private _cancelled = false;
  private _timeoutId: ReturnType<typeof setTimeout> | null = null;
  private _safetyTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private _keepAliveIntervalId: ReturnType<typeof setInterval> | null = null;
  private _accessibilityCooldownTimerId: ReturnType<typeof setTimeout> | null = null;
  private _accessibilityNavigationUntil = 0;
  private _currentOnStart: (() => void) | null = null;
  private _currentOnEnd: ((completed?: boolean) => void) | null = null;
  private _currentSpeechKey: string | null = null;
  private _spokenAt = new Map<string, number>();
  private _listeners = new Set<() => void>();
  private _activeUtterances = new Set<SpeechSynthesisUtterance>();
  private _speechCounter = 0;
  private _currentSpeechId = 0;
  private _voices: SpeechSynthesisVoice[] = [];
  private _audioActivationState: AudioActivationState = 'idle';
  private _audioActivationSource: AudioActivationSource | null = null;
  private _audioActivationOwner: string | null = null;
  private _audioActivationAttemptId = 0;
  private _listeningExclusive = false;
  private _abortRecognition: (() => void) | null = null;
  private _criticalAbortRequested = false;

  private _pauseReason: 'none' | 'accessibility' = 'none';
  private _pausedSpeech: PausedSpeechState | null = null;
  private _accessibilityResumeTimerId: ReturnType<typeof setTimeout> | null = null;
  private _chunkProgress: ChunkProgress | null = null;
  private _currentOptions: QueueItem | null = null;
  private _currentNavigationBehavior: 'pause-resume' | 'cancel' | 'defer' = 'defer';

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

  /** Resume an already-active speech session. */
  public unlock(): void {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    if (this._pauseReason === 'accessibility') return;
    try {
      if (window.speechSynthesis.paused) window.speechSynthesis.resume();
    } catch (error) {
      console.warn('SpeechManager unlock error:', error);
    }
  }

  public get audioActivationState(): AudioActivationState { return this._audioActivationState; }
  public get audioReady(): boolean { return this._audioActivationState === 'active'; }

  private _setAudioActivationState(state: AudioActivationState, source: AudioActivationSource | null = null, owner: string | null = null): void {
    const changed = this._audioActivationState !== state
      || this._audioActivationSource !== source
      || this._audioActivationOwner !== owner;
    this._audioActivationState = state;
    this._audioActivationSource = source;
    this._audioActivationOwner = owner;
    if (changed) this._notify();
  }

  private _startAudioActivation(source: AudioActivationSource, text: string, options: SpeechOptions = {}): boolean {
    const attemptId = ++this._audioActivationAttemptId;
    const owner = options.owner || 'audio-activation';
    let started = false;
    this._setAudioActivationState('pending', source, owner);

    const accepted = this.speak(text, {
      ...options,
      category: SpeechCategory.TASK,
      priority: Priority.ACTION,
      owner,
      onStart: () => {
        if (this._audioActivationAttemptId !== attemptId) return;
        started = true;
        this._setAudioActivationState('active');
        options.onStart?.();
      },
      onEnd: (completed) => {
        if (this._audioActivationAttemptId === attemptId && !started) {
          this._setAudioActivationState('idle');
        }
        options.onEnd?.(completed);
      },
    });

    if (!accepted && this._audioActivationAttemptId === attemptId) this._setAudioActivationState('idle');
    return accepted;
  }

  /** Attempts the entry announcement during page initialization. */
  public initializeAudio(text: string, options: SpeechOptions = {}): boolean {
    if (this._audioActivationState === 'active' || this._audioActivationState === 'pending') return true;
    return this._startAudioActivation('automatic', text, options);
  }

  /** Starts a short audible utterance inside a trusted user gesture for iOS Safari. */
  public activateFromUserGesture(text: string, options: SpeechOptions = {}): boolean {
    if (this._audioActivationState === 'active') return true;
    if (this._audioActivationState === 'pending') {
      if (this._audioActivationSource === 'gesture') return true;
      if (this._audioActivationOwner) this.cancel({ owner: this._audioActivationOwner });
    }
    return this._startAudioActivation('gesture', text, options);
  }

  /** Makes microphone capture exclusive over every non-critical speech request. */
  public beginListeningSession({ abortRecognition }: { abortRecognition: () => void }): boolean {
    if (this._listeningExclusive) return false;
    if (this._currentCategory === SpeechCategory.CRITICAL || this._queue.some(item => item.category === SpeechCategory.CRITICAL)) return false;

    this.clearPausedSpeech();
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
  public get hasPausedSpeech(): boolean { return this._pausedSpeech !== null; }
  public get pausedSpeechOwner(): string | null { return this._pausedSpeech?.options.owner ?? null; }

  public interruptForAccessibilityNavigation(): void {
    this._accessibilityNavigationUntil = Date.now() + ACCESSIBILITY_NAVIGATION_COOLDOWN_MS;

    if (this._accessibilityResumeTimerId) {
        clearTimeout(this._accessibilityResumeTimerId);
        this._accessibilityResumeTimerId = null;
    }

    this._discardQueued(item =>
        item.category === SpeechCategory.REALTIME ||
        item.navigationBehavior === 'cancel'
    );

    if (this._speaking) {
        const behavior = this._currentNavigationBehavior;
        if (behavior === 'pause-resume' && this._chunkProgress) {
            this._pauseForAccessibility();
        } else if (behavior === 'cancel' || this._currentCategory === SpeechCategory.REALTIME) {
            this._cancelCurrent();
        } else {
            this._cancelCurrent();
        }
    }

    this._scheduleAccessibilityResume();
    this._scheduleAccessibilityCooldownDrain();
  }

  private _pauseForAccessibility(): void {
    if (!this._speaking || !this._chunkProgress || !this._currentOptions) return;

    const resumeFromIndex = Math.max(0, this._chunkProgress.lastStartedIndex);
    const charIndex = this._chunkProgress.currentCharacterIndex || 0;
    const currentChunkRest = this._chunkProgress.chunks[resumeFromIndex].slice(charIndex);
    
    const remainingChunks: string[] = [];
    if (currentChunkRest.trim().length > 0) {
        remainingChunks.push(currentChunkRest);
    }
    remainingChunks.push(...this._chunkProgress.chunks.slice(resumeFromIndex + 1));

    if (remainingChunks.length === 0) return;

    this._pausedSpeech = {
        remainingChunks,
        options: {
            ...this._currentOptions,
            text: remainingChunks.join(' '),
            chunk: true,
            onStart: undefined,
            onEnd: this._currentOnEnd ?? undefined,
            navigationBehavior: 'pause-resume',
        },
    };
    this._pauseReason = 'accessibility';

    this._currentSpeechId = ++this._speechCounter;
    this._clearTimers();
    this._speaking = false;
    this._currentPriority = -1;
    this._currentOwner = null;
    this._currentCategory = null;
    this._currentScope = null;
    this._currentRealtimeKey = null;
    this._currentExclusive = false;
    this._currentSpeechKey = null;
    this._currentOnStart = null;
    this._currentOnEnd = null;
    this._currentOptions = null;
    this._currentNavigationBehavior = 'defer';
    this._activeUtterances.clear();
    this._chunkProgress = null;
    if (typeof window !== 'undefined') window.__tts_utterances = [];

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        try { window.speechSynthesis.cancel(); } catch {}
    }

    this._notify();
  }

  private _resumeFromAccessibilityPause(): void {
    this._accessibilityResumeTimerId = null;
    if (!this._pausedSpeech || this._pauseReason !== 'accessibility') return;
    if (this._speaking || this._listeningExclusive) {
        this.clearPausedSpeech();
        return;
    }

    const saved = this._pausedSpeech;
    this._pausedSpeech = null;
    this._pauseReason = 'none';

    const text = saved.remainingChunks.join(' ').trim();
    if (!text) {
        saved.options.onEnd?.(true);
        this._processQueue();
        return;
    }

    this._doSpeak(text, {
        ...saved.options,
        text,
        createdAt: Date.now(),
    });
  }

  public clearPausedSpeech(): void {
    if (this._accessibilityResumeTimerId) {
        clearTimeout(this._accessibilityResumeTimerId);
        this._accessibilityResumeTimerId = null;
    }
    if (this._pausedSpeech) {
        const onEnd = this._pausedSpeech.options.onEnd;
        this._pausedSpeech = null;
        this._pauseReason = 'none';
        onEnd?.(false);
    }
  }

  private _scheduleAccessibilityResume(): void {
    if (this._accessibilityResumeTimerId) clearTimeout(this._accessibilityResumeTimerId);
    if (!this._pausedSpeech) return;
    this._accessibilityResumeTimerId = setTimeout(() => {
        this._resumeFromAccessibilityPause();
    }, ACCESSIBILITY_NAVIGATION_COOLDOWN_MS);
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
      exclusive = false,
      dedupe = false,
      cooldown = 0,
      onStart,
      onEnd,
      navigationBehavior,
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
      exclusive,
      dedupe,
      cooldown,
      onStart,
      onEnd,
      speechKey: speechKey || undefined,
      navigationBehavior,
    };

    if (this._speaking && this._currentExclusive && owner !== this._currentOwner) {
      onEnd?.(false);
      return false;
    }

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
          onEnd?.(false);
          return false;
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

    if (this._pausedSpeech && scope && this._pausedSpeech.options.scope === scope) {
        this.clearPausedSpeech();
    }

    this._doSpeak(cleanText, item);
    return true;
  }

  /** Stop all speech and queued events without removing the manager instance. */
  public stopAll(): void {
    this.clearPausedSpeech();
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

    if (this._pausedSpeech) {
        const pausedOpts = this._pausedSpeech.options;
        if (matches({
            owner: pausedOpts.owner,
            scope: pausedOpts.scope,
            category: pausedOpts.category,
            priority: pausedOpts.priority,
        })) {
            this.clearPausedSpeech();
        }
    }

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
    this._currentExclusive = false;
    this._currentSpeechKey = null;
    this._currentOnStart = null;
    this._currentOptions = null;
    this._currentNavigationBehavior = 'defer';
    this._chunkProgress = null;
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
      if (!this._speaking || this._pauseReason === 'accessibility') return;
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
    const { priority, owner, category, scope, realtimeKey, exclusive = false, rate = 1.1, lang = 'th-TH', chunk = false, onStart, onEnd, speechKey, navigationBehavior } = options;
    const speechId = ++this._speechCounter;
    this._currentSpeechId = speechId;
    this._speaking = true;
    this._currentPriority = priority;
    this._currentOwner = owner;
    this._currentCategory = category;
    this._currentScope = scope || null;
    this._currentRealtimeKey = realtimeKey || null;
    this._currentExclusive = exclusive;
    this._currentSpeechKey = speechKey || null;
    this._cancelled = false;
    this._currentOnStart = onStart || null;
    this._currentOnEnd = onEnd || null;
    this._currentOptions = options;
    this._currentNavigationBehavior = navigationBehavior ?? (category === SpeechCategory.REALTIME ? 'cancel' : 'defer');
    if (exclusive) this._discardQueued(item => item.owner !== owner);
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

    const handleEnd = (completed = true) => {
      this._activeUtterances.delete(utterance);
      window.__tts_utterances = (window.__tts_utterances || []).filter(item => item !== utterance);
      if (this._currentSpeechId !== speechId) return;
      this._finishCurrent(completed);
      this._processQueue();
    };
    utterance.onstart = () => {
      if (this._currentSpeechId !== speechId) return;
      const callback = this._currentOnStart;
      this._currentOnStart = null;
      callback?.();
    };
    utterance.onend = () => handleEnd(true);
    utterance.onerror = event => {
      if (event?.error !== 'interrupted' && event?.error !== 'canceled') console.warn('SpeechSynthesis error:', event?.error);
      handleEnd(false);
    };

    try {
      window.speechSynthesis.speak(utterance);
    } catch (error) {
      console.error('SpeechSynthesis.speak failed:', error);
      handleEnd(false);
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

    this._chunkProgress = {
        chunks,
        lastStartedIndex: -1,
        totalChunks: chunks.length,
    };

    let remainingChunks = chunks.length;
    try {
      if (window.speechSynthesis.paused) window.speechSynthesis.resume();
    } catch {}

    for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
      const chunkText = chunks[chunkIndex];
      const utterance = new SpeechSynthesisUtterance(chunkText);
      utterance.lang = lang;
      utterance.rate = rate;
      const voice = this._getBestVoice(lang);
      if (voice) utterance.voice = voice;
      this._activeUtterances.add(utterance);
      window.__tts_utterances = [...(window.__tts_utterances || []), utterance];
      utterance.onstart = () => {
        if (this._currentSpeechId !== speechId) return;
        if (this._chunkProgress && chunkIndex > this._chunkProgress.lastStartedIndex) {
            this._chunkProgress.lastStartedIndex = chunkIndex;
        }
        const callback = this._currentOnStart;
        this._currentOnStart = null;
        callback?.();
      };
      utterance.onboundary = (event) => {
        if (this._currentSpeechId !== speechId) return;
        if (this._chunkProgress && chunkIndex === this._chunkProgress.lastStartedIndex) {
            if (event.charIndex !== undefined) {
                this._chunkProgress.currentCharacterIndex = event.charIndex;
            }
        }
      };
      utterance.onend = () => {
        this._activeUtterances.delete(utterance);
        window.__tts_utterances = (window.__tts_utterances || []).filter(item => item !== utterance);
        if (this._cancelled || this._currentSpeechId !== speechId) return;
        remainingChunks -= 1;
        if (remainingChunks === 0) {
          this._finishCurrent(true);
          this._processQueue();
        }
      };
      utterance.onerror = event => {
        if (event?.error !== 'interrupted' && event?.error !== 'canceled') console.warn('Chunked Speech error:', event?.error);
        if (this._currentSpeechId !== speechId) return;
        this._cancelCurrent();
        this._processQueue();
      };
      try {
        window.speechSynthesis.speak(utterance);
      } catch (error) {
        console.error('SpeechSynthesis chunk speak failed:', error);
        if (this._currentSpeechId === speechId) {
          this._cancelCurrent();
          this._processQueue();
        }
        return;
      }
    }
  }

  private _processQueue(): void {
    if (this._speaking || this._listeningExclusive || this._pausedSpeech) return;
    if (this._queue.length === 0) return;
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

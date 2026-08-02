/**
 * SpeechManager — Centralized speech output controller
 * 
 * ทุกการพูดในแอปต้องผ่านที่นี่ ห้ามเรียก speechSynthesis ตรง
 * 
 * Features:
 * - Priority queue (CRITICAL > HIGH > NORMAL > LOW)
 * - Owner tracking (สามารถหยุดเฉพาะ owner ได้)
 * - Interrupt logic based on priority
 * - State tracking (isSpeaking, currentOwner, currentPriority)
 * - onEnd callback support
 * - Long text chunking (iOS Safari & Android compatibility)
 * - Utterance retention (ป้องกัน Garbage Collection ใน Chromium/WebKit)
 * - Unique Speech ID (ป้องกัน Race Condition จาก Cancelled Events)
 * - Safety Watchdog Timeout (ป้องกันสถานะติดล็อคเมื่อเบราว์เซอร์ไม่ยิง event)
 * - Chrome 15-second Speech Keep-Alive
 * - Thai Voice auto-detection & preference
 */

export const Priority = {
  LOW: 0,      // guidance, hints
  NORMAL: 1,   // document reading, currency results
  HIGH: 2,     // AI responses, volunteer messages
  CRITICAL: 3, // errors, mode switches
};

class SpeechManager {
  constructor() {
    this._speaking = false;
    this._currentPriority = -1;
    this._currentOwner = null;
    this._queue = [];
    this._cancelled = false;
    this._timeoutId = null;
    this._safetyTimeoutId = null;
    this._keepAliveIntervalId = null;
    this._currentOnEnd = null;
    this._listeners = new Set();
    this._activeUtterances = new Set();
    this._speechCounter = 0;
    this._currentSpeechId = 0;
    this._voices = [];

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      this._loadVoices();
      if (window.speechSynthesis.onvoiceschanged !== undefined) {
        window.speechSynthesis.onvoiceschanged = () => this._loadVoices();
      }
    }
  }

  _loadVoices() {
    try {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        this._voices = window.speechSynthesis.getVoices() || [];
      }
    } catch {
      this._voices = [];
    }
  }

  _getBestVoice(lang = 'th-TH') {
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
  unlock() {
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
   * @param {function} listener - Callback called on state change
   * @returns {function} - Unsubscribe function
   */
  subscribe(listener) {
    if (typeof listener !== 'function') return () => {};
    this._listeners.add(listener);
    return () => {
      this._listeners.delete(listener);
    };
  }

  _notify() {
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
   * @param {string} text - Text to speak
   * @param {object} options
   * @param {number} options.priority - Priority level (use Priority enum)
   * @param {string} options.owner - Identifier (e.g. 'document-reader', 'currency', 'ai-assistant')
   * @param {number} [options.rate=1.1] - Speech rate
   * @param {string} [options.lang='th-TH'] - Language
   * @param {boolean} [options.chunk=false] - Whether to chunk long text (for iOS Safari)
   * @param {function} [options.onEnd] - Callback when speech completes
   * @returns {boolean} - true if speech was accepted (will speak now or queued)
   */
  speak(text, { priority = Priority.NORMAL, owner = 'unknown', rate = 1.1, lang = 'th-TH', chunk = false, onEnd } = {}) {
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
    this._doSpeak(cleanText, { priority, owner, rate, lang, chunk, onEnd });
    return true;
  }

  /** Stop all speech, clear queue */
  stopAll() {
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
  stopByOwner(owner) {
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
  get isSpeaking() { return this._speaking; }
  get currentOwner() { return this._currentOwner; }
  get currentPriority() { return this._currentPriority; }

  // --- Internal ---

  _interruptCurrent() {
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

  _cleanup() {
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

  _startKeepAlive() {
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

  _stopKeepAlive() {
    if (this._keepAliveIntervalId) {
      clearInterval(this._keepAliveIntervalId);
      this._keepAliveIntervalId = null;
    }
  }

  _setSafetyWatchdog(speechId, textLength, rate = 1.0) {
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

  _doSpeak(text, { priority, owner, rate, lang, chunk, onEnd }) {
    const speechId = ++this._speechCounter;
    this._currentSpeechId = speechId;
    this._speaking = true;
    this._currentPriority = priority;
    this._currentOwner = owner;
    this._cancelled = false;
    this._currentOnEnd = onEnd;
    this._notify();

    this._startKeepAlive();
    this._setSafetyWatchdog(speechId, text.length, rate);

    if (chunk) {
      this._speakChunked(text, { speechId, rate, lang, onEnd });
    } else {
      this._speakDirect(text, { speechId, rate, lang, onEnd });
    }
  }

  _speakDirect(text, { speechId, rate, lang, onEnd }) {
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

  _speakChunked(text, { speechId, rate, lang, onEnd }) {
    // Reuse chunking logic for iOS Safari & Android
    const words = text.split(/[\n\s]+/).filter(Boolean);
    const chunks = [];
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

  _processQueue() {
    if (this._queue.length === 0) return;
    // Sort by priority (highest first)
    this._queue.sort((a, b) => b.priority - a.priority);
    const next = this._queue.shift();
    this._doSpeak(next.text, next);
  }
}

// Singleton export
const speechManager = typeof window !== 'undefined' ? new SpeechManager() : null;
export default speechManager;


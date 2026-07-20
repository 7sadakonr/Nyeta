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
 * - Long text chunking (reuse จาก tts.js)
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
    this._currentOnEnd = null;
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
        this._queue.push({ text, priority, owner, rate, lang, chunk, onEnd });
        return true;
      } else {
        // Lower or equal LOW priority: drop
        onEnd?.();
        return false;
      }
    }

    // Speak now
    this._doSpeak(text, { priority, owner, rate, lang, chunk, onEnd });
    return true;
  }

  /** Stop all speech, clear queue */
  stopAll() {
    this._cancelled = true;
    this._queue = [];
    this._cleanup();
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      speechSynthesis.cancel();
    }
  }

  /** Stop speech from a specific owner only */
  stopByOwner(owner) {
    this._queue = this._queue.filter(item => item.owner !== owner);
    if (this._currentOwner === owner) {
      this._cancelled = true;
      this._cleanup();
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        speechSynthesis.cancel();
      }
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
    if (this._timeoutId) {
      clearTimeout(this._timeoutId);
      this._timeoutId = null;
    }
    // Don't call onEnd for interrupted speech
    this._currentOnEnd = null;
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      speechSynthesis.cancel();
    }
    this._speaking = false;
  }

  _cleanup() {
    if (this._timeoutId) {
      clearTimeout(this._timeoutId);
      this._timeoutId = null;
    }
    this._speaking = false;
    this._currentPriority = -1;
    this._currentOwner = null;
    this._currentOnEnd = null;
    if (typeof window !== 'undefined') {
        window.__tts_utterances = [];
    }
  }

  _doSpeak(text, { priority, owner, rate, lang, chunk, onEnd }) {
    this._speaking = true;
    this._currentPriority = priority;
    this._currentOwner = owner;
    this._cancelled = false;
    this._currentOnEnd = onEnd;

    if (chunk) {
      this._speakChunked(text, { rate, lang, onEnd });
    } else {
      this._speakDirect(text, { rate, lang, onEnd });
    }
  }

  _speakDirect(text, { rate, lang, onEnd }) {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        speechSynthesis.cancel();
    }
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    u.rate = rate;
    
    const handleEnd = () => {
      if (this._currentOnEnd === onEnd) {
        this._speaking = false;
        this._currentPriority = -1;
        this._currentOwner = null;
        this._currentOnEnd = null;
        onEnd?.();
        this._processQueue();
      }
    };
    
    u.onend = handleEnd;
    u.onerror = handleEnd;
    
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        speechSynthesis.speak(u);
    }
  }

  _speakChunked(text, { rate, lang, onEnd }) {
    // Reuse chunking logic from tts.js for iOS Safari
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
      this._speaking = false;
      this._currentPriority = -1;
      this._currentOwner = null;
      onEnd?.();
      this._processQueue();
      return;
    }

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        speechSynthesis.cancel();
    }
    let index = 0;

    const speakNext = () => {
      if (this._cancelled || index >= chunks.length) {
        if (this._currentOnEnd === onEnd) {
          this._speaking = false;
          this._currentPriority = -1;
          this._currentOwner = null;
          this._currentOnEnd = null;
          onEnd?.();
          this._processQueue();
        }
        return;
      }

      const utterance = new SpeechSynthesisUtterance(chunks[index]);
      utterance.lang = lang;
      utterance.rate = rate;

      if (typeof window !== 'undefined') {
          // Prevent GC crash on iOS Safari
          window.__tts_utterances = window.__tts_utterances || [];
          window.__tts_utterances.push(utterance);
      }

      const handleNext = () => {
        if (this._cancelled) {
          onEnd?.();
          return;
        }
        if (typeof window !== 'undefined') {
            window.__tts_utterances = (window.__tts_utterances || []).filter(u => u !== utterance);
        }
        index += 1;
        this._timeoutId = setTimeout(speakNext, 250);
      };

      utterance.onend = handleNext;
      utterance.onerror = handleNext;
      
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
          speechSynthesis.speak(utterance);
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

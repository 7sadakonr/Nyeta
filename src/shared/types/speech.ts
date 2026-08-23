/**
 * Type definitions for centralized SpeechManager and Speech Synthesis.
 */

export const Priority = {
  AMBIENT: 0,
  GUIDANCE: 1,
  ACTION: 2,
  RESULT: 3,
  CRITICAL: 4,
  // Backward-compatible aliases for non-Blind-Mode callers.
  LOW: 1,
  NORMAL: 2,
  HIGH: 3,
} as const;

export type PriorityLevel = typeof Priority[keyof typeof Priority];

/** Semantic scheduling classes for new blind-assistant speech. */
export const SpeechCategory = {
  CRITICAL: 'critical',
  TASK: 'task',
  REALTIME: 'realtime',
} as const;

export type SpeechCategoryValue = typeof SpeechCategory[keyof typeof SpeechCategory];

export interface SpeechOptions {
  /** Prefer this semantic category for new code; priority remains for legacy callers. */
  category?: SpeechCategoryValue;
  priority?: PriorityLevel;
  owner?: string;
  /** Groups related feature owners so mode switches can cancel only their own audio. */
  scope?: string;
  /** REALTIME messages with the same key are latest-state-wins. Defaults to owner. */
  realtimeKey?: string;
  /** Drop a queued REALTIME message after this age. Defaults to 1500ms. */
  maxAgeMs?: number;
  rate?: number;
  lang?: string;
  chunk?: boolean;
  /** Stop equal- or lower-priority speech so the newest meaningful event wins. */
  interrupt?: boolean;
  /** While this item is speaking, reject all speech from other owners. */
  exclusive?: boolean;
  /** Prevent the same owner/text (or supplied key) from being repeated. */
  dedupe?: boolean | string;
  /** Minimum interval before a deduplicated message may be spoken again. */
  cooldown?: number;
  /**
   * How this speech reacts when the user starts assistive-technology navigation.
   *
   * - `'pause-resume'` — Pause and resume after navigation idle (for long narrations).
   * - `'cancel'`        — Cancel immediately, no resume (for stale realtime guidance).
   * - `'defer'`         — Cancel if active, but keep queued items for later (default for short messages).
   */
  navigationBehavior?: 'pause-resume' | 'cancel' | 'defer';
  /** Called when the browser has actually started the utterance. */
  onStart?: () => void;
  onEnd?: (completed?: boolean) => void;
}

export interface CancelSpeechOptions {
  owner?: string;
  scope?: string;
  categories?: SpeechCategoryValue[];
  atOrBelow?: PriorityLevel;
}

export interface SpeechQueueItem {
  id: number;
  text: string;
  options: SpeechOptions;
}

export interface SpeechState {
  isSpeaking: boolean;
  owner: string | null;
  priority: number;
  category: SpeechCategoryValue | null;
  scope: string | null;
  isListeningExclusive: boolean;
}

export type SpeechStateListener = (state: SpeechState) => void;

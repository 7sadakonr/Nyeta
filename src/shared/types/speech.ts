/**
 * Type definitions for centralized SpeechManager and Speech Synthesis.
 */

export const Priority = {
  LOW: 0,      // guidance, hints
  NORMAL: 1,   // document reading, currency results
  HIGH: 2,     // AI responses, volunteer messages
  CRITICAL: 3, // errors, mode switches
} as const;

export type PriorityLevel = typeof Priority[keyof typeof Priority];

export interface SpeechOptions {
  priority?: PriorityLevel;
  owner?: string;
  rate?: number;
  lang?: string;
  chunk?: boolean;
  onEnd?: () => void;
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
}

export type SpeechStateListener = (state: SpeechState) => void;

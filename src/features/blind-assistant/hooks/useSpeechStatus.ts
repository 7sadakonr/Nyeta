'use client';

import { useSyncExternalStore } from 'react';
import speechManager from '@/shared/accessibility/speechManager';

/**
 * Custom Hook: useSpeechSpeaking
 * Subscribes to speechManager state reactively using useSyncExternalStore
 */
export function useSpeechSpeaking(owner: string | null = null): boolean {
    return useSyncExternalStore(
        (notify) => {
            if (!speechManager) return () => {};
            return speechManager.subscribe(notify);
        },
        () => {
            if (!speechManager) return false;
            if (owner) {
                return (speechManager.isSpeaking && speechManager.currentOwner === owner) ||
                    speechManager.pausedSpeechOwner === owner;
            }
            return speechManager.isSpeaking;
        },
        () => false // Server snapshot
    );
}

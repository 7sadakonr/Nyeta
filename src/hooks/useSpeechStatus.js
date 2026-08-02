'use client';

import { useSyncExternalStore } from 'react';
import speechManager from '@/lib/speechManager';

/**
 * Custom Hook: useSpeechSpeaking
 * Subscribes to speechManager state reactively using useSyncExternalStore
 * 
 * @param {string|null} [owner=null] Optional owner identifier (e.g. 'ai-assistant', 'document-reader')
 * @returns {boolean} true if currently speaking (or speaking for specified owner)
 */
export function useSpeechSpeaking(owner = null) {
    return useSyncExternalStore(
        (notify) => {
            if (!speechManager) return () => {};
            return speechManager.subscribe(notify);
        },
        () => {
            if (!speechManager) return false;
            if (owner) {
                return speechManager.isSpeaking && speechManager.currentOwner === owner;
            }
            return speechManager.isSpeaking;
        },
        () => false // Server snapshot
    );
}

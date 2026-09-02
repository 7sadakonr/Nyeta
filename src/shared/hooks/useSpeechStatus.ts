'use client';

import { useSyncExternalStore } from 'react';
import { speechController } from '@/shared/accessibility/speechController';
import type { SpeechSnapshot } from '@/shared/accessibility/speechController';

export function useSpeechStatus(): SpeechSnapshot {
    return useSyncExternalStore(
        (notify) => {
            if (!speechController) return () => {};
            return speechController.subscribe(notify);
        },
        () => speechController.getSnapshot(),
        () => ({
            state: 'idle',
            channel: null,
            isSpeaking: false,
            isListening: false,
            isQuiet: false,
        })
    );
}

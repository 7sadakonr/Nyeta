'use client';

import { useState, useEffect } from 'react';
import speechManager from '@/shared/accessibility/speechManager';

export function useSpeechStatus(): boolean {
    const [isSpeaking, setIsSpeaking] = useState<boolean>(() => speechManager?.isSpeaking ?? false);

    useEffect(() => {
        if (!speechManager) return;
        const handleStatusChange = () => {
            setIsSpeaking(speechManager?.isSpeaking ?? false);
        };

        const unsubscribe = speechManager.subscribe(handleStatusChange);
        return () => {
            if (typeof unsubscribe === 'function') {
                unsubscribe();
            }
        };
    }, []);

    return isSpeaking;
}

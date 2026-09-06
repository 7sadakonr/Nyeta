'use client';

import { useCallback, useEffect, useRef } from 'react';
import { speechController } from '@/shared/accessibility/speechController';

const BLUR_DEBOUNCE_MS = 150;

export interface ResultRegionProps {
    onFocus: (event: React.FocusEvent<HTMLElement>) => void;
    onBlur: (event: React.FocusEvent<HTMLElement>) => void;
}

export interface UseResultRegionSuppressionResult {
    resultRegionProps: ResultRegionProps;
    resetSuppression: () => void;
    isInsideResult: () => boolean;
}

/**
 * Tracks when accessibility focus is inside a result region.
 * While inside: guidance (realtime/status) TTS is suppressed.
 * When exiting: guidance is unsuppressed without resuming stopped guidance.
 * Swiping between paragraphs inside the region is debounced so guidance does not flicker on.
 */
export function useResultRegionSuppression(): UseResultRegionSuppressionResult {
    const isInsideRef = useRef(false);
    const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const clearDebounce = useCallback(() => {
        if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current);
            debounceTimerRef.current = null;
        }
    }, []);

    const handleFocus = useCallback(() => {
        clearDebounce();
        if (!isInsideRef.current) {
            isInsideRef.current = true;
            speechController.setGuidanceSuppressed(true);
        }
    }, [clearDebounce]);

    const handleBlur = useCallback((event: React.FocusEvent<HTMLElement>) => {
        const currentTarget = event.currentTarget;
        const related = event.relatedTarget as Node | null;

        // If focus moved to another child inside the same container, stay suppressed
        if (related && currentTarget.contains(related)) {
            return;
        }

        clearDebounce();
        debounceTimerRef.current = setTimeout(() => {
            debounceTimerRef.current = null;
            // Double check document.activeElement if available
            if (typeof document !== 'undefined' && currentTarget.contains(document.activeElement)) {
                return;
            }
            if (isInsideRef.current) {
                isInsideRef.current = false;
                speechController.setGuidanceSuppressed(false);
            }
        }, BLUR_DEBOUNCE_MS);
    }, [clearDebounce]);

    const resetSuppression = useCallback(() => {
        clearDebounce();
        if (isInsideRef.current) {
            isInsideRef.current = false;
            speechController.setGuidanceSuppressed(false);
        }
    }, [clearDebounce]);

    useEffect(() => {
        return () => {
            clearDebounce();
            if (isInsideRef.current) {
                isInsideRef.current = false;
                speechController.setGuidanceSuppressed(false);
            }
        };
    }, [clearDebounce]);

    return {
        resultRegionProps: {
            onFocus: handleFocus,
            onBlur: handleBlur,
        },
        resetSuppression,
        isInsideResult: () => isInsideRef.current,
    };
}

'use client';

import { useCallback, useEffect, useRef } from 'react';
import { speechController } from '@/shared/accessibility/speechController';

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
 * Tracks accessibility focus inside a result region.
 * Guidance suppression is persistent once triggered (e.g. at capture or on entering result).
 * Leaving the region (onBlur) DOES NOT unsuppress guidance.
 * Only explicit resetSuppression (e.g. Clear Chat or mode switch) unsuppresses guidance.
 */
export function useResultRegionSuppression(): UseResultRegionSuppressionResult {
    const isInsideRef = useRef(false);

    const handleFocus = useCallback(() => {
        isInsideRef.current = true;
        speechController.setGuidanceSuppressed(true);
    }, []);

    const handleBlur = useCallback((event: React.FocusEvent<HTMLElement>) => {
        const currentTarget = event.currentTarget;
        const related = event.relatedTarget as Node | null;

        if (related && currentTarget.contains(related)) {
            return;
        }

        isInsideRef.current = false;
        // Guidance suppression persists even after leaving the result region.
        // It is only unsuppressed when the user explicitly clears the chat or switches modes.
    }, []);

    const resetSuppression = useCallback(() => {
        isInsideRef.current = false;
        speechController.setGuidanceSuppressed(false);
    }, []);

    useEffect(() => {
        return () => {
            if (isInsideRef.current) {
                isInsideRef.current = false;
                speechController.setGuidanceSuppressed(false);
            }
        };
    }, []);

    return {
        resultRegionProps: {
            onFocus: handleFocus,
            onBlur: handleBlur,
        },
        resetSuppression,
        isInsideResult: () => isInsideRef.current,
    };
}

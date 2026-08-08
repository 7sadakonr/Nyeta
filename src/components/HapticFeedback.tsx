'use client';

import { forwardRef, useImperativeHandle, useCallback } from 'react';

export interface HapticFeedbackHandle {
    trigger: (times?: number, interval?: number) => Promise<void>;
    clickSwitch: () => void;
    startContinuous: () => void;
    stopContinuous: () => void;
}

export interface HapticFeedbackProps {
    id?: string;
}

/**
 * HapticFeedback Component
 * 
 * Uses Web Vibration API where supported.
 * 
 * Usage:
 * const hapticRef = useRef<HapticFeedbackHandle>(null);
 * <HapticFeedback ref={hapticRef} />
 * await hapticRef.current?.trigger(3); // vibrate 3 times
 */
const HapticFeedback = forwardRef<HapticFeedbackHandle, HapticFeedbackProps>(function HapticFeedback({ id = 'ios-haptic' }: HapticFeedbackProps, ref) {
    const trigger = useCallback(async (times: number = 1, interval: number = 80) => {
        if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
            const pattern: number[] = [];
            for (let i = 0; i < times; i++) {
                pattern.push(50); // vibrate 50ms
                if (i < times - 1) pattern.push(interval); // pause
            }
            try {
                navigator.vibrate(pattern);
            } catch (e) {
                // ignore vibration errors
            }
        }
    }, []);

    useImperativeHandle(ref, () => ({
        trigger,
        clickSwitch: () => {},
        startContinuous: () => {
            if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
                const pattern: number[] = [];
                for (let i = 0; i < 60; i++) {
                    pattern.push(200); // vibrate
                    pattern.push(300); // pause
                }
                try {
                    navigator.vibrate(pattern);
                } catch (e) {}
            }
        },
        stopContinuous: () => {
            if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
                try {
                    navigator.vibrate(0);
                } catch (e) {}
            }
        }
    }), [trigger]);

    return null;
});

export default HapticFeedback;

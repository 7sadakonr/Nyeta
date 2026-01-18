'use client';

import { forwardRef, useImperativeHandle, useRef, useCallback } from 'react';

/**
 * HapticFeedback Component
 * 
 * ใช้เทคนิค iOS 18 Switch + Label เพื่อกระตุ้น Haptic Feedback บน Safari
 * โดยการ programmatically click ที่ label จะทำให้เกิดการสั่น
 * 
 * Usage:
 * const hapticRef = useRef(null);
 * <HapticFeedback ref={hapticRef} />
 * await hapticRef.current.trigger(3); // สั่น 3 ครั้ง
 */
const HapticFeedback = forwardRef(function HapticFeedback({ id = 'ios-haptic' }, ref) {
    const labelRef = useRef(null);
    const inputRef = useRef(null);

    // ฟังก์ชันสำหรับกระตุ้นการสั่น
    const trigger = useCallback(async (times = 1, interval = 80) => {
        // สำหรับ Android: ใช้ Vibration API โดยตรง
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
            const pattern = [];
            for (let i = 0; i < times; i++) {
                pattern.push(50); // สั่น 50ms
                if (i < times - 1) pattern.push(interval); // พัก
            }
            navigator.vibrate(pattern);
        }

        // สำหรับ iOS Safari 18+: ใช้ Switch Haptic
        if (labelRef.current && inputRef.current) {
            for (let i = 0; i < times; i++) {
                // Trigger haptic by clicking the label (simulates user interaction)
                labelRef.current.click();

                if (i < times - 1) {
                    await new Promise(resolve => setTimeout(resolve, interval));
                }
            }
        }
    }, []);

    // เปิดให้ Parent Component เข้าถึง trigger function ได้
    useImperativeHandle(ref, () => ({
        trigger,
        // Direct switch click - for syncing with audio
        clickSwitch: () => {
            if (labelRef.current) {
                labelRef.current.click();
            }
        },
        // Start continuous vibration (Android only - iOS requires user gesture)
        startContinuous: () => {
            if (typeof navigator !== 'undefined' && navigator.vibrate) {
                // Create a long repeating pattern: vibrate 200ms, pause 300ms, repeat 60 times (30 seconds total)
                const pattern = [];
                for (let i = 0; i < 60; i++) {
                    pattern.push(200); // vibrate
                    pattern.push(300); // pause
                }
                navigator.vibrate(pattern);
            }

            // For iOS: Start continuous switch toggle loop
            if (labelRef.current && inputRef.current) {
                // Store interval ID on the input element for later cleanup
                if (inputRef.current._hapticInterval) {
                    clearInterval(inputRef.current._hapticInterval);
                }
                inputRef.current._hapticInterval = setInterval(() => {
                    if (labelRef.current) {
                        labelRef.current.click(); // Toggle switch = haptic
                    }
                }, 500); // Toggle every 500ms for continuous haptic feel
            }
        },
        stopContinuous: () => {
            if (typeof navigator !== 'undefined' && navigator.vibrate) {
                navigator.vibrate(0); // Stop vibration
            }

            // Stop iOS switch toggle loop
            if (inputRef.current && inputRef.current._hapticInterval) {
                clearInterval(inputRef.current._hapticInterval);
                inputRef.current._hapticInterval = null;
            }
        }
    }), [trigger]);

    return (
        <div
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                opacity: 0,
                pointerEvents: 'none',
                zIndex: -1,
                width: 0,
                height: 0,
                overflow: 'hidden'
            }}
            aria-hidden="true"
        >
            {/* iOS 18 Switch Element - ซ่อนไว้แต่ยังทำงานได้ */}
            <input
                ref={inputRef}
                type="checkbox"
                id={id}
                // @ts-ignore - switch attribute is non-standard but supported in iOS 18 Safari
                switch=""
                tabIndex={-1}
                aria-hidden="true"
                style={{ opacity: 0, pointerEvents: 'none' }}
            />
            <label ref={labelRef} htmlFor={id} />
        </div>
    );
});

export default HapticFeedback;

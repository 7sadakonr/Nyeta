'use client';

import { forwardRef, useImperativeHandle, useCallback } from 'react';

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
    // ฟังก์ชันสำหรับกระตุ้นการสั่น (ใช้ Web Vibration API บนอุปกรณ์ที่รองรับ)
    const trigger = useCallback(async (times = 1, interval = 80) => {
        if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
            const pattern = [];
            for (let i = 0; i < times; i++) {
                pattern.push(50); // สั่น 50ms
                if (i < times - 1) pattern.push(interval); // พัก
            }
            try {
                navigator.vibrate(pattern);
            } catch (e) {
                // ignore vibration errors
            }
        }
    }, []);

    // เปิดให้ Parent Component เข้าถึง trigger function ได้อย่างปลอดภัย
    useImperativeHandle(ref, () => ({
        trigger,
        clickSwitch: () => {},
        startContinuous: () => {
            if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
                const pattern = [];
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

    // Return null เพื่อป้องกันไม่ให้มี input switch หลุดเข้าไปใน DOM
    // ซึ่งจะทำให้ VoiceOver / TalkBack อ่านออกเสียงว่า "switch off" หรือ "สวิตช์ ปิด"
    return null;
});

export default HapticFeedback;

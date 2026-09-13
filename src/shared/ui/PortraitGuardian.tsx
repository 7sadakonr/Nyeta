'use client';

import { useEffect, useRef, useState } from 'react';
import { speechController } from '@/shared/accessibility/speechController';
import { playEarcon } from '@/shared/accessibility/audio';

const ORIENTATION_SPEECH_DEBOUNCE_MS = 600;

/**
 * PortraitGuardian
 *
 * Enforces portrait orientation on mobile devices by displaying an accessible
 * blocking screen and triggering spoken and audio feedback when rotated horizontally.
 */
export default function PortraitGuardian() {
    const [isLandscape, setIsLandscape] = useState(false);
    const announceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const handleTouchInteraction = () => {
        speechController.stop();
        speechController.notifyUserNavigation();
    };

    useEffect(() => {
        if (typeof window === 'undefined') return;

        const checkOrientation = () => {
            const isTouch = Boolean('ontouchstart' in window || (navigator.maxTouchPoints && navigator.maxTouchPoints > 0));
            const isHorizontal = window.innerWidth > window.innerHeight;
            const isPhoneHeight = window.innerHeight <= 600;

            const landscapeDetected: boolean = Boolean(isHorizontal && isPhoneHeight && isTouch);
            setIsLandscape((prev) => {
                if (!prev && landscapeDetected) {
                    speechController.setOrientationBlocked(true);
                    playEarcon('error');

                    // Debounce speech so iOS VoiceOver's native system announcement ("Landscape") finishes first
                    if (announceTimerRef.current) {
                        clearTimeout(announceTimerRef.current);
                    }
                    announceTimerRef.current = setTimeout(() => {
                        speechController.speak('กรุณาหมุนโทรศัพท์เป็นแนวตั้ง', { channel: 'critical' });
                    }, ORIENTATION_SPEECH_DEBOUNCE_MS);
                } else if (prev && !landscapeDetected) {
                    if (announceTimerRef.current) {
                        clearTimeout(announceTimerRef.current);
                        announceTimerRef.current = null;
                    }
                    speechController.setOrientationBlocked(false);
                    speechController.stop();
                }
                return landscapeDetected;
            });
        };

        checkOrientation();

        const mediaQuery = window.matchMedia('(orientation: landscape) and (max-height: 600px)');
        const handleMediaChange = () => checkOrientation();

        if (mediaQuery.addEventListener) {
            mediaQuery.addEventListener('change', handleMediaChange);
        } else {
            mediaQuery.addListener(handleMediaChange);
        }

        window.addEventListener('resize', checkOrientation);
        window.addEventListener('orientationchange', checkOrientation);

        return () => {
            if (announceTimerRef.current) {
                clearTimeout(announceTimerRef.current);
                announceTimerRef.current = null;
            }
            speechController.setOrientationBlocked(false);
            speechController.stop();

            if (mediaQuery.removeEventListener) {
                mediaQuery.removeEventListener('change', handleMediaChange);
            } else {
                mediaQuery.removeListener(handleMediaChange);
            }
            window.removeEventListener('resize', checkOrientation);
            window.removeEventListener('orientationchange', checkOrientation);
        };
    }, []);

    return (
        <aside
            aria-modal="true"
            aria-label="แจ้งเตือนการใช้งานในแนวตั้ง"
            onPointerDownCapture={handleTouchInteraction}
            onTouchStartCapture={handleTouchInteraction}
            onFocusCapture={handleTouchInteraction}
            className={`${isLandscape ? 'flex' : 'hidden'} portrait-guardian-auto fixed inset-0 z-[99999] flex-col items-center justify-center bg-[#090909] px-6 text-center text-white select-none backdrop-blur-md`}
        >
            <div className="mb-6 flex size-20 items-center justify-center rounded-3xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="44"
                    height="44"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="animate-pulse"
                    aria-hidden="true"
                >
                    <rect width="14" height="20" x="5" y="2" rx="2" ry="2" />
                    <path d="M12 18h.01" />
                </svg>
            </div>

            <h1 className="text-2xl font-bold tracking-tight text-white mb-2">
                กรุณาหมุนโทรศัพท์เป็นแนวตั้ง
            </h1>
            <p className="text-base text-gray-300 max-w-sm leading-relaxed mb-2">
                ระบบ Nyeta ใช้งานได้เฉพาะในแนวตั้งเท่านั้น
            </p>
            <p className="text-xs text-gray-500 tracking-wide">
                Please rotate your device back to portrait mode
            </p>
        </aside>
    );
}

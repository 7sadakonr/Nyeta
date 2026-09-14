/**
 * Cached iOS platform detection.
 * True on iPhone / iPad / iPod running Safari or Home Screen PWA.
 * Excludes Chrome-on-iOS (CriOS) and Firefox-on-iOS (FxiOS) which
 * have their own media handling.
 */
export const isIOSPlatform: boolean =
    typeof navigator !== 'undefined' &&
    /iPhone|iPad|iPod/i.test(navigator.userAgent) &&
    !navigator.userAgent.includes('CriOS') &&
    !navigator.userAgent.includes('FxiOS');

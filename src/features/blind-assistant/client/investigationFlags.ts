'use client';

export const IOS27_DIAGNOSTICS_ENABLED =
    process.env.NEXT_PUBLIC_IOS27_DIAGNOSTICS === '1' ||
    process.env.NODE_ENV !== 'production';

function getUrlParam(key: string): string | null {
    if (!IOS27_DIAGNOSTICS_ENABLED || typeof window === 'undefined') return null;
    try {
        return new URLSearchParams(window.location.search).get(key);
    } catch {
        return null;
    }
}

/** Phase 3: Disable object guidance TTS only. COCO & targeting still run. */
export function isObjectTtsDisabled(): boolean {
    return getUrlParam('objectTts') === 'off';
}

/** Phase 6: Disable COCO-SSD entirely. Camera-only mode. */
export function isObjectDetectionDisabled(): boolean {
    return getUrlParam('objectDetection') === 'off';
}

/** Phase 4–5: Manual speech test mode.
 *  Values: 'speak' | 'resume-speak' | 'voice' | 'cancel-only' | 'cancel-delay-speak' */
export function getSpeechTestMode(): string | null {
    return getUrlParam('speechTest');
}

/** Phase 7: Force TFJS backend. Values: 'cpu' | 'webgl' */
export function getTfjsBackendOverride(): string | null {
    return getUrlParam('tfjsBackend');
}

/** Phase 8: Force model.detect directly on video (skip canvas drawImage). */
export function isCanvasDetectDisabled(): boolean {
    return getUrlParam('canvasDetect') === 'off';
}

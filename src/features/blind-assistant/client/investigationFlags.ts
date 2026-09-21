'use client';

/**
 * Checks whether diagnostics / investigation tools should be active.
 * Active if:
 * 1. Environment variable NEXT_PUBLIC_IOS27_DIAGNOSTICS is '1'
 * 2. Development / Test mode (NODE_ENV !== 'production')
 * 3. Any diagnostic query parameter is present (?diag=1, ?objectTts=off, etc.)
 * 4. localStorage.getItem('ios27_diag') is '1'
 */
export function isDiagnosticsEnabled(): boolean {
    if (process.env.NEXT_PUBLIC_IOS27_DIAGNOSTICS === '1') return true;
    if (process.env.NODE_ENV !== 'production') return true;
    if (typeof window !== 'undefined') {
        try {
            const search = window.location.search;
            if (search) {
                const params = new URLSearchParams(search);
                if (
                    params.get('diag') === '1' ||
                    params.has('objectTts') ||
                    params.has('objectDetection') ||
                    params.has('speechTest') ||
                    params.has('tfjsBackend') ||
                    params.has('canvasDetect') ||
                    params.get('debug') === '1'
                ) {
                    return true;
                }
            }
            if (window.localStorage?.getItem('ios27_diag') === '1') {
                return true;
            }
        } catch {
            return false;
        }
    }
    return false;
}

export const IOS27_DIAGNOSTICS_ENABLED =
    process.env.NEXT_PUBLIC_IOS27_DIAGNOSTICS === '1' ||
    process.env.NODE_ENV !== 'production';

function getUrlParam(key: string): string | null {
    if (typeof window === 'undefined') return null;
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

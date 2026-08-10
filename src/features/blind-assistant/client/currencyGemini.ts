import { callGeminiVision } from '@/features/blind-assistant/client/geminiVision';
import { parseCurrencyResult, CurrencyScanResult } from '@/features/blind-assistant/client/currencyUtils';
import { getCurrencyScanRegion } from '@/features/blind-assistant/client/videoCoords';
import { BoundingBox } from '@/features/blind-assistant/types/assistant';

interface CaptureFrameOptions { cropRegion?: BoundingBox | null; maxDimension?: number; quality?: number; }
interface FrameCaptureResult { imageDataUrl: string; isBlocked: boolean; }

function captureFrameWithOcclusionCheck(video: HTMLVideoElement | null, options: CaptureFrameOptions = {}): FrameCaptureResult | null {
    if (!video || video.readyState < 2) return null;
    const { cropRegion, maxDimension = 768, quality = 0.72 } = options;
    const srcW = video.videoWidth || 1280;
    const srcH = video.videoHeight || 720;
    const sx = cropRegion ? Math.max(0, Math.round(cropRegion.x)) : 0;
    const sy = cropRegion ? Math.max(0, Math.round(cropRegion.y)) : 0;
    const sw = cropRegion ? Math.min(srcW - sx, Math.round(cropRegion.width)) : srcW;
    const sh = cropRegion ? Math.min(srcH - sy, Math.round(cropRegion.height)) : srcH;
    const scale = Math.min(1, maxDimension / Math.max(sw, sh));
    const dw = Math.round(sw * scale);
    const dh = Math.round(sh * scale);
    const canvas = document.createElement('canvas');
    canvas.width = dw; canvas.height = dh;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, dw, dh);
    let isBlocked = false;
    try {
        const data = ctx.getImageData(0, 0, dw, dh).data;
        let total = 0; let samples = 0;
        for (let i = 0; i < data.length; i += 64) { total += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]; samples++; }
        isBlocked = samples > 0 && total / samples < 12;
    } catch { /* Pixel reads are not supported by every browser context. */ }
    return { imageDataUrl: canvas.toDataURL('image/jpeg', quality), isBlocked };
}

export interface DetectCurrencyResult { result: CurrencyScanResult; rawText: string; }

/** Capture one user-requested frame and identify every supported Thai currency item in it. */
export async function detectCurrencyWithGemini(video: HTMLVideoElement | null, options: { signal?: AbortSignal } = {}): Promise<DetectCurrencyResult> {
    const frame = captureFrameWithOcclusionCheck(video, { cropRegion: video ? getCurrencyScanRegion(video) : null });
    if (!frame) return { result: { status: 'invalid' }, rawText: '' };
    if (frame.isBlocked) return { result: { status: 'blocked' }, rawText: 'โดนบัง' };
    const text = await callGeminiVision({
        mode: 'currency', imageDataUrl: frame.imageDataUrl,
        userPrompt: 'ตรวจนับธนบัตรและเหรียญบาทไทยทุกชิ้นในภาพตามรูปแบบ JSON ที่กำหนด',
        maxTokens: 512, temperature: 0, signal: options.signal,
    });
    return { result: parseCurrencyResult(text), rawText: text.trim() };
}
export type CurrencyFrameQuality = 'usable' | 'invalid' | 'blocked' | 'too_dark' | 'too_bright';
export interface CurrencyFrameAnalysis {
    quality: CurrencyFrameQuality;
    fingerprint: Uint8Array | null;
}

const ANALYSIS_MAX_DIMENSION = 64;
const FINGERPRINT_COLUMNS = 16;
const FINGERPRINT_ROWS = 12;

/** Performs a cheap, low-resolution quality check over the currency scan region. */
export function analyzeCurrencyFrame(video: HTMLVideoElement | null, reusableCanvas?: HTMLCanvasElement | null): CurrencyFrameAnalysis {
    if (!video || video.readyState < 2 || !video.videoWidth || !video.videoHeight) return { quality: 'invalid', fingerprint: null };

    const cropRegion = getCurrencyScanRegion(video);
    const srcW = video.videoWidth;
    const srcH = video.videoHeight;
    const sx = cropRegion ? Math.max(0, Math.round(cropRegion.x)) : 0;
    const sy = cropRegion ? Math.max(0, Math.round(cropRegion.y)) : 0;
    const sw = cropRegion ? Math.min(srcW - sx, Math.round(cropRegion.width)) : srcW;
    const sh = cropRegion ? Math.min(srcH - sy, Math.round(cropRegion.height)) : srcH;
    if (sw <= 0 || sh <= 0) return { quality: 'invalid', fingerprint: null };

    const scale = Math.min(1, ANALYSIS_MAX_DIMENSION / Math.max(sw, sh));
    const dw = Math.max(1, Math.round(sw * scale));
    const dh = Math.max(1, Math.round(sh * scale));
    const canvas = reusableCanvas || document.createElement('canvas');
    canvas.width = dw;
    canvas.height = dh;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return { quality: 'invalid', fingerprint: null };

    try {
        ctx.drawImage(video, sx, sy, sw, sh, 0, 0, dw, dh);
        const data = ctx.getImageData(0, 0, dw, dh).data;
        if (!data.length) return { quality: 'invalid', fingerprint: null };

        let totalLuma = 0;
        let nearBlack = 0;
        const pixelCount = dw * dh;
        for (let i = 0; i < data.length; i += 4) {
            const luma = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
            totalLuma += luma;
            if (luma < 20) nearBlack += 1;
        }
        const meanLuma = totalLuma / pixelCount;

        const fingerprint = new Uint8Array(FINGERPRINT_COLUMNS * FINGERPRINT_ROWS);
        for (let row = 0; row < FINGERPRINT_ROWS; row += 1) {
            for (let col = 0; col < FINGERPRINT_COLUMNS; col += 1) {
                const x = Math.min(dw - 1, Math.floor((col + 0.5) * dw / FINGERPRINT_COLUMNS));
                const y = Math.min(dh - 1, Math.floor((row + 0.5) * dh / FINGERPRINT_ROWS));
                const offset = (y * dw + x) * 4;
                fingerprint[row * FINGERPRINT_COLUMNS + col] = Math.round(0.299 * data[offset] + 0.587 * data[offset + 1] + 0.114 * data[offset + 2]);
            }
        }

        if (meanLuma < 12 || nearBlack / pixelCount > 0.9) return { quality: 'blocked', fingerprint };
        if (meanLuma < 30) return { quality: 'too_dark', fingerprint };
        if (meanLuma > 245) return { quality: 'too_bright', fingerprint };
        return { quality: 'usable', fingerprint };
    } catch {
        return { quality: 'invalid', fingerprint: null };
    }
}

export function hasCurrencySceneChanged(previous: Uint8Array | null, current: Uint8Array | null, threshold = 10): boolean {
    if (!previous || !current || previous.length !== current.length) return true;
    let difference = 0;
    for (let index = 0; index < previous.length; index += 1) difference += Math.abs(previous[index] - current[index]);
    return difference / previous.length >= threshold;
}

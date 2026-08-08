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
export async function detectCurrencyWithGemini(video: HTMLVideoElement | null): Promise<DetectCurrencyResult> {
    const frame = captureFrameWithOcclusionCheck(video, { cropRegion: video ? getCurrencyScanRegion(video) : null });
    if (!frame) return { result: { status: 'invalid' }, rawText: '' };
    if (frame.isBlocked) return { result: { status: 'blocked' }, rawText: 'โดนบัง' };
    const text = await callGeminiVision({
        mode: 'currency', imageDataUrl: frame.imageDataUrl,
        userPrompt: 'ตรวจนับธนบัตรและเหรียญบาทไทยทุกชิ้นในภาพตามรูปแบบ JSON ที่กำหนด',
        maxTokens: 512, temperature: 0,
    });
    return { result: parseCurrencyResult(text), rawText: text.trim() };
}
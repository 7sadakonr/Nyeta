import { callGeminiVision } from '@/features/blind-assistant/client/geminiVision';
import { parseCurrencyResult, ParsedCurrency } from '@/features/blind-assistant/client/currencyUtils';
import { getCurrencyScanRegion } from '@/features/blind-assistant/client/videoCoords';
import { BoundingBox } from '@/features/blind-assistant/types/assistant';

interface CaptureFrameOptions {
    cropRegion?: BoundingBox | null;
    maxDimension?: number;
    quality?: number;
}

interface FrameCaptureResult {
    imageDataUrl: string;
    isBlocked: boolean;
}

/**
 * Capture frame from video and check if it's pitch black / blocked.
 */
function captureFrameWithOcclusionCheck(
    video: HTMLVideoElement | null,
    options: CaptureFrameOptions = {}
): FrameCaptureResult | null {
    if (!video || video.readyState < 2) return null;
    const { cropRegion, maxDimension = 768, quality = 0.72 } = options;

    const srcW = video.videoWidth || 1280;
    const srcH = video.videoHeight || 720;

    let sx = 0;
    let sy = 0;
    let sw = srcW;
    let sh = srcH;

    if (cropRegion) {
        sx = Math.max(0, Math.round(cropRegion.x));
        sy = Math.max(0, Math.round(cropRegion.y));
        sw = Math.min(srcW - sx, Math.round(cropRegion.width));
        sh = Math.min(srcH - sy, Math.round(cropRegion.height));
    }

    let dw = sw;
    let dh = sh;
    const longest = Math.max(dw, dh);
    if (longest > maxDimension) {
        const scale = maxDimension / longest;
        dw = Math.round(dw * scale);
        dh = Math.round(dh * scale);
    }

    const canvas = document.createElement('canvas');
    canvas.width = dw;
    canvas.height = dh;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, dw, dh);

    let isBlocked = false;
    try {
        const imgData = ctx.getImageData(0, 0, dw, dh);
        const data = imgData.data;
        let totalLuma = 0;
        const step = 4 * 16;
        let samples = 0;
        for (let i = 0; i < data.length; i += step) {
            const luma = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
            totalLuma += luma;
            samples++;
        }
        const avgLuma = samples > 0 ? totalLuma / samples : 0;
        if (avgLuma < 12) {
            isBlocked = true;
        }
    } catch {
        // Fallback gracefully if pixel read is unsupported
    }

    const imageBase64 = canvas.toDataURL('image/jpeg', quality).split(',')[1];
    return {
        imageDataUrl: `data:image/jpeg;base64,${imageBase64}`,
        isBlocked,
    };
}

export interface DetectCurrencyResult {
    parsed: ParsedCurrency | null;
    rawText: string;
    isBlocked?: boolean;
}

/**
 * Identify Thai banknote or coin via Gemini vision, with fast blockage detection.
 */
export async function detectCurrencyWithGemini(video: HTMLVideoElement | null): Promise<DetectCurrencyResult> {
    const cropRegion = video ? getCurrencyScanRegion(video) : null;
    const frameResult = captureFrameWithOcclusionCheck(video, {
        cropRegion,
        maxDimension: 768,
        quality: 0.72,
    });

    if (!frameResult) {
        return { parsed: null, rawText: '', isBlocked: false };
    }

    // Fast-path: client-side frame darkness / covered camera detection
    if (frameResult.isBlocked) {
        return {
            parsed: { type: 'blocked', isBlocked: true },
            rawText: 'โดนบัง',
            isBlocked: true,
        };
    }

    const text = await callGeminiVision({
        mode: 'currency',
        imageDataUrl: frameResult.imageDataUrl,
        userPrompt: 'ระบุธนบัตรหรือเหรียญเงินบาทไทยในภาพนี้',
        maxTokens: 32,
        temperature: 0,
    });

    const parsed = parseCurrencyResult(text);
    const isBlocked = parsed?.isBlocked || parsed?.type === 'blocked';

    return {
        parsed,
        rawText: text?.trim() || '',
        isBlocked,
    };
}

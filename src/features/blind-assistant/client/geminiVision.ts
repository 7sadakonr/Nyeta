import { BlindMode, BoundingBox } from '@/features/blind-assistant/types/assistant';
import { getVisibleVideoRegion } from './videoCoords';

export const GEMINI_MODEL = 'gemini-3.1-flash-lite';

// The server may retry transient upstream failures, so allow longer than a single upstream attempt.
const DEFAULT_REQUEST_TIMEOUT_MS = 55000;

export interface GeminiCandidatePart {
    text?: string;
    thought?: boolean;
}

export interface GeminiResponseData {
    candidates?: Array<{
        content?: {
            parts?: GeminiCandidatePart[];
        };
    }>;
    error?: {
        message?: string;
    };
}

/**
 * Extract plain text response from Gemini API JSON, safely ignoring thought parts.
 */
export function extractGeminiText(data: GeminiResponseData | null | undefined): string {
    const candidate = data?.candidates?.[0];
    if (!candidate?.content?.parts) return '';

    const textParts = candidate.content.parts
        .filter(part => !part.thought && typeof part.text === 'string')
        .map(part => part.text!);

    if (textParts.length > 0) {
        return textParts.join('\n').trim();
    }

    const fallbackParts = candidate.content.parts
        .filter(part => typeof part.text === 'string')
        .map(part => part.text!);

    return fallbackParts.join('\n').trim();
}

export type GeminiErrorKind = 'offline' | 'busy' | 'rate_limited' | 'timeout' | 'server';

/** A failed Gemini request, classified so the UI can tell the user what actually went wrong. */
export class GeminiRequestError extends Error {
    readonly kind: GeminiErrorKind;
    readonly status?: number;

    constructor(kind: GeminiErrorKind, message: string, status?: number) {
        super(message);
        this.name = 'GeminiRequestError';
        this.kind = kind;
        this.status = status;
    }
}

const GEMINI_ERROR_MESSAGES: Record<GeminiErrorKind, string> = {
    offline: 'ไม่มีอินเทอร์เน็ต ตรวจสอบการเชื่อมต่อแล้วลองใหม่ครับ',
    busy: 'ระบบ AI ยุ่งอยู่ กรุณาลองใหม่อีกครั้งครับ',
    rate_limited: 'ระบบยุ่งมาก กรุณารอ 30 วินาทีแล้วลองใหม่ครับ',
    timeout: 'ใช้เวลานานเกินไป กรุณาลองใหม่ครับ',
    server: 'ระบบขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้งครับ',
};

/** Thai, user-facing description of a failed Gemini request. Only claims "no internet" when that is the cause. */
export function describeGeminiError(error: unknown): string {
    if (error instanceof GeminiRequestError) return GEMINI_ERROR_MESSAGES[error.kind];
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return GEMINI_ERROR_MESSAGES.offline;
    return GEMINI_ERROR_MESSAGES.server;
}

export function isAbortError(error: unknown): boolean {
    return error instanceof Error && error.name === 'AbortError';
}

function statusToKind(status: number): GeminiErrorKind {
    if (status === 429) return 'rate_limited';
    if (status === 503) return 'busy';
    if (status === 504 || status === 408) return 'timeout';
    return 'server';
}

export interface CallGeminiVisionParams {
    mode?: BlindMode;
    userPrompt?: string;
    imageDataUrl?: string | null;
    contents?: any[];
    maxTokens?: number;
    temperature?: number;
    signal?: AbortSignal;
}

/**
 * Call serverless Gemini vision endpoint. Server attaches prompt based on mode.
 */
export async function callGeminiVision({
    mode = 'assistant',
    userPrompt,
    imageDataUrl,
    contents,
    maxTokens = 800,
    temperature = 0.4,
    signal,
}: CallGeminiVisionParams = {}): Promise<string> {
    let base64Data: string | null = null;
    let mimeType = 'image/jpeg';

    if (imageDataUrl) {
        base64Data = imageDataUrl.includes(',') ? imageDataUrl.split(',')[1] : imageDataUrl;
        const mimeMatch = imageDataUrl.match(/^data:([^;]+);base64,/);
        if (mimeMatch) {
            mimeType = mimeMatch[1];
        }
    }

    let response: Response;
    try {
        response = await fetch('/api/gemini', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: signal || (typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(DEFAULT_REQUEST_TIMEOUT_MS) : undefined),
            body: JSON.stringify({
                mode,
                userPrompt,
                imageBase64: base64Data,
                mimeType,
                contents,
                maxTokens,
                temperature,
            }),
        });
    } catch (error: unknown) {
        // Caller-initiated cancellation is passed through untouched so callers can ignore it.
        if (isAbortError(error)) throw error;
        if (error instanceof Error && error.name === 'TimeoutError') {
            throw new GeminiRequestError('timeout', 'Gemini request timed out');
        }
        throw new GeminiRequestError('offline', error instanceof Error ? error.message : 'Network request failed');
    }

    const data = (await response.json().catch(() => null)) as GeminiResponseData | null;

    if (!response.ok) {
        const message = data?.error?.message || `Gemini HTTP ${response.status}`;
        throw new GeminiRequestError(statusToKind(response.status), message, response.status);
    }
    if (!data) {
        throw new GeminiRequestError('server', 'Gemini response was not valid JSON', response.status);
    }

    return extractGeminiText(data);
}

export interface CaptureFrameOptions {
    container?: HTMLElement | null;
    cropRegion?: BoundingBox | null;
    maxDimension?: number;
    quality?: number;
}

function renderFrameToCanvas(video: HTMLVideoElement | null, options: CaptureFrameOptions = {}): HTMLCanvasElement | null {
    if (!video || video.readyState < 2) return null;
    const { container, cropRegion, maxDimension = 1024 } = options;

    const srcW = video.videoWidth || 1280;
    const srcH = video.videoHeight || 720;

    const visibleRegion = container ? getVisibleVideoRegion(video, container) : null;
    const targetRegion = cropRegion || visibleRegion;

    let sx = 0;
    let sy = 0;
    let sw = srcW;
    let sh = srcH;

    if (targetRegion) {
        sx = Math.max(0, Math.round(targetRegion.x));
        sy = Math.max(0, Math.round(targetRegion.y));
        sw = Math.min(srcW - sx, Math.round(targetRegion.width));
        sh = Math.min(srcH - sy, Math.round(targetRegion.height));
    }
    if (sw <= 0 || sh <= 0) return null;

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
    return canvas;
}

function canvasToJpegDataUrl(canvas: HTMLCanvasElement, quality: number): string {
    const imageBase64 = canvas.toDataURL('image/jpeg', quality).split(',')[1];
    return `data:image/jpeg;base64,${imageBase64}`;
}

/**
 * Capture a frame from video, optionally cropping and downscaling for API limits.
 */
export function captureFrameFromVideo(
    video: HTMLVideoElement | null,
    options: CaptureFrameOptions = {}
): string | null {
    const canvas = renderFrameToCanvas(video, options);
    if (!canvas) return null;
    return canvasToJpegDataUrl(canvas, options.quality ?? 0.75);
}

const SHARPNESS_SAMPLE_SIZE = 256;

/**
 * Focus measure: variance of a Laplacian over a small grayscale copy of the canvas.
 * Higher means sharper. Returns 0 when pixels cannot be read.
 */
export function estimateSharpness(canvas: HTMLCanvasElement): number {
    const scale = Math.min(1, SHARPNESS_SAMPLE_SIZE / Math.max(canvas.width, canvas.height));
    const w = Math.max(3, Math.round(canvas.width * scale));
    const h = Math.max(3, Math.round(canvas.height * scale));
    const sample = document.createElement('canvas');
    sample.width = w;
    sample.height = h;
    const ctx = sample.getContext('2d', { willReadFrequently: true });
    if (!ctx) return 0;

    try {
        ctx.drawImage(canvas, 0, 0, w, h);
        const data = ctx.getImageData(0, 0, w, h).data;
        return laplacianVariance(data, w, h);
    } catch {
        return 0;
    }
}

/** Variance of the 4-neighbour Laplacian over RGBA pixel data. Exported for tests. */
export function laplacianVariance(rgba: ArrayLike<number>, w: number, h: number): number {
    const gray = new Float32Array(w * h);
    for (let i = 0; i < w * h; i += 1) {
        gray[i] = 0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2];
    }

    let sum = 0;
    let sumSq = 0;
    let count = 0;
    for (let y = 1; y < h - 1; y += 1) {
        for (let x = 1; x < w - 1; x += 1) {
            const i = y * w + x;
            const lap = gray[i - 1] + gray[i + 1] + gray[i - w] + gray[i + w] - 4 * gray[i];
            sum += lap;
            sumSq += lap * lap;
            count += 1;
        }
    }
    if (count === 0) return 0;
    const mean = sum / count;
    return sumSq / count - mean * mean;
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Capture several frames a short time apart and return the sharpest one.
 * A hand-held phone blurs often, and OCR quality depends heavily on focus.
 */
export async function captureSharpestFrame(
    video: HTMLVideoElement | null,
    options: CaptureFrameOptions = {},
    frames = 3,
    intervalMs = 120,
): Promise<string | null> {
    let best: { canvas: HTMLCanvasElement; score: number } | null = null;
    for (let index = 0; index < frames; index += 1) {
        if (index > 0) await wait(intervalMs);
        const canvas = renderFrameToCanvas(video, options);
        if (!canvas) continue;
        const score = estimateSharpness(canvas);
        if (!best || score > best.score) best = { canvas, score };
    }
    return best ? canvasToJpegDataUrl(best.canvas, options.quality ?? 0.75) : null;
}

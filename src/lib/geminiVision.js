export const GEMINI_MODEL = 'gemini-3.1-flash-lite';

/**
 * Extract plain text response from Gemini API JSON, safely ignoring thought parts.
 * @param {Object} data - Raw response from Gemini API
 * @returns {string} Cleaned response text
 */
export function extractGeminiText(data) {
    const candidate = data?.candidates?.[0];
    if (!candidate?.content?.parts) return '';

    const textParts = candidate.content.parts
        .filter(part => !part.thought && typeof part.text === 'string')
        .map(part => part.text);

    if (textParts.length > 0) {
        return textParts.join('\n').trim();
    }

    const fallbackParts = candidate.content.parts
        .filter(part => typeof part.text === 'string')
        .map(part => part.text);

    return fallbackParts.join('\n').trim();
}

/**
 * Call serverless Gemini vision endpoint. Server attaches prompt based on mode.
 * @param {Object} params
 * @param {'assistant' | 'currency' | 'reader'} [params.mode='assistant'] - Assistant mode
 * @param {string} [params.userPrompt] - Optional query
 * @param {string} [params.imageDataUrl] - Captured frame data URL
 * @param {Array} [params.contents] - Multi-turn conversation contents
 * @param {number} [params.maxTokens=800] - Token limit (clamped server-side)
 * @param {number} [params.temperature=0.4] - Generation temperature
 * @param {AbortSignal} [params.signal] - Optional abort signal
 * @returns {Promise<string>} Text output from Gemini
 */
export async function callGeminiVision({
    mode = 'assistant',
    userPrompt,
    imageDataUrl,
    contents,
    maxTokens = 800,
    temperature = 0.4,
    signal,
} = {}) {
    let base64Data = null;
    let mimeType = 'image/jpeg';

    if (imageDataUrl) {
        base64Data = imageDataUrl.includes(',') ? imageDataUrl.split(',')[1] : imageDataUrl;
        const mimeMatch = imageDataUrl.match(/^data:([^;]+);base64,/);
        if (mimeMatch) {
            mimeType = mimeMatch[1];
        }
    }

    const response = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: signal || (typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(35000) : undefined),
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

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        const message = data.error?.message || `Gemini HTTP ${response.status}`;
        throw new Error(message);
    }

    return extractGeminiText(data);
}

/**
 * Capture a frame from video, optionally cropping and downscaling for API limits.
 * @param {HTMLVideoElement} video
 * @param {{ cropRegion?: { x: number, y: number, width: number, height: number }, maxDimension?: number, quality?: number }} [options]
 */
export function captureFrameFromVideo(video, options = {}) {
    if (!video || video.readyState < 2) return null;
    const { cropRegion, maxDimension = 1024, quality = 0.75 } = options;

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
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, dw, dh);
    const imageBase64 = canvas.toDataURL('image/jpeg', quality).split(',')[1];
    return `data:image/jpeg;base64,${imageBase64}`;
}

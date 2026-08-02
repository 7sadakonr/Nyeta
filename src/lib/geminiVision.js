export const GEMINI_MODEL = 'gemini-3.1-flash-lite';

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

export async function callGeminiVision({
    apiKey,
    imageDataUrl,
    systemPrompt,
    userPrompt,
    maxTokens = 500,
    temperature = 0,
    signal,
}) {
    if (!imageDataUrl) {
        throw new Error('Image data is missing or camera is not ready');
    }
    const base64Data = imageDataUrl.split(',')[1];
    const mimeType = imageDataUrl.split(';')[0].split(':')[1] || 'image/jpeg';

    const response = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: signal || (typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(35000) : undefined),
        body: JSON.stringify({
            systemPrompt,
            userPrompt,
            imageBase64: base64Data,
            mimeType,
            maxTokens,
            temperature,
        })
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

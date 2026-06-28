export const GROQ_MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct';

export async function callGroqVision({
    apiKey,
    imageDataUrl,
    systemPrompt,
    userPrompt,
    maxTokens = 500,
    temperature = 0,
}) {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: GROQ_MODEL,
            messages: [
                { role: 'system', content: systemPrompt },
                {
                    role: 'user',
                    content: [
                        { type: 'text', text: userPrompt },
                        { type: 'image_url', image_url: { url: imageDataUrl } },
                    ],
                },
            ],
            max_tokens: maxTokens,
            temperature,
        }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        const message = data.error?.message || `Groq HTTP ${response.status}`;
        const err = new Error(message);
        err.status = response.status;
        throw err;
    }

    if (data.error) {
        const err = new Error(data.error.message || 'Groq API error');
        err.status = data.error.code;
        throw err;
    }

    return data.choices?.[0]?.message?.content?.trim() || '';
}

/**
 * Capture a frame from video, optionally cropping and downscaling for API limits.
 * @param {HTMLVideoElement} video
 * @param {{ cropRegion?: { x: number, y: number, width: number, height: number }, maxDimension?: number, quality?: number }} [options]
 */
export function captureFrameFromVideo(video, options = {}) {
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

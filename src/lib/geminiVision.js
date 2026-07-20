export const GEMINI_MODEL = 'gemini-3.1-flash-lite';

export async function callGeminiVision({
    apiKey,
    imageDataUrl,
    systemPrompt,
    userPrompt,
    maxTokens = 500,
    temperature = 0,
}) {
    const base64Data = imageDataUrl.split(',')[1];
    const mimeType = imageDataUrl.split(';')[0].split(':')[1] || 'image/jpeg';

    const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                systemInstruction: {
                    parts: [{ text: systemPrompt }]
                },
                contents: [
                    {
                        role: 'user',
                        parts: [
                            { text: userPrompt },
                            {
                                inlineData: {
                                    mimeType: mimeType,
                                    data: base64Data
                                }
                            }
                        ]
                    }
                ],
                generationConfig: {
                    maxOutputTokens: maxTokens,
                    temperature: temperature,
                }
            })
        }
    );

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        const message = data.error?.message || `Gemini HTTP ${response.status}`;
        throw new Error(message);
    }

    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
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

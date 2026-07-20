import { callGeminiVision, captureFrameFromVideo } from '@/lib/geminiVision';
import { parseCurrencyResult } from '@/lib/currencyUtils';
import { getCurrencyScanRegion } from '@/lib/videoCoords';
import { CURRENCY_PROMPT } from '@/lib/visionPrompts';

/**
 * Identify Thai banknote or coin via Gemini vision.
 * @param {HTMLVideoElement} video
 * @param {string} apiKey
 * @returns {Promise<{ parsed: { type: 'note'|'coin', value: number } | null, rawText: string }>}
 */
export async function detectCurrencyWithGemini(video, apiKey) {
    if (!apiKey) {
        throw new Error('Gemini API key missing');
    }

    const cropRegion = getCurrencyScanRegion(video);
    const imageDataUrl = captureFrameFromVideo(video, {
        cropRegion,
        maxDimension: 768,
        quality: 0.72,
    });
    const text = await callGeminiVision({
        apiKey,
        imageDataUrl,
        systemPrompt: CURRENCY_PROMPT,
        userPrompt: 'ระบุธนบัตรหรือเหรียญเงินบาทไทยในภาพนี้',
        maxTokens: 32,
        temperature: 0,
    });

    const parsed = parseCurrencyResult(text);
    return {
        parsed,
        rawText: text?.trim() || '',
    };
}

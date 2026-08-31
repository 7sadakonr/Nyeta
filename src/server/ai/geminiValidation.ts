import { ContentItem, ContentPart, GeminiGenerateOptions, ValidationResult } from './geminiTypes';
import { getSystemPromptForMode, VALID_MODES } from './visionPrompts';

export const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const MAX_IMAGE_BASE64_LENGTH = 5.5 * 1024 * 1024; // ~4MB raw image size
export const MAX_TEXT_LENGTH = 4000;

/**
 * Clamp generation parameters to safe production boundaries.
 */
export function clampGenerationConfig(maxTokens?: unknown, temperature?: unknown): { maxOutputTokens: number; temperature: number } {
    const safeMaxTokens = Math.min(Math.max(16, Number(maxTokens) || 800), 1500);
    const safeTemperature = Math.min(Math.max(0.0, Number(temperature) || 0.4), 1.0);
    return {
        maxOutputTokens: safeMaxTokens,
        temperature: safeTemperature,
    };
}

/**
 * Validate and sanitize Gemini multi-turn contents array.
 */
export function validateAndSanitizeContents(contents: unknown): ValidationResult {
    if (!Array.isArray(contents)) {
        return { valid: false, error: 'contents must be an array' };
    }

    if (contents.length === 0 || contents.length > 12) {
        return { valid: false, error: 'contents array length must be between 1 and 12' };
    }

    const sanitized: ContentItem[] = [];
    let totalImageBytes = 0;

    for (let i = 0; i < contents.length; i++) {
        const item = contents[i];
        if (!item || typeof item !== 'object') {
            return { valid: false, error: `contents[${i}] must be an object` };
        }

        // Only allow 'user' and 'model' roles (strictly forbid 'system', 'developer', etc.)
        if (!['user', 'model'].includes((item as any).role)) {
            return { valid: false, error: `contents[${i}].role must be "user" or "model"` };
        }

        const parts = (item as any).parts;
        if (!Array.isArray(parts) || parts.length === 0 || parts.length > 3) {
            return { valid: false, error: `contents[${i}].parts must be an array with 1-3 parts` };
        }

        const sanitizedParts: ContentPart[] = [];
        for (let j = 0; j < parts.length; j++) {
            const part = parts[j];
            if (!part || typeof part !== 'object') {
                return { valid: false, error: `contents[${i}].parts[${j}] must be an object` };
            }

            // Text part
            if (part.text !== undefined) {
                if (typeof part.text !== 'string') {
                    return { valid: false, error: `contents[${i}].parts[${j}].text must be a string` };
                }
                if (part.text.length > MAX_TEXT_LENGTH) {
                    return { valid: false, error: `contents[${i}].parts[${j}].text exceeds maximum length (${MAX_TEXT_LENGTH} chars)` };
                }
                sanitizedParts.push({ text: part.text });
            }
            // Inline image data part
            else if (part.inlineData !== undefined) {
                const inline = part.inlineData;
                if (!inline || typeof inline !== 'object') {
                    return { valid: false, error: `contents[${i}].parts[${j}].inlineData must be an object` };
                }
                if (!ALLOWED_MIME_TYPES.includes(inline.mimeType)) {
                    return { valid: false, error: `contents[${i}].parts[${j}].inlineData.mimeType must be one of: ${ALLOWED_MIME_TYPES.join(', ')}` };
                }
                if (typeof inline.data !== 'string') {
                    return { valid: false, error: `contents[${i}].parts[${j}].inlineData.data must be a base64 string` };
                }
                const cleanData = inline.data.includes(',') ? inline.data.split(',')[1] : inline.data;
                totalImageBytes += cleanData.length;
                if (totalImageBytes > MAX_IMAGE_BASE64_LENGTH) {
                    return { valid: false, error: 'Total image payload in contents exceeds 4MB limit' };
                }
                sanitizedParts.push({
                    inlineData: {
                        mimeType: inline.mimeType,
                        data: cleanData,
                    },
                });
            } else {
                return { valid: false, error: `contents[${i}].parts[${j}] contains unsupported part types` };
            }
        }

        sanitized.push({
            role: (item as any).role,
            parts: sanitizedParts,
        });
    }

    return { valid: true, sanitized };
}

/**
 * Validates the entire POST request body from `/api/gemini`.
 */
export function validateRequestBody(body: unknown): {
    valid: boolean;
    error?: string;
    status?: number;
    options?: GeminiGenerateOptions;
} {
    if (!body || typeof body !== 'object') {
        return { valid: false, error: 'Invalid JSON request body', status: 400 };
    }

    const payload = body as Record<string, any>;

    const hasInput = payload.contents !== undefined
        || (typeof payload.userPrompt === 'string' && payload.userPrompt.trim().length > 0)
        || (typeof payload.imageBase64 === 'string' && payload.imageBase64.length > 0);
    if (!hasInput) {
        return { valid: false, error: 'A prompt, image, or contents is required', status: 400 };
    }

    // Security check: Client MUST NOT send custom systemPrompt
    if (payload.systemPrompt) {
        return {
            valid: false,
            error: 'Custom system prompts are not permitted. Use the "mode" parameter.',
            status: 400,
        };
    }

    const {
        mode = 'assistant',
        userPrompt,
        imageBase64,
        mimeType = 'image/jpeg',
        maxTokens = 800,
        temperature = 0.4,
        contents,
    } = payload;

    // Validate mode
    const safeMode = VALID_MODES.includes(mode) ? mode : 'assistant';
    const systemPrompt = getSystemPromptForMode(safeMode);

    // Validate MIME type
    const safeMimeType = ALLOWED_MIME_TYPES.includes(mimeType) ? mimeType : 'image/jpeg';

    // Validate image payload size
    if (imageBase64) {
        if (typeof imageBase64 !== 'string') {
            return { valid: false, error: 'imageBase64 must be a string', status: 400 };
        }
        if (imageBase64.length > MAX_IMAGE_BASE64_LENGTH) {
            return { valid: false, error: 'Image payload exceeds maximum allowed size (4MB)', status: 413 };
        }
    }

    const { maxOutputTokens, temperature: safeTemperature } = clampGenerationConfig(maxTokens, temperature);

    let payloadContents: ContentItem[];
    if (contents) {
        const validation = validateAndSanitizeContents(contents);
        if (!validation.valid || !validation.sanitized) {
            return {
                valid: false,
                error: `Invalid contents: ${validation.error}`,
                status: 400,
            };
        }
        payloadContents = validation.sanitized;
    } else {
        const parts: ContentPart[] = [];
        const defaultPrompt = safeMode === 'currency' ? 'ตรวจธนบัตรหรือเหรียญในภาพนี้' :
            safeMode === 'reader' ? 'อ่านข้อความทั้งหมดในภาพนี้' :
            'ช่วยบรรยายภาพนี้ให้หน่อย';

        const userText = typeof userPrompt === 'string' && userPrompt.trim() ? userPrompt.trim() : defaultPrompt;
        if (userText.length > MAX_TEXT_LENGTH) {
            return {
                valid: false,
                error: `userPrompt exceeds maximum length (${MAX_TEXT_LENGTH} chars)`,
                status: 400,
            };
        }
        parts.push({ text: userText });

        if (imageBase64) {
            const cleanBase64 = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;
            parts.push({
                inlineData: {
                    mimeType: safeMimeType,
                    data: cleanBase64,
                },
            });
        }

        payloadContents = [{ role: 'user', parts }];
    }

    return {
        valid: true,
        options: {
            contents: payloadContents,
            systemPrompt,
            maxOutputTokens,
            temperature: safeTemperature,
        },
    };
}

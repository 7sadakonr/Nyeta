import { ASSISTANT_PROMPT, CURRENCY_PROMPT, OCR_PROMPT } from '../visionPrompts';

export { ASSISTANT_PROMPT, CURRENCY_PROMPT, OCR_PROMPT };

export const VALID_MODES = ['assistant', 'currency', 'reader'];

/**
 * Get authoritative server-side system prompt for a mode
 * @param {string} mode - 'assistant' | 'currency' | 'reader'
 * @returns {string} Predefined system prompt
 */
export function getSystemPromptForMode(mode) {
    switch (mode) {
        case 'currency':
            return CURRENCY_PROMPT;
        case 'reader':
            return OCR_PROMPT;
        case 'assistant':
        default:
            return ASSISTANT_PROMPT;
    }
}

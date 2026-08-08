import { ASSISTANT_PROMPT, CURRENCY_PROMPT, OCR_PROMPT } from '../visionPrompts';
import { BlindMode } from '@/types/assistant';

export { ASSISTANT_PROMPT, CURRENCY_PROMPT, OCR_PROMPT };

export const VALID_MODES: BlindMode[] = ['assistant', 'currency', 'reader'];

/**
 * Get authoritative server-side system prompt for a mode
 */
export function getSystemPromptForMode(mode?: string): string {
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

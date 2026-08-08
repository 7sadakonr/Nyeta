import { describe, it, expect } from 'vitest';
import { extractGeminiText } from '@/features/blind-assistant/client/geminiVision';

describe('Gemini Response Parser (extractGeminiText)', () => {
    it('should extract text while discarding thinking/reasoning parts', () => {
        const rawResponse = {
            candidates: [
                {
                    content: {
                        parts: [
                            { thought: true, text: 'Thinking about the image...' },
                            { text: 'ตรงหน้าของคุณคือโต๊ะทำงานสีขาว' },
                        ],
                    },
                },
            ],
        };

        const result = extractGeminiText(rawResponse);
        expect(result).toBe('ตรงหน้าของคุณคือโต๊ะทำงานสีขาว');
    });

    it('should combine multiple text parts properly', () => {
        const rawResponse = {
            candidates: [
                {
                    content: {
                        parts: [
                            { text: 'ประโยคที่ 1' },
                            { text: 'ประโยคที่ 2' },
                        ],
                    },
                },
            ],
        };

        const result = extractGeminiText(rawResponse);
        expect(result).toBe('ประโยคที่ 1\nประโยคที่ 2');
    });

    it('should handle empty or malformed response safely', () => {
        expect(extractGeminiText(null)).toBe('');
        expect(extractGeminiText({})).toBe('');
        expect(extractGeminiText({ candidates: [] })).toBe('');
        expect(extractGeminiText({ candidates: [{ content: { parts: [] } }] })).toBe('');
    });
});

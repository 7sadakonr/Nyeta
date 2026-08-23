// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ChatHistory from '@/features/blind-assistant/components/ChatHistory';

describe('ChatHistory', () => {
    it('keeps previous answers in a collapsed history instead of creating a nested scroll region', () => {
        const { getByText, container } = render(<ChatHistory aiMessages={[
            { role: 'ai', content: 'คำตอบก่อนหน้า' },
            { role: 'ai', content: 'คำตอบล่าสุด' },
        ]} />);

        expect(getByText('ดูประวัติการสนทนา')).toBeTruthy();
        expect(container.querySelector('details')).toBeTruthy();
        expect(container.querySelector('[tabindex="0"]')).toBeNull();
    });
});

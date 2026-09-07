// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ChatHistory from '@/features/blind-assistant/components/ChatHistory';

describe('ChatHistory', () => {
    it('provides an accessible result region for VoiceOver with the latest description', () => {
        const { getByText, queryByText, container } = render(<ChatHistory aiMessages={[
            { role: 'ai', content: 'คำตอบก่อนหน้า' },
            { role: 'ai', content: 'คำตอบล่าสุด' },
        ]} />);

        expect(queryByText('ดูประวัติการสนทนา')).toBeNull();
        expect(getByText('คำบรรยาย')).toBeTruthy();
        expect(getByText('คำตอบล่าสุด')).toBeTruthy();
        expect(container.querySelector('details')).toBeNull();
        const section = container.querySelector('section');
        expect(section?.getAttribute('role')).toBe('region');
        expect(section?.getAttribute('aria-label')).toBe('คำบรรยาย');
        expect(section?.getAttribute('aria-hidden')).toBeNull();
        expect(container.querySelector('[tabindex="0"]')).toBeNull();
    });
});

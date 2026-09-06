// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ChatHistory from '@/features/blind-assistant/components/ChatHistory';

describe('ChatHistory', () => {
    it('provides an accessible result region for VoiceOver with collapsed history', () => {
        const { getByText, container } = render(<ChatHistory aiMessages={[
            { role: 'ai', content: 'คำตอบก่อนหน้า' },
            { role: 'ai', content: 'คำตอบล่าสุด' },
        ]} />);

        expect(getByText('ดูประวัติการสนทนา')).toBeTruthy();
        expect(getByText('คำบรรยาย')).toBeTruthy();
        expect(container.querySelector('details')).toBeTruthy();
        const section = container.querySelector('section');
        expect(section?.getAttribute('role')).toBe('region');
        expect(section?.getAttribute('aria-label')).toBe('คำบรรยาย');
        expect(section?.getAttribute('aria-hidden')).toBeNull();
        expect(container.querySelector('summary')?.getAttribute('tabindex')).toBe('-1');
        expect(container.querySelector('[tabindex="0"]')).toBeNull();
    });
});

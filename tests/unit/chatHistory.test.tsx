// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ChatHistory from '@/features/blind-assistant/components/ChatHistory';

describe('ChatHistory', () => {
    it('exposes the latest description without a duplicate landmark for VoiceOver with the latest description', () => {
        const { getByText, queryByText, getByRole, queryByRole, container } = render(<ChatHistory aiMessages={[
            { role: 'ai', content: 'คำตอบก่อนหน้า' },
            { role: 'ai', content: 'คำตอบล่าสุด' },
        ]} />);

        expect(queryByText('ดูประวัติการสนทนา')).toBeNull();
        expect(getByText('คำบรรยาย')).toBeTruthy();
        expect(getByText('คำตอบล่าสุด')).toBeTruthy();
        expect(container.querySelector('details')).toBeNull();
        // No region landmark: VoiceOver should not announce the structure name before the content.
        expect(queryByRole('region')).toBeNull();
        expect(container.querySelector('section')).toBeNull();
        expect(getByRole('heading', { name: 'คำบรรยาย' })).toBeTruthy();
        expect(container.firstElementChild?.getAttribute('aria-hidden')).toBeNull();
        expect(container.querySelector('[tabindex="0"]')).toBeNull();
    });
});

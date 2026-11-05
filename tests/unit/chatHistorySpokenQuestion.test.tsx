// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ChatHistory from '@/features/blind-assistant/components/ChatHistory';

describe('ChatHistory user messages', () => {
    it('shows the question the user actually asked by voice', () => {
        const { getByText } = render(<ChatHistory aiMessages={[
            { role: 'user', content: '(พูด): "นี่คืออะไร"', image: 'data:image/jpeg;base64,x' },
        ]} />);
        expect(getByText('คุณถามว่า นี่คืออะไร')).toBeTruthy();
    });

    it('describes a plain photo request without a question', () => {
        const { getByText } = render(<ChatHistory aiMessages={[
            { role: 'user', content: 'ช่วยบรรยายภาพนี้อย่างละเอียด', image: 'data:image/jpeg;base64,x' },
        ]} />);
        expect(getByText('คุณส่งภาพเพื่อให้บรรยาย')).toBeTruthy();
    });

    it('colours failures using the explicit isError flag, not the wording', () => {
        const { getByText } = render(<ChatHistory aiMessages={[
            { role: 'ai', content: 'ระบบ AI ยุ่งอยู่ กรุณาลองใหม่อีกครั้งครับ', isError: true },
        ]} />);
        expect(getByText('ระบบ AI ยุ่งอยู่ กรุณาลองใหม่อีกครั้งครับ').className).toContain('text-[#FF453A]');

        const normal = render(<ChatHistory aiMessages={[{ role: 'ai', content: 'ขอโทษที่รบกวน นี่คือคำตอบปกติ' }]} />);
        expect(normal.getByText('ขอโทษที่รบกวน นี่คือคำตอบปกติ').className).not.toContain('text-[#FF453A]');
    });
});

// @vitest-environment jsdom
import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ModeSwitcher from '@/features/blind-assistant/components/ModeSwitcher';

describe('ModeSwitcher', () => {
    it('moves focus and activates the next mode with ArrowRight', () => {
        const switchMode = vi.fn();
        const { getByRole } = render(<ModeSwitcher mode="assistant" switchMode={switchMode} />);
        const assistant = getByRole('tab', { name: 'ผู้ช่วย' });
        const currency = getByRole('tab', { name: 'เงิน' });

        assistant.focus();
        fireEvent.keyDown(assistant, { key: 'ArrowRight' });

        expect(document.activeElement).toBe(currency);
        expect(switchMode).toHaveBeenCalledWith('currency');
    });
});

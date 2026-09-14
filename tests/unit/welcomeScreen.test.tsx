// @vitest-environment jsdom

import { fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { speak, unlockAudio, playEarcon } = vi.hoisted(() => ({ 
    speak: vi.fn(), 
    unlockAudio: vi.fn(),
    playEarcon: vi.fn(),
}));

vi.mock('@/shared/accessibility/speechController', () => ({
    speechController: { speak, unlockAudio },
}));

vi.mock('@/shared/accessibility/audio', () => ({
    playEarcon,
}));

import WelcomeScreen from '@/features/blind-app/WelcomeScreen';

describe('WelcomeScreen speech ownership', () => {
    beforeEach(() => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        Object.defineProperty(navigator, 'mediaDevices', {
            configurable: true,
            value: { getUserMedia: vi.fn() },
        });
    });

    afterEach(() => vi.restoreAllMocks());

    it('plays earcon beep and speaks short unlock phrase "นัยตา" on start, then enters app directly', () => {
        const onStart = vi.fn();
        const { getByRole } = render(<WelcomeScreen onStart={onStart} />);

        expect(speak).not.toHaveBeenCalled();

        fireEvent.click(getByRole('button', { name: 'เริ่มใช้งาน และอนุญาตกล้อง' }));

        expect(playEarcon).toHaveBeenCalledWith('button');
        expect(unlockAudio).toHaveBeenCalledWith();
        expect(speak).toHaveBeenCalledWith('นัยตา', { channel: 'status' });
        expect(onStart).toHaveBeenCalledTimes(1);
    });
});

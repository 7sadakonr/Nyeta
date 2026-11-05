// @vitest-environment jsdom

import { StrictMode } from 'react';
import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { speak, playEarcon, setOrientationBlocked } = vi.hoisted(() => ({
    speak: vi.fn(),
    playEarcon: vi.fn(),
    setOrientationBlocked: vi.fn(),
}));

vi.mock('@/shared/accessibility/speechController', () => ({
    speechController: { speak, setOrientationBlocked },
}));

vi.mock('@/shared/accessibility/audio', () => ({
    playEarcon,
}));

import PortraitGuardian from '@/shared/ui/PortraitGuardian';

describe('PortraitGuardian', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.matchMedia = vi.fn().mockImplementation((query) => ({
            matches: false,
            media: query,
            onchange: null,
            addListener: vi.fn(),
            removeListener: vi.fn(),
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            dispatchEvent: vi.fn(),
        }));
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('renders guardian element in DOM with hidden class when in portrait', () => {
        const { getByTestId, queryByRole } = render(<PortraitGuardian />);
        const guardian = getByTestId('portrait-guardian');
        expect(guardian.className).toContain('hidden');
        expect(queryByRole('alert')).toBeNull();
        expect(speak).not.toHaveBeenCalled();
    });

    it('announces speech and plays earcon when landscape is detected on phone', () => {
        // Simulate phone landscape: width > height, height <= 600, touch enabled
        Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 800 });
        Object.defineProperty(window, 'innerHeight', { writable: true, configurable: true, value: 380 });
        Object.defineProperty(navigator, 'maxTouchPoints', { writable: true, configurable: true, value: 5 });

        const { getByTestId, queryByRole } = render(<StrictMode><PortraitGuardian /></StrictMode>);
        const guardian = getByTestId('portrait-guardian');
        expect(guardian.className).toContain('flex');
        // TTS + earcon are the single announcement path: no live region, and strict mode must not double-fire.
        expect(queryByRole('alert')).toBeNull();
        expect(guardian.getAttribute('aria-live')).toBeNull();
        expect(setOrientationBlocked).toHaveBeenCalledWith(true);
        expect(speak).toHaveBeenCalledTimes(1);
        expect(speak).toHaveBeenCalledWith('กรุณาหมุนโทรศัพท์เป็นแนวตั้ง', { channel: 'critical' });
        expect(playEarcon).toHaveBeenCalledTimes(1);
        expect(playEarcon).toHaveBeenCalledWith('error');
    });
});

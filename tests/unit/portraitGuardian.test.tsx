// @vitest-environment jsdom

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
        const { getByRole } = render(<PortraitGuardian />);
        const alert = getByRole('alert');
        expect(alert).not.toBeNull();
        expect(alert.className).toContain('hidden');
        expect(speak).not.toHaveBeenCalled();
    });

    it('announces speech and plays earcon when landscape is detected on phone', () => {
        // Simulate phone landscape: width > height, height <= 600, touch enabled
        Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 800 });
        Object.defineProperty(window, 'innerHeight', { writable: true, configurable: true, value: 380 });
        Object.defineProperty(navigator, 'maxTouchPoints', { writable: true, configurable: true, value: 5 });

        const { getByRole } = render(<PortraitGuardian />);
        const alert = getByRole('alert');
        expect(alert.className).toContain('flex');
        expect(setOrientationBlocked).toHaveBeenCalledWith(true);
        expect(speak).toHaveBeenCalledWith('กรุณาหมุนโทรศัพท์เป็นแนวตั้ง', { channel: 'critical' });
        expect(playEarcon).toHaveBeenCalledWith('error');
    });
});

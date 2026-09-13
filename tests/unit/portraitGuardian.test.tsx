// @vitest-environment jsdom

import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { speak, stop, notifyUserNavigation, playEarcon, setOrientationBlocked } = vi.hoisted(() => ({
    speak: vi.fn(),
    stop: vi.fn(),
    notifyUserNavigation: vi.fn(),
    playEarcon: vi.fn(),
    setOrientationBlocked: vi.fn(),
}));

vi.mock('@/shared/accessibility/speechController', () => ({
    speechController: { speak, stop, notifyUserNavigation, setOrientationBlocked },
}));

vi.mock('@/shared/accessibility/audio', () => ({
    playEarcon,
}));

import PortraitGuardian from '@/shared/ui/PortraitGuardian';
import { fireEvent } from '@testing-library/react';

describe('PortraitGuardian', () => {
    beforeEach(() => {
        vi.useFakeTimers();
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
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('renders guardian element in DOM with hidden class when in portrait without duplicate live regions', () => {
        const { getByLabelText } = render(<PortraitGuardian />);
        const aside = getByLabelText('แจ้งเตือนการใช้งานในแนวตั้ง');
        expect(aside).not.toBeNull();
        expect(aside.className).toContain('hidden');
        expect(aside.getAttribute('role')).toBeNull();
        expect(aside.getAttribute('aria-live')).toBeNull();
        expect(speak).not.toHaveBeenCalled();
    });

    it('announces speech after debounce and plays earcon when landscape is detected on phone', () => {
        // Simulate phone landscape: width > height, height <= 600, touch enabled
        Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 800 });
        Object.defineProperty(window, 'innerHeight', { writable: true, configurable: true, value: 380 });
        Object.defineProperty(navigator, 'maxTouchPoints', { writable: true, configurable: true, value: 5 });

        const { getByLabelText } = render(<PortraitGuardian />);
        const aside = getByLabelText('แจ้งเตือนการใช้งานในแนวตั้ง');
        expect(aside.className).toContain('flex');
        expect(setOrientationBlocked).toHaveBeenCalledWith(true);
        expect(playEarcon).toHaveBeenCalledWith('error');

        // Not spoken at 0ms (waiting for VoiceOver system announcement "Landscape" to complete)
        expect(speak).not.toHaveBeenCalled();

        // Advance timers by 600ms
        vi.advanceTimersByTime(600);
        expect(speak).toHaveBeenCalledWith('กรุณาหมุนโทรศัพท์เป็นแนวตั้ง', { channel: 'critical' });
    });

    it('stops speech and notifies user navigation when screen is touched with VoiceOver', () => {
        Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 800 });
        Object.defineProperty(window, 'innerHeight', { writable: true, configurable: true, value: 380 });
        Object.defineProperty(navigator, 'maxTouchPoints', { writable: true, configurable: true, value: 5 });

        const { getByLabelText } = render(<PortraitGuardian />);
        const aside = getByLabelText('แจ้งเตือนการใช้งานในแนวตั้ง');

        fireEvent.touchStart(aside);
        expect(stop).toHaveBeenCalled();
        expect(notifyUserNavigation).toHaveBeenCalled();
    });
});

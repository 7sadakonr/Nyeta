// @vitest-environment jsdom
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import VolunteerScreen from '@/features/calling/VolunteerScreen';

vi.mock('@/features/calling/hooks/useVolunteerHelp', () => ({
    useVolunteerHelp: () => ({
        status: 'connected',
        online: true,
        volunteerCount: 3,
        incomingCall: null,
        error: null,
        remoteVideoRef: { current: null },
        goOnline: vi.fn(),
        goOffline: vi.fn(),
        acceptCall: vi.fn(),
        endCall: vi.fn(),
        dismissIncoming: vi.fn(),
        dataChannel: null,
    }),
}));

vi.mock('@/features/calling/hooks/useDataChannel', () => ({
    useDataChannel: () => null,
}));

vi.mock('@/shared/hooks/useWakeLock', () => ({
    useWakeLock: () => ({
        request: vi.fn(),
        release: vi.fn(),
    }),
}));

describe('VolunteerScreen in-call desktop layout', () => {
    it('renders constrained video stage and unified call control dock without unbounded height', () => {
        const { container } = render(<VolunteerScreen />);

        // Video container should have disciplined max-height and max-width ceilings
        const videoSection = screen.getByLabelText('วิดีโอจากผู้ขอความช่วยเหลือ');
        expect(videoSection).toBeDefined();
        expect(videoSection.className).toContain('max-h-[calc(100dvh-11rem)]');
        expect(videoSection.className).toContain('max-w-2xl');

        // End call button should be present in the dock
        const endCallBtn = screen.getByRole('button', { name: /วางสาย/i });
        expect(endCallBtn).toBeDefined();
        expect(endCallBtn.className).toContain('rounded-full');
        expect(endCallBtn.className).toContain('bg-red-600');

        // Main content area should be locked to overflow-hidden during active call
        const main = container.querySelector('main');
        expect(main?.className).toContain('overflow-hidden');
    });
});

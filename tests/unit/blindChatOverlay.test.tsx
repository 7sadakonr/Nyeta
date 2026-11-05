// @vitest-environment jsdom

import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { speak, playBeep, announce } = vi.hoisted(() => ({
    speak: vi.fn(), playBeep: vi.fn(), announce: vi.fn(),
}));

vi.mock('@/shared/accessibility/speechController', () => ({ speechController: { speak } }));
vi.mock('@/shared/accessibility/audio', () => ({ playBeep }));
vi.mock('@/shared/accessibility/announcer', () => ({ announce }));

import BlindChatOverlay from '@/features/calling/components/BlindChatOverlay';

describe('BlindChatOverlay', () => {
    beforeEach(() => vi.clearAllMocks());

    it('has no reply control: the user talks over the call audio', () => {
        const { queryByRole } = render(<BlindChatOverlay latestMessage={{ from: 'volunteer', text: 'สวัสดี' }} />);
        expect(queryByRole('button')).toBeNull();
    });

    it('announces volunteer messages through the live region, not speech synthesis', () => {
        const { rerender, getByText } = render(<BlindChatOverlay latestMessage={null} />);

        rerender(<BlindChatOverlay latestMessage={{ from: 'volunteer', text: 'ยื่นมือไปทางซ้าย' }} />);

        expect(getByText('ยื่นมือไปทางซ้าย')).toBeTruthy();
        expect(announce).toHaveBeenCalledWith('อาสาสมัครพิมพ์ว่า ยื่นมือไปทางซ้าย');
        expect(speak).not.toHaveBeenCalled();
    });
});

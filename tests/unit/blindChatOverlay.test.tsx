// @vitest-environment jsdom

import { act, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { speak, beginListening, endListening, playBeep, announce } = vi.hoisted(() => ({
    speak: vi.fn(), beginListening: vi.fn(), endListening: vi.fn(), playBeep: vi.fn(), announce: vi.fn(),
}));

vi.mock('@/shared/accessibility/speechController', () => ({ speechController: { speak, beginListening, endListening } }));
vi.mock('@/shared/accessibility/audio', () => ({ playBeep }));
vi.mock('@/shared/accessibility/announcer', () => ({ announce }));

import BlindChatOverlay from '@/features/calling/components/BlindChatOverlay';

class MockRecognition {
    static latest: MockRecognition | null = null;
    onstart: (() => void) | null = null;
    onend: (() => void) | null = null;
    onresult: ((event: any) => void) | null = null;
    onerror: ((event: any) => void) | null = null;
    start = vi.fn(() => this.onstart?.());
    stop = vi.fn(() => this.onend?.());
    abort = vi.fn();
    constructor() { MockRecognition.latest = this; }
}

describe('BlindChatOverlay', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.stubGlobal('SpeechRecognition', MockRecognition);
    });
    afterEach(() => vi.unstubAllGlobals());

    it('offers the reply button as soon as the call connects, before any volunteer message', () => {
        const { getByRole } = render(<BlindChatOverlay latestMessage={null} onSendMessage={vi.fn()} />);
        expect(getByRole('button', { name: 'พูดตอบอาสาสมัคร' })).toBeTruthy();
    });

    it('starts on one tap and sends on the next tap (no press-and-hold needed with VoiceOver)', () => {
        const onSendMessage = vi.fn();
        const { getByRole } = render(<BlindChatOverlay latestMessage={null} onSendMessage={onSendMessage} />);

        fireEvent.click(getByRole('button', { name: 'พูดตอบอาสาสมัคร' }));
        const recognition = MockRecognition.latest!;
        expect(recognition.start).toHaveBeenCalledOnce();
        expect(beginListening).toHaveBeenCalledOnce();

        const stop = getByRole('button', { name: 'หยุดและส่งข้อความตอบ' });
        act(() => recognition.onresult?.({ results: [[{ transcript: 'ขอบคุณครับ' }]] }));
        fireEvent.click(stop);

        expect(recognition.stop).toHaveBeenCalledOnce();
        expect(onSendMessage).toHaveBeenCalledExactlyOnceWith('ขอบคุณครับ');
        expect(endListening).toHaveBeenCalled();
    });

    it('tells the user when nothing was heard instead of silently ending', () => {
        const { getByRole } = render(<BlindChatOverlay latestMessage={null} onSendMessage={vi.fn()} />);

        fireEvent.click(getByRole('button', { name: 'พูดตอบอาสาสมัคร' }));
        fireEvent.click(getByRole('button', { name: 'หยุดและส่งข้อความตอบ' }));

        expect(announce).toHaveBeenCalledWith(expect.stringContaining('ไม่ได้ยิน'));
    });

    it('announces volunteer messages through the live region, not speech synthesis', () => {
        const { rerender } = render(<BlindChatOverlay latestMessage={null} onSendMessage={vi.fn()} />);

        rerender(<BlindChatOverlay latestMessage={{ from: 'volunteer', text: 'ยื่นมือไปทางซ้าย' }} onSendMessage={vi.fn()} />);

        expect(announce).toHaveBeenCalledWith('อาสาสมัครพิมพ์ว่า ยื่นมือไปทางซ้าย');
        expect(speak).not.toHaveBeenCalled();
    });

    it('explains when the device cannot do speech recognition', () => {
        vi.unstubAllGlobals();
        const { getByRole } = render(<BlindChatOverlay latestMessage={null} onSendMessage={vi.fn()} />);

        fireEvent.click(getByRole('button', { name: 'พูดตอบอาสาสมัคร' }));

        expect(announce).toHaveBeenCalledWith(expect.stringContaining('ไม่รองรับ'));
    });
});

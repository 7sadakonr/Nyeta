// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

class FakeUtterance {
    public lang = '';
    public rate = 1;
    public volume = 1;
    public voice: SpeechSynthesisVoice | null = null;
    public onstart: (() => void) | null = null;
    public onend: (() => void) | null = null;
    public onerror: ((event: SpeechSynthesisErrorEvent) => void) | null = null;

    constructor(public text: string) {}
}

describe('speechController navigation quiet policy', () => {
    let utterances: FakeUtterance[];
    let speakNative: ReturnType<typeof vi.fn>;
    let speechController: typeof import('@/shared/accessibility/speechController').speechController;

    beforeEach(async () => {
        vi.useFakeTimers();
        utterances = [];
        speakNative = vi.fn((utterance: FakeUtterance) => utterances.push(utterance));

        vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
        Object.defineProperty(window, 'speechSynthesis', {
            configurable: true,
            value: {
                speaking: false,
                pending: false,
                paused: false,
                cancel: vi.fn(),
                resume: vi.fn(),
                speak: speakNative,
                getVoices: vi.fn(() => []),
            },
        });

        vi.resetModules();
        ({ speechController } = await import('@/shared/accessibility/speechController'));
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
        vi.resetModules();
    });

    it('drops realtime and status speech during navigation quiet mode', () => {
        const realtimeEnd = vi.fn();
        const statusEnd = vi.fn();

        speechController.notifyUserNavigation();
        const realtimeAccepted = speechController.speak('ขยับกล้องไปทางซ้าย', { channel: 'realtime', onEnd: realtimeEnd });
        const statusAccepted = speechController.speak('กำลังประมวลผล', { channel: 'status', onEnd: statusEnd });

        expect(utterances).toHaveLength(0);
        expect(realtimeAccepted).toBe(false);
        expect(statusAccepted).toBe(false);
        expect(realtimeEnd).toHaveBeenCalledWith(false);
        expect(statusEnd).toHaveBeenCalledWith(false);

        speechController.speak('ไม่สามารถเปิดกล้องได้', { channel: 'critical' });
        expect(utterances.map((utterance) => utterance.text)).toEqual(['ไม่สามารถเปิดกล้องได้']);
    });

    it('replaces an interrupted result with a newer result received during navigation', () => {
        speechController.speak('ผลลัพธ์เดิม', { channel: 'result' });
        speechController.notifyUserNavigation();
        const accepted = speechController.speak('ผลลัพธ์ใหม่', { channel: 'result' });

        vi.advanceTimersByTime(3500);

        expect(accepted).toBe(true);
        expect(utterances.map((utterance) => utterance.text)).toEqual([
            'ผลลัพธ์เดิม',
            'ผลลัพธ์ใหม่',
        ]);
    });

    it('does not replay pending unlock speech after navigation interrupts it', () => {
        speechController.speak('คำตอบเก่าที่ต้องไม่กลับมา', { channel: 'result' });
        speechController.notifyUserNavigation();
        speechController.unlockAudio();

        expect(utterances.filter((utterance) => utterance.text === 'คำตอบเก่าที่ต้องไม่กลับมา')).toHaveLength(1);
    });

    it('clears pending unlock speech when stopped after native speech has ended', () => {
        speechController.speak('ข้อความที่จบไปแล้ว', { channel: 'result' });
        utterances[0].onend?.();
        speechController.stop();
        speechController.unlockAudio();

        expect(utterances.filter((utterance) => utterance.text === 'ข้อความที่จบไปแล้ว')).toHaveLength(1);
    });

    it('accepts a new feature result after the quiet timeout expires', () => {
        speechController.notifyUserNavigation();
        vi.advanceTimersByTime(3500);
        speechController.speak('ผลลัพธ์หลังผู้ใช้หยุดเลื่อน', { channel: 'result' });

        expect(utterances.map((utterance) => utterance.text)).toEqual(['ผลลัพธ์หลังผู้ใช้หยุดเลื่อน']);
    });

    it('resumes an interrupted result after VoiceOver navigation becomes quiet', () => {
        speechController.speak('คำตอบที่กำลังอ่านอยู่', { channel: 'result' });
        speechController.notifyUserNavigation();

        vi.advanceTimersByTime(3500);

        expect(utterances.map((utterance) => utterance.text)).toEqual([
            'คำตอบที่กำลังอ่านอยู่',
            'คำตอบที่กำลังอ่านอยู่',
        ]);
    });

    it('resumes a long result from the interrupted chunk', () => {
        const longResult = Array.from({ length: 80 }, (_, index) => `คำ${index}`).join(' ');
        speechController.speak(longResult, { channel: 'result' });
        const interruptedChunk = utterances[0].text;

        speechController.notifyUserNavigation();
        vi.advanceTimersByTime(3500);

        expect(utterances[1].text).toBe(interruptedChunk);
    });

    it('does not resume a result after the user stops speech', () => {
        speechController.speak('ข้อความที่ผู้ใช้หยุดเอง', { channel: 'result' });
        speechController.notifyUserNavigation();
        speechController.stop();

        vi.advanceTimersByTime(3500);

        expect(utterances.map((utterance) => utterance.text)).toEqual(['ข้อความที่ผู้ใช้หยุดเอง']);
    });

});

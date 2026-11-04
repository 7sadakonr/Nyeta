// @vitest-environment jsdom
import { fireEvent, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ControlBar, { ControlBarProps } from '@/features/blind-assistant/components/ControlBar';

const detectedNote = {
    captureId: 1,
    source: 'gemini' as const,
    total: 100,
    signature: 'note-100-1',
    items: [{ type: 'note' as const, value: 100, quantity: 1, locations: ['center' as const] }],
};

const baseProps = (): ControlBarProps => ({
    mode: 'assistant',
    aiReady: true,
    aiStatus: 'idle',
    isListening: false,
    docText: null,
    isProcessingDoc: false,
    currencyResult: null,
    currencyScanning: false,
    readerAligned: false,
    onCapture: vi.fn(),
    onStartListening: vi.fn(),
    onStopListening: vi.fn(),
    onCurrencyCapture: vi.fn(),
    onReplayCurrencyDetails: vi.fn(),
    onClearTotal: vi.fn(),
    onReadDocument: vi.fn(),
});

const renderBar = (overrides: Partial<ControlBarProps> = {}) => render(<ControlBar {...baseProps()} {...overrides} />);

describe('ControlBar', () => {
    beforeEach(() => vi.clearAllMocks());

    it('offers a clear-chat action when assistant messages exist', () => {
        const onClearMessages = vi.fn();
        const { getByRole } = renderBar({ hasAssistantMessages: true, onClearMessages });

        fireEvent.click(getByRole('button', { name: 'ล้างแชท' }));

        expect(onClearMessages).toHaveBeenCalledOnce();
    });

    it('keeps every assistant button in its own slot: read-again never replaces the guidance switch', () => {
        const onReadAgain = vi.fn();
        const { getByRole, rerender } = render(<ControlBar {...baseProps()} hasAssistantMessages={false} onReadAgain={onReadAgain} />);

        expect(getByRole('switch', { name: 'เสียงนำทาง' })).toBeTruthy();
        expect(getByRole('button', { name: 'อ่านใหม่' }).getAttribute('aria-disabled')).toBe('true');

        rerender(<ControlBar {...baseProps()} hasAssistantMessages onReadAgain={onReadAgain} />);

        expect(getByRole('switch', { name: 'เสียงนำทาง' })).toBeTruthy();
        fireEvent.click(getByRole('button', { name: 'อ่านใหม่' }));
        expect(onReadAgain).toHaveBeenCalledOnce();
    });

    it('presents guidance as a switch whose state never contradicts its name', () => {
        const onToggleGuidance = vi.fn();
        const { getByRole, rerender } = render(<ControlBar {...baseProps()} isGuidanceMuted={false} onToggleGuidance={onToggleGuidance} />);

        const on = getByRole('switch', { name: 'เสียงนำทาง' });
        expect(on.getAttribute('aria-checked')).toBe('true');
        expect(on.getAttribute('aria-pressed')).toBeNull();
        fireEvent.click(on);
        expect(onToggleGuidance).toHaveBeenCalledOnce();

        rerender(<ControlBar {...baseProps()} isGuidanceMuted onToggleGuidance={onToggleGuidance} />);
        const off = getByRole('switch', { name: 'เสียงนำทาง' });
        expect(off.getAttribute('aria-checked')).toBe('false');
    });

    it('offers the guidance switch in every camera mode', () => {
        for (const mode of ['assistant', 'currency', 'reader'] as const) {
            const { getByRole, unmount } = renderBar({ mode });
            expect(getByRole('switch', { name: 'เสียงนำทาง' })).toBeTruthy();
            unmount();
        }
    });

    it('offers detail playback and a reset that is honestly named in currency mode', () => {
        const { getByRole, queryByRole } = renderBar({ mode: 'currency', currencyResult: detectedNote, totalAmount: 250 });

        expect(getByRole('button', { name: 'ฟังรายละเอียด' })).toBeTruthy();
        expect(getByRole('button', { name: 'ล้างผล' })).toBeTruthy();
        expect(queryByRole('button', { name: /ล้างยอด/ })).toBeNull();
    });

    it('allows clearing a detected banknote even when the accumulated total is zero', () => {
        const onClearTotal = vi.fn();
        const { getByRole } = renderBar({ mode: 'currency', currencyResult: detectedNote, totalAmount: 0, onClearTotal });

        fireEvent.click(getByRole('button', { name: 'ล้างผล' }));

        expect(onClearTotal).toHaveBeenCalledOnce();
    });

    it('starts a manual currency scan when the take-photo action is pressed', () => {
        const onCurrencyCapture = vi.fn();
        const { getByRole } = renderBar({ mode: 'currency', onCurrencyCapture });

        fireEvent.click(getByRole('button', { name: 'ถ่ายเอง' }));
        expect(onCurrencyCapture).toHaveBeenCalledOnce();
    });

    it('keeps the manual currency capture button usable while auto-scan is checking', () => {
        const onCurrencyCapture = vi.fn();
        const { getByRole } = renderBar({ mode: 'currency', currencyScanning: true, onCurrencyCapture });

        const capture = getByRole('button', { name: 'กำลังตรวจเงิน กดเพื่อถ่ายเองใหม่' });
        expect(capture.getAttribute('aria-disabled')).toBeNull();
        fireEvent.click(capture);
        expect(onCurrencyCapture).toHaveBeenCalledOnce();
    });

    it('renders real buttons with one accessible name and aria-disabled when unavailable', () => {
        const onClearMessages = vi.fn();
        const onCapture = vi.fn();
        const { getByRole, getAllByRole, queryByRole } = renderBar({ hasAssistantMessages: false, onCapture, onClearMessages });

        expect(queryByRole('group')).toBeNull();
        for (const button of getAllByRole('button')) {
            expect(button.tagName).toBe('BUTTON');
            expect(button.querySelector('.sr-only')).toBeNull();
        }

        const clear = getByRole('button', { name: 'ล้างแชท' });
        expect(clear.getAttribute('aria-disabled')).toBe('true');
        fireEvent.click(clear);
        expect(onClearMessages).not.toHaveBeenCalled();

        const describeScene = getByRole('button', { name: 'บรรยายสิ่งที่เห็น' });
        expect(describeScene.getAttribute('aria-disabled')).toBeNull();
        fireEvent.click(describeScene);
        expect(onCapture).toHaveBeenCalledOnce();
    });

    it('never leaves a locked capture button silent and says why in its name', () => {
        const onDisabledPress = vi.fn();
        const onCapture = vi.fn();

        const camera = renderBar({ aiReady: false, onCapture, onDisabledPress });
        fireEvent.click(camera.getByRole('button', { name: 'กล้องยังไม่พร้อม รอสักครู่' }));
        expect(onDisabledPress).toHaveBeenCalledTimes(1);
        camera.unmount();

        const thinking = renderBar({ aiStatus: 'thinking', onCapture, onDisabledPress });
        fireEvent.click(thinking.getByRole('button', { name: 'AI กำลังคิด รอสักครู่' }));
        expect(onDisabledPress).toHaveBeenCalledTimes(2);
        thinking.unmount();

        const listening = renderBar({ isListening: true, onCapture, onDisabledPress });
        fireEvent.click(listening.getByRole('button', { name: 'กำลังฟังอยู่ กดหยุดและส่งก่อน' }));
        expect(onDisabledPress).toHaveBeenCalledTimes(3);
        expect(onCapture).not.toHaveBeenCalled();
    });

    it('locks the microphone while the AI is thinking and gives the listening state its own name (no aria-pressed)', () => {
        const onDisabledPress = vi.fn();
        const onStartListening = vi.fn();
        const onStopListening = vi.fn();

        const thinking = renderBar({ aiStatus: 'thinking', onStartListening, onDisabledPress });
        const lockedMic = thinking.getByRole('button', { name: 'ถามด้วยเสียง' });
        expect(lockedMic.getAttribute('aria-disabled')).toBe('true');
        fireEvent.click(lockedMic);
        expect(onStartListening).not.toHaveBeenCalled();
        expect(onDisabledPress).toHaveBeenCalledOnce();
        thinking.unmount();

        const listening = renderBar({ isListening: true, onStopListening });
        const stop = listening.getByRole('button', { name: 'หยุดและส่งคำถาม' });
        expect(stop.getAttribute('aria-pressed')).toBeNull();
        fireEvent.click(stop);
        expect(onStopListening).toHaveBeenCalledOnce();
    });

    it('turns the main button into "try the camera again" when the camera could not open', () => {
        const onRetryCamera = vi.fn();
        const onCapture = vi.fn();

        for (const mode of ['assistant', 'currency', 'reader'] as const) {
            const { getByRole, unmount } = renderBar({ mode, aiReady: false, cameraError: true, onRetryCamera, onCapture });
            const retry = getByRole('button', { name: 'เปิดกล้องไม่ได้ กดเพื่อลองอีกครั้ง' });
            expect(retry.getAttribute('aria-disabled')).toBeNull();
            fireEvent.click(retry);
            unmount();
        }

        expect(onRetryCamera).toHaveBeenCalledTimes(3);
        expect(onCapture).not.toHaveBeenCalled();
    });

    it('offers to read a new page once a document has been read', () => {
        const { getByRole } = renderBar({ mode: 'reader', docText: 'ข้อความที่อ่านแล้ว' });
        expect(getByRole('button', { name: 'อ่านหน้าใหม่' })).toBeTruthy();
    });

    it('moves focus to the describe button once, and only when nothing else has focus', async () => {
        vi.useFakeTimers();
        try {
            // Another control already has focus (the user got there first): it must not be stolen.
            const other = document.createElement('button');
            document.body.appendChild(other);
            other.focus();
            const first = renderBar();
            await vi.advanceTimersByTimeAsync(1000);
            expect(document.activeElement).toBe(other);
            first.unmount();
            other.remove();
        } finally {
            vi.useRealTimers();
        }
    });
});

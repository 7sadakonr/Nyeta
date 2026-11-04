// @vitest-environment jsdom
import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ControlBar from '@/features/blind-assistant/components/ControlBar';

describe('ControlBar', () => {
    it('offers a clear-chat action when assistant messages exist', () => {
        const onClearMessages = vi.fn();
        const { getByRole } = render(
            <ControlBar
                mode="assistant"
                aiReady
                aiStatus="idle"
                isSpeaking={false}
                isListening={false}
                docText={null}
                isReading={false}
                isProcessingDoc={false}
                currencyResult={null}
                currencyScanning={false}
                currencyMonitoring={false}
                hasAssistantMessages
                readerAligned={false}
                onCapture={vi.fn()}
                onStopSpeaking={vi.fn()}
                onStartListening={vi.fn()}
                onStopListening={vi.fn()}
                onCurrencyCapture={vi.fn()}
                onReplayCurrencyDetails={vi.fn()}
                onClearTotal={vi.fn()}
                onClearMessages={onClearMessages}
                onReadDocument={vi.fn()}
                onReplayDocument={vi.fn()}
                onStopReading={vi.fn()}
            />,
        );

        fireEvent.click(getByRole('button', { name: 'ล้างแชท' }));

        expect(onClearMessages).toHaveBeenCalledOnce();
    });

    it('offers a read-again action when assistant messages exist and triggers onReadAgain', () => {
        const onReadAgain = vi.fn();
        const { getByRole, queryByRole } = render(
            <ControlBar
                mode="assistant"
                aiReady
                aiStatus="idle"
                isSpeaking={false}
                isListening={false}
                docText={null}
                isReading={false}
                isProcessingDoc={false}
                currencyResult={null}
                currencyScanning={false}
                currencyMonitoring={false}
                hasAssistantMessages
                readerAligned={false}
                onCapture={vi.fn()}
                onStopSpeaking={vi.fn()}
                onStartListening={vi.fn()}
                onStopListening={vi.fn()}
                onCurrencyCapture={vi.fn()}
                onReplayCurrencyDetails={vi.fn()}
                onClearTotal={vi.fn()}
                onReadAgain={onReadAgain}
                onReadDocument={vi.fn()}
                onReplayDocument={vi.fn()}
                onStopReading={vi.fn()}
            />,
        );

        const readAgainBtn = getByRole('button', { name: 'อ่านใหม่' });
        expect(readAgainBtn).toBeTruthy();
        expect(queryByRole('button', { name: 'หยุดเสียง' })).toBeNull();

        fireEvent.click(readAgainBtn);
        expect(onReadAgain).toHaveBeenCalledOnce();
    });

    it('shows stop-speech when no assistant messages exist', () => {
        const onStopSpeaking = vi.fn();
        const { getByRole, queryByRole } = render(
            <ControlBar
                mode="assistant"
                aiReady
                aiStatus="idle"
                isSpeaking
                isListening={false}
                docText={null}
                isReading={false}
                isProcessingDoc={false}
                currencyResult={null}
                currencyScanning={false}
                currencyMonitoring={false}
                hasAssistantMessages={false}
                readerAligned={false}
                onCapture={vi.fn()}
                onStopSpeaking={onStopSpeaking}
                onStartListening={vi.fn()}
                onStopListening={vi.fn()}
                onCurrencyCapture={vi.fn()}
                onReplayCurrencyDetails={vi.fn()}
                onClearTotal={vi.fn()}
                onReadDocument={vi.fn()}
                onReplayDocument={vi.fn()}
                onStopReading={vi.fn()}
            />,
        );

        expect(queryByRole('button', { name: 'อ่านใหม่' })).toBeNull();
        const stopBtn = getByRole('button', { name: 'หยุดเสียง' });
        expect(stopBtn).toBeTruthy();

        fireEvent.click(stopBtn);
        expect(onStopSpeaking).toHaveBeenCalledOnce();
    });

    it('toggles TTS guidance when onToggleGuidance is provided and displays เปิดเสียง when muted', () => {
        const onToggleGuidance = vi.fn();
        const { getByRole, rerender } = render(
            <ControlBar
                mode="assistant"
                aiReady
                aiStatus="idle"
                isSpeaking={false}
                isListening={false}
                docText={null}
                isReading={false}
                isProcessingDoc={false}
                currencyResult={null}
                currencyScanning={false}
                currencyMonitoring={false}
                hasAssistantMessages={false}
                isGuidanceMuted={false}
                readerAligned={false}
                onCapture={vi.fn()}
                onStopSpeaking={vi.fn()}
                onToggleGuidance={onToggleGuidance}
                onStartListening={vi.fn()}
                onStopListening={vi.fn()}
                onCurrencyCapture={vi.fn()}
                onReplayCurrencyDetails={vi.fn()}
                onClearTotal={vi.fn()}
                onReadDocument={vi.fn()}
                onReplayDocument={vi.fn()}
                onStopReading={vi.fn()}
            />,
        );

        const stopBtn = getByRole('button', { name: 'หยุดเสียง' });
        expect(stopBtn.getAttribute('aria-pressed')).toBe('false');
        fireEvent.click(stopBtn);
        expect(onToggleGuidance).toHaveBeenCalledOnce();

        rerender(
            <ControlBar
                mode="assistant"
                aiReady
                aiStatus="idle"
                isSpeaking={false}
                isListening={false}
                docText={null}
                isReading={false}
                isProcessingDoc={false}
                currencyResult={null}
                currencyScanning={false}
                currencyMonitoring={false}
                hasAssistantMessages={false}
                isGuidanceMuted={true}
                readerAligned={false}
                onCapture={vi.fn()}
                onStopSpeaking={vi.fn()}
                onToggleGuidance={onToggleGuidance}
                onStartListening={vi.fn()}
                onStopListening={vi.fn()}
                onCurrencyCapture={vi.fn()}
                onReplayCurrencyDetails={vi.fn()}
                onClearTotal={vi.fn()}
                onReadDocument={vi.fn()}
                onReplayDocument={vi.fn()}
                onStopReading={vi.fn()}
            />,
        );

        const resumeBtn = getByRole('button', { name: 'เปิดเสียง' });
        expect(resumeBtn.getAttribute('aria-pressed')).toBe('true');
    });

    it('offers detail playback and reset actions in currency mode', () => {
        const { getByRole, queryByRole } = render(
            <ControlBar
                mode="currency"
                aiReady
                aiStatus="idle"
                isSpeaking={false}
                isListening={false}
                docText={null}
                isReading={false}
                isProcessingDoc={false}
                currencyResult={{
                    captureId: 1,
                    source: 'gemini',
                    total: 100,
                    signature: 'note-100-1',
                    items: [{ type: 'note', value: 100, quantity: 1, locations: ['center'] }],
                }}
                currencyScanning={false}
                currencyMonitoring
                totalAmount={250}
                readerAligned={false}
                onCapture={vi.fn()}
                onStopSpeaking={vi.fn()}
                onStartListening={vi.fn()}
                onStopListening={vi.fn()}
                onCurrencyCapture={vi.fn()}
                onReplayCurrencyDetails={vi.fn()}
                onClearTotal={vi.fn()}
                onReadDocument={vi.fn()}
                onReplayDocument={vi.fn()}
                onStopReading={vi.fn()}
            />,
        );

        expect(getByRole('button', { name: 'ฟังรายละเอียดเงินล่าสุด' })).toBeTruthy();
        expect(getByRole('button', { name: /ล้างยอดเงินสะสม ปัจจุบัน 250 บาท/ })).toBeTruthy();
        expect(queryByRole('button', { name: /ฟังยอดรวม/ })).toBeNull();
    });

    it('allows clearing a detected banknote even when the accumulated total is zero', () => {
        const onClearTotal = vi.fn();
        const { getByRole } = render(
            <ControlBar
                mode="currency"
                aiReady
                aiStatus="idle"
                isSpeaking={false}
                isListening={false}
                docText={null}
                isReading={false}
                isProcessingDoc={false}
                currencyResult={{
                    captureId: 1,
                    source: 'gemini',
                    total: 100,
                    signature: 'note-100-1',
                    items: [{ type: 'note', value: 100, quantity: 1, locations: ['center'] }],
                }}
                currencyScanning={false}
                currencyMonitoring
                totalAmount={0}
                readerAligned={false}
                onCapture={vi.fn()}
                onStopSpeaking={vi.fn()}
                onStartListening={vi.fn()}
                onStopListening={vi.fn()}
                onCurrencyCapture={vi.fn()}
                onReplayCurrencyDetails={vi.fn()}
                onClearTotal={onClearTotal}
                onReadDocument={vi.fn()}
                onReplayDocument={vi.fn()}
                onStopReading={vi.fn()}
            />,
        );

        fireEvent.click(getByRole('button', { name: /ล้างยอดเงินสะสม ปัจจุบัน 0 บาท/ }));

        expect(onClearTotal).toHaveBeenCalledOnce();
    });

    it('starts a manual currency scan when the take-photo action is pressed', () => {
        const onCurrencyCapture = vi.fn();
        const { getByRole } = render(
            <ControlBar
                mode="currency"
                aiReady
                aiStatus="idle"
                isSpeaking={false}
                isListening={false}
                docText={null}
                isReading={false}
                isProcessingDoc={false}
                currencyResult={null}
                currencyScanning={false}
                currencyMonitoring
                readerAligned={false}
                onCapture={vi.fn()}
                onStopSpeaking={vi.fn()}
                onStartListening={vi.fn()}
                onStopListening={vi.fn()}
                onCurrencyCapture={onCurrencyCapture}
                onReplayCurrencyDetails={vi.fn()}
                onClearTotal={vi.fn()}
                onReadDocument={vi.fn()}
                onReplayDocument={vi.fn()}
                onStopReading={vi.fn()}
            />,
        );

        fireEvent.click(getByRole('button', { name: 'ถ่ายเองเพื่อสแกนเงินตอนนี้' }));
        expect(onCurrencyCapture).toHaveBeenCalledOnce();
    });
    it('renders real buttons with one accessible name and aria-disabled when unavailable', () => {
        const onClearMessages = vi.fn();
        const onCapture = vi.fn();
        const { getByRole, getAllByRole, queryByRole } = render(
            <ControlBar
                mode="assistant"
                aiReady
                aiStatus="idle"
                isSpeaking={false}
                isListening={false}
                docText={null}
                isReading={false}
                isProcessingDoc={false}
                currencyResult={null}
                currencyScanning={false}
                currencyMonitoring={false}
                hasAssistantMessages={false}
                readerAligned={false}
                onCapture={onCapture}
                onStopSpeaking={vi.fn()}
                onStartListening={vi.fn()}
                onStopListening={vi.fn()}
                onCurrencyCapture={vi.fn()}
                onReplayCurrencyDetails={vi.fn()}
                onClearTotal={vi.fn()}
                onClearMessages={onClearMessages}
                onReadDocument={vi.fn()}
                onReplayDocument={vi.fn()}
                onStopReading={vi.fn()}
            />,
        );

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
    it('keeps the manual currency capture button usable while auto-scan is checking', () => {
        const onCurrencyCapture = vi.fn();
        const { getByRole } = render(
            <ControlBar
                mode="currency"
                aiReady
                aiStatus="idle"
                isSpeaking={false}
                isListening={false}
                docText={null}
                isReading={false}
                isProcessingDoc={false}
                currencyResult={null}
                currencyScanning
                currencyMonitoring
                readerAligned={false}
                onCapture={vi.fn()}
                onStopSpeaking={vi.fn()}
                onStartListening={vi.fn()}
                onStopListening={vi.fn()}
                onCurrencyCapture={onCurrencyCapture}
                onReplayCurrencyDetails={vi.fn()}
                onClearTotal={vi.fn()}
                onReadDocument={vi.fn()}
            />,
        );

        const capture = getByRole('button', { name: 'ถ่ายเองเพื่อสแกนเงินตอนนี้' });
        expect(capture.getAttribute('aria-disabled')).toBeNull();
        fireEvent.click(capture);
        expect(onCurrencyCapture).toHaveBeenCalledOnce();
    });
    it('never leaves a locked capture button silent and says why in its name', () => {
        const onDisabledPress = vi.fn();
        const onCapture = vi.fn();
        const base = {
            mode: 'assistant' as const,
            aiStatus: 'idle' as const,
            isSpeaking: false,
            docText: null,
            isReading: false,
            isProcessingDoc: false,
            currencyResult: null,
            currencyScanning: false,
            currencyMonitoring: false,
            readerAligned: false,
            onCapture,
            onStopSpeaking: vi.fn(),
            onStartListening: vi.fn(),
            onStopListening: vi.fn(),
            onCurrencyCapture: vi.fn(),
            onReplayCurrencyDetails: vi.fn(),
            onClearTotal: vi.fn(),
            onReadDocument: vi.fn(),
            onDisabledPress,
        };

        const camera = render(<ControlBar {...base} aiReady={false} isListening={false} />);
        const waiting = camera.getByRole('button', { name: 'กล้องยังไม่พร้อม รอสักครู่' });
        fireEvent.click(waiting);
        expect(onDisabledPress).toHaveBeenCalledTimes(1);
        expect(onCapture).not.toHaveBeenCalled();
        camera.unmount();

        const thinking = render(<ControlBar {...base} aiReady aiStatus="thinking" isListening={false} />);
        fireEvent.click(thinking.getByRole('button', { name: 'AI กำลังคิด รอสักครู่' }));
        expect(onDisabledPress).toHaveBeenCalledTimes(2);
        thinking.unmount();

        const listening = render(<ControlBar {...base} aiReady isListening />);
        fireEvent.click(listening.getByRole('button', { name: 'กำลังฟังอยู่ กดหยุดและส่งก่อน' }));
        expect(onDisabledPress).toHaveBeenCalledTimes(3);
        expect(onCapture).not.toHaveBeenCalled();
    });

    it('offers to read a new page once a document has been read', () => {
        const { getByRole } = render(
            <ControlBar
                mode="reader"
                aiReady
                aiStatus="idle"
                isSpeaking={false}
                isListening={false}
                docText="ข้อความที่อ่านแล้ว"
                isProcessingDoc={false}
                currencyResult={null}
                currencyScanning={false}
                currencyMonitoring={false}
                readerAligned={false}
                onCapture={vi.fn()}
                onStopSpeaking={vi.fn()}
                onStartListening={vi.fn()}
                onStopListening={vi.fn()}
                onCurrencyCapture={vi.fn()}
                onReplayCurrencyDetails={vi.fn()}
                onClearTotal={vi.fn()}
                onReadDocument={vi.fn()}
            />,
        );
        expect(getByRole('button', { name: 'อ่านหน้าใหม่' })).toBeTruthy();
    });
});

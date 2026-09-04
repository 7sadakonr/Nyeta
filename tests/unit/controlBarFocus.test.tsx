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
});

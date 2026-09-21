// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ControlBar from '@/features/blind-assistant/components/ControlBar';

describe('ControlBar', () => {
    beforeEach(() => {
        const canvasContext = {
            clearRect: () => {},
            fillRect: () => {},
            set fillStyle(_value: string | CanvasGradient | CanvasPattern) {},
            set globalAlpha(_value: number) {},
        } as unknown as CanvasRenderingContext2D;
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((() => canvasContext) as never);
    });

    afterEach(() => {
        cleanup();
        vi.restoreAllMocks();
    });

    it('keeps the voice button focused while swapping its mic icon for a listening waveform', () => {
        const onStartListening = vi.fn();
        const onStopListening = vi.fn();
        const props = {
            mode: 'assistant' as const,
            aiReady: true,
            aiStatus: 'idle' as const,
            isSpeaking: false,
            docText: null,
            isReading: false,
            isProcessingDoc: false,
            currencyResult: null,
            currencyScanning: false,
            currencyMonitoring: false,
            readerAligned: false,
            onCapture: vi.fn(),
            onStopSpeaking: vi.fn(),
            onStartListening,
            onStopListening,
            onCurrencyCapture: vi.fn(),
            onReplayCurrencyDetails: vi.fn(),
            onClearTotal: vi.fn(),
            onReadDocument: vi.fn(),
            onReplayDocument: vi.fn(),
            onStopReading: vi.fn(),
        };
        const { getByRole, queryByTestId, rerender } = render(
            <ControlBar {...props} isListening={false} />,
        );

        const idleButton = getByRole('button', { name: 'ถามด้วยเสียง' });
        expect(idleButton.querySelector('[data-testid="voice-mic-icon"]')).toBeTruthy();
        expect(queryByTestId('voice-waveform')).toBeNull();
        fireEvent.click(idleButton);
        expect(onStartListening).toHaveBeenCalledOnce();

        idleButton.focus();
        rerender(<ControlBar {...props} isListening />);

        const listeningButton = getByRole('button', { name: 'กำลังฟัง แตะอีกครั้งเพื่อหยุดและส่ง' });
        expect(document.activeElement).toBe(listeningButton);
        expect(listeningButton.getAttribute('aria-pressed')).toBe('true');
        expect(queryByTestId('voice-waveform')?.getAttribute('aria-hidden')).toBe('true');
        fireEvent.click(listeningButton);
        expect(onStopListening).toHaveBeenCalledOnce();
    });

    it('starts and stops voice input with Enter and Space', () => {
        const onStartListening = vi.fn();
        const onStopListening = vi.fn();
        const props = {
            mode: 'assistant' as const,
            aiReady: true,
            aiStatus: 'idle' as const,
            isSpeaking: false,
            docText: null,
            isReading: false,
            isProcessingDoc: false,
            currencyResult: null,
            currencyScanning: false,
            currencyMonitoring: false,
            readerAligned: false,
            onCapture: vi.fn(),
            onStopSpeaking: vi.fn(),
            onStartListening,
            onStopListening,
            onCurrencyCapture: vi.fn(),
            onReplayCurrencyDetails: vi.fn(),
            onClearTotal: vi.fn(),
            onReadDocument: vi.fn(),
            onReplayDocument: vi.fn(),
            onStopReading: vi.fn(),
        };
        const { getByRole, rerender } = render(<ControlBar {...props} isListening={false} />);

        fireEvent.keyDown(getByRole('button', { name: 'ถามด้วยเสียง' }), { key: 'Enter' });
        expect(onStartListening).toHaveBeenCalledOnce();

        rerender(<ControlBar {...props} isListening />);
        fireEvent.keyDown(getByRole('button', { name: 'กำลังฟัง แตะอีกครั้งเพื่อหยุดและส่ง' }), { key: ' ' });
        expect(onStopListening).toHaveBeenCalledOnce();
    });

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
});

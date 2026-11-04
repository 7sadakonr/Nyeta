// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { captureSharpestFrame, callGeminiVision, analyzePageAlignment } = vi.hoisted(() => ({
    captureSharpestFrame: vi.fn(),
    callGeminiVision: vi.fn(),
    analyzePageAlignment: vi.fn(),
}));

vi.mock('@/features/blind-assistant/client/geminiVision', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/features/blind-assistant/client/geminiVision')>()),
    captureSharpestFrame,
    callGeminiVision,
}));
vi.mock('@/features/blind-assistant/client/pageEdgeDetection', () => ({
    preloadPageScanner: vi.fn().mockResolvedValue(undefined),
    analyzePageAlignment,
}));
vi.mock('@/shared/accessibility/speechController', () => ({ speechController: { speak: vi.fn(), stop: vi.fn(), isOrientationBlocked: false } }));
vi.mock('@/shared/accessibility/audio', () => ({ startProcessingEarcon: vi.fn(() => vi.fn()) }));

import { useDocumentReader } from '@/features/blind-assistant/hooks/useDocumentReader';

describe('useDocumentReader lifecycle', () => {
    const feedback = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        analyzePageAlignment.mockResolvedValue({ detected: false });
        captureSharpestFrame.mockResolvedValue('data:image/jpeg;base64,page');
        callGeminiVision.mockResolvedValue('หัวข้อ\n\nเนื้อหาของเอกสาร');
    });

    const setup = () => {
        const video = document.createElement('video');
        return renderHook(() => useDocumentReader({ current: video }, true, true, false, 'idle', feedback));
    };

    it('reads a document and exposes the text', async () => {
        const { result } = setup();

        await act(async () => { await result.current.readDocument(); });

        expect(callGeminiVision).toHaveBeenCalledWith(expect.objectContaining({ mode: 'reader', maxTokens: 4096 }));
        expect(result.current.docText).toBe('หัวข้อ\n\nเนื้อหาของเอกสาร');
        expect(result.current.docIsError).toBe(false);
    });

    it('drops a result when the user leaves the tab while the frame is still being captured', async () => {
        let finishCapture: ((value: string) => void) | undefined;
        captureSharpestFrame.mockReturnValue(new Promise<string>((resolve) => { finishCapture = resolve; }));
        const { result } = setup();

        let reading: Promise<void> | undefined;
        await act(async () => { reading = result.current.readDocument(); });
        act(() => result.current.resetDocument());
        await act(async () => { finishCapture?.('data:image/jpeg;base64,late'); await reading; });

        // Nothing was sent and nothing reappears when the user comes back to the reader tab.
        expect(callGeminiVision).not.toHaveBeenCalled();
        expect(result.current.docText).toBe('');
        expect(result.current.isProcessing).toBe(false);
    });

    it('lets automatic capture try again after a failed frame grab', async () => {
        captureSharpestFrame.mockResolvedValueOnce(null).mockResolvedValueOnce('data:image/jpeg;base64,page');
        const { result } = setup();

        await act(async () => { await result.current.readDocument(); });
        expect(callGeminiVision).not.toHaveBeenCalled();

        await act(async () => { await result.current.readDocument(); });
        expect(callGeminiVision).toHaveBeenCalledOnce();
    });

    it('describes a failure in the result area, flagged as an error', async () => {
        const { GeminiRequestError } = await import('@/features/blind-assistant/client/geminiVision');
        callGeminiVision.mockRejectedValue(new GeminiRequestError('busy', 'high demand', 503));
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const { result } = setup();

        await act(async () => { await result.current.readDocument(); });

        expect(result.current.docIsError).toBe(true);
        expect(result.current.docText).toContain('ยุ่ง');
    });

    it('restartScan clears the result and error so the next page can be found', async () => {
        const { result } = setup();
        await act(async () => { await result.current.readDocument(); });
        expect(result.current.docText).not.toBe('');

        act(() => result.current.restartScan());

        expect(result.current.docText).toBe('');
        expect(result.current.docIsError).toBe(false);
    });
});

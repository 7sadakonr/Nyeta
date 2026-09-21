// @vitest-environment jsdom

import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import VoiceWaveform from '@/shared/ui/VoiceWaveform';

const getUserMedia = vi.fn();
const stopTrack = vi.fn();
const disconnect = vi.fn();
const connect = vi.fn();
const close = vi.fn(() => Promise.resolve());
const resume = vi.fn(() => Promise.resolve());
const getByteFrequencyData = vi.fn((buffer: Uint8Array) => buffer.fill(64));
let audioContextState: AudioContextState = 'running';

class MockAudioContext {
    state: AudioContextState = audioContextState;
    createMediaStreamSource = vi.fn(() => ({ connect, disconnect }));
    createAnalyser = vi.fn(() => ({
        fftSize: 0,
        smoothingTimeConstant: 0,
        frequencyBinCount: 128,
        getByteFrequencyData,
    }));
    close = close;
    resume = resume;
}

describe('VoiceWaveform', () => {
    beforeEach(() => {
        audioContextState = 'running';
        getUserMedia.mockReset();
        stopTrack.mockReset();
        disconnect.mockReset();
        connect.mockReset();
        close.mockClear();
        resume.mockClear();
        getByteFrequencyData.mockClear();
        vi.stubGlobal('AudioContext', MockAudioContext);
        vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
        vi.stubGlobal('cancelAnimationFrame', vi.fn());
        Object.defineProperty(navigator, 'mediaDevices', {
            configurable: true,
            value: { getUserMedia },
        });
        Object.defineProperty(document, 'hidden', { configurable: true, value: false });
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
        vi.unstubAllGlobals();
    });

    it('does not request microphone access while inactive', () => {
        render(<VoiceWaveform active={false} />);

        expect(getUserMedia).not.toHaveBeenCalled();
    });

    it('connects an analyser while active and releases every audio resource when deactivated', async () => {
        const stream = { getTracks: () => [{ stop: stopTrack }] } as unknown as MediaStream;
        getUserMedia.mockResolvedValue(stream);
        const { getByTestId, rerender } = render(<VoiceWaveform active color="#FF453A" />);

        await waitFor(() => expect(getUserMedia).toHaveBeenCalledWith({ audio: true }));
        expect(getByTestId('voice-waveform').getAttribute('aria-hidden')).toBe('true');
        expect(connect).toHaveBeenCalledOnce();

        rerender(<VoiceWaveform active={false} color="#FF453A" />);

        await waitFor(() => expect(stopTrack).toHaveBeenCalledOnce());
        expect(disconnect).toHaveBeenCalledOnce();
        expect(close).toHaveBeenCalledOnce();
        expect(cancelAnimationFrame).toHaveBeenCalledWith(1);
    });

    it('keeps a quiet visual fallback when microphone access is denied', async () => {
        getUserMedia.mockRejectedValue(new DOMException('denied', 'NotAllowedError'));
        const { getByTestId } = render(<VoiceWaveform active />);

        await waitFor(() => expect(close).toHaveBeenCalledOnce());
        expect(getByTestId('voice-waveform')).toBeTruthy();
        expect(requestAnimationFrame).not.toHaveBeenCalled();
    });

    it('does not request a microphone after unmounting during an AudioContext resume', async () => {
        audioContextState = 'suspended';
        let resolveResume: (() => void) | undefined;
        resume.mockImplementationOnce(() => new Promise<void>(resolve => { resolveResume = resolve; }));
        const { unmount } = render(<VoiceWaveform active />);

        await waitFor(() => expect(resume).toHaveBeenCalledOnce());
        unmount();
        await act(async () => resolveResume?.());

        expect(getUserMedia).not.toHaveBeenCalled();
    });

    it('restarts microphone visualization after returning from a hidden page', async () => {
        const firstTrackStop = vi.fn();
        const secondTrackStop = vi.fn();
        const firstStream = { getTracks: () => [{ stop: firstTrackStop }] } as unknown as MediaStream;
        const secondStream = { getTracks: () => [{ stop: secondTrackStop }] } as unknown as MediaStream;
        getUserMedia.mockResolvedValueOnce(firstStream).mockResolvedValueOnce(secondStream);
        render(<VoiceWaveform active />);

        await waitFor(() => expect(connect).toHaveBeenCalledOnce());
        Object.defineProperty(document, 'hidden', { configurable: true, value: true });
        act(() => document.dispatchEvent(new Event('visibilitychange')));
        expect(firstTrackStop).toHaveBeenCalledOnce();

        Object.defineProperty(document, 'hidden', { configurable: true, value: false });
        act(() => document.dispatchEvent(new Event('visibilitychange')));
        await waitFor(() => expect(connect).toHaveBeenCalledTimes(2));
    });
});

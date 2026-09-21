// @vitest-environment jsdom

import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import VoiceWaveform from '@/shared/ui/VoiceWaveform';

const getUserMedia = vi.fn();
describe('VoiceWaveform', () => {
    beforeEach(() => {
        getUserMedia.mockReset();
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

    it('does not acquire a second microphone stream while speech recognition is active', async () => {
        render(<VoiceWaveform active />);

        await act(async () => {});

        expect(getUserMedia).not.toHaveBeenCalled();
    });

    it('animates while active without creating audio resources', async () => {
        const { getByTestId, rerender } = render(<VoiceWaveform active color="#FF453A" />);

        await waitFor(() => expect(requestAnimationFrame).toHaveBeenCalled());
        expect(getByTestId('voice-waveform').getAttribute('aria-hidden')).toBe('true');
        expect(getUserMedia).not.toHaveBeenCalled();

        rerender(<VoiceWaveform active={false} color="#FF453A" />);

        expect(cancelAnimationFrame).toHaveBeenCalledWith(1);
    });

    it('continues showing a visual waveform when microphone permission is denied elsewhere', async () => {
        const { getByTestId } = render(<VoiceWaveform active />);

        await waitFor(() => expect(requestAnimationFrame).toHaveBeenCalled());
        expect(getByTestId('voice-waveform')).toBeTruthy();
        expect(getUserMedia).not.toHaveBeenCalled();
    });

    it('stops visual animation after unmounting', async () => {
        const { unmount } = render(<VoiceWaveform active />);

        unmount();

        expect(getUserMedia).not.toHaveBeenCalled();
        expect(cancelAnimationFrame).toHaveBeenCalledWith(1);
    });

    it('restarts the visual animation after returning from a hidden page', async () => {
        render(<VoiceWaveform active />);

        await waitFor(() => expect(requestAnimationFrame).toHaveBeenCalledOnce());
        Object.defineProperty(document, 'hidden', { configurable: true, value: true });
        act(() => document.dispatchEvent(new Event('visibilitychange')));
        expect(cancelAnimationFrame).toHaveBeenCalledWith(1);

        Object.defineProperty(document, 'hidden', { configurable: true, value: false });
        act(() => document.dispatchEvent(new Event('visibilitychange')));
        await waitFor(() => expect(requestAnimationFrame).toHaveBeenCalledTimes(2));
    });
});

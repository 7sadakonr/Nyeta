// @vitest-environment jsdom

import { fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { speak, unlockAudio, playEarcon } = vi.hoisted(() => ({ 
    speak: vi.fn(), 
    unlockAudio: vi.fn(),
    playEarcon: vi.fn(),
}));

vi.mock('@/shared/accessibility/speechController', () => ({
    speechController: { speak, unlockAudio },
}));

vi.mock('@/shared/accessibility/audio', () => ({
    playEarcon,
}));

import WelcomeScreen from '@/features/blind-app/WelcomeScreen';

describe('WelcomeScreen speech ownership', () => {
    beforeEach(() => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        Object.defineProperty(navigator, 'mediaDevices', {
            configurable: true,
            value: { getUserMedia: vi.fn() },
        });
    });

    afterEach(() => vi.restoreAllMocks());

    it('plays earcon beep and speaks short unlock phrase "นัยตา" on start, then enters app', async () => {
        const onStart = vi.fn();
        const stop = vi.fn();
        vi.mocked(navigator.mediaDevices.getUserMedia).mockResolvedValue({
            getTracks: () => [{ stop }],
        } as unknown as MediaStream);
        const { getByRole } = render(<WelcomeScreen onStart={onStart} />);

        expect(speak).not.toHaveBeenCalled();

        fireEvent.click(getByRole('button', { name: 'เริ่มใช้งาน และอนุญาตกล้อง' }));

        expect(playEarcon).toHaveBeenCalledWith('button');
        expect(unlockAudio).toHaveBeenCalledWith();
        expect(speak).toHaveBeenCalledWith('นัยตา', { channel: 'status' });
        await waitFor(() => expect(stop).toHaveBeenCalledTimes(1));
        expect(onStart).toHaveBeenCalledTimes(1);
    });

    it('asks for the camera only and remembers that onboarding is done', async () => {
        const stop = vi.fn();
        vi.mocked(navigator.mediaDevices.getUserMedia).mockResolvedValue({
            getTracks: () => [{ stop }],
        } as unknown as MediaStream);
        const { getByRole } = render(<WelcomeScreen onStart={vi.fn()} />);

        fireEvent.click(getByRole('button', { name: 'เริ่มใช้งาน และอนุญาตกล้อง' }));

        await waitFor(() => expect(stop).toHaveBeenCalled());
        expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({ video: { facingMode: 'environment' } });
        expect(window.localStorage.getItem('nyeta_onboarded')).toBe('1');
    });

    it('enters the app after 8 seconds if the permission request never settles, and releases a late stream', async () => {
        vi.useFakeTimers();
        window.localStorage.removeItem('nyeta_onboarded');
        const stop = vi.fn();
        let resolveLate: ((stream: MediaStream) => void) | undefined;
        vi.mocked(navigator.mediaDevices.getUserMedia).mockReturnValue(new Promise<MediaStream>((resolve) => { resolveLate = resolve; }));
        const onStart = vi.fn();
        const { getByRole } = render(<WelcomeScreen onStart={onStart} />);

        fireEvent.click(getByRole('button', { name: 'เริ่มใช้งาน และอนุญาตกล้อง' }));
        await vi.advanceTimersByTimeAsync(7999);
        expect(onStart).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(2);
        expect(onStart).toHaveBeenCalledTimes(1);
        // Not remembered: the permission was never actually granted.
        expect(window.localStorage.getItem('nyeta_onboarded')).toBeNull();

        await vi.advanceTimersByTimeAsync(0);
        resolveLate?.({ getTracks: () => [{ stop }] } as unknown as MediaStream);
        await vi.advanceTimersByTimeAsync(0);
        expect(stop).toHaveBeenCalledTimes(1);
        vi.useRealTimers();
    });

    it('uses critical Web TTS without a duplicate live region for permission errors', async () => {
        vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValue(new Error('denied'));
        const { getByRole, getByText } = render(<WelcomeScreen onStart={vi.fn()} />);

        fireEvent.click(getByRole('button', { name: 'เริ่มใช้งาน และอนุญาตกล้อง' }));

        const message = await waitFor(() => getByText(/ไม่สามารถเข้าถึงกล้องได้/));
        expect(speak).toHaveBeenCalledWith(message.textContent, { channel: 'critical' });
        expect(message.getAttribute('role')).toBeNull();
        expect(message.getAttribute('aria-live')).toBeNull();
    });
});

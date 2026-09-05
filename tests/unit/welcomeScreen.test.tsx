// @vitest-environment jsdom

import { fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { speak, unlockAudio } = vi.hoisted(() => ({ speak: vi.fn(), unlockAudio: vi.fn() }));

vi.mock('@/shared/accessibility/speechController', () => ({
    speechController: { speak, unlockAudio },
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

    it('announces preparation without a second speech after permission succeeds', async () => {
        const onStart = vi.fn();
        const stop = vi.fn();
        vi.mocked(navigator.mediaDevices.getUserMedia).mockResolvedValue({
            getTracks: () => [{ stop }],
        } as unknown as MediaStream);
        const { getByRole } = render(<WelcomeScreen onStart={onStart} />);

        fireEvent.click(getByRole('button', { name: 'เริ่มใช้งาน และอนุญาตกล้อง' }));

        expect(unlockAudio).toHaveBeenCalledWith();
        expect(speak).toHaveBeenCalledWith('กำลังเตรียมความพร้อม กรุณารอสักครู่', { channel: 'status' });
        await waitFor(() => expect(stop).toHaveBeenCalledTimes(1));
        expect(speak).not.toHaveBeenCalledWith('อนุญาตสำเร็จ กำลังเข้าสู่แอป', { channel: 'status' });
    });

    it('uses critical Web TTS without a duplicate live region for permission errors', async () => {
        vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValue(new Error('denied'));
        const { getByRole, getByText } = render(<WelcomeScreen onStart={vi.fn()} />);

        fireEvent.click(getByRole('button', { name: 'เริ่มใช้งาน และอนุญาตกล้อง' }));

        const message = await waitFor(() => getByText(/ไม่สามารถเข้าถึงกล้องหรือไมโครโฟนได้/));
        expect(speak).toHaveBeenCalledWith(message.textContent, { channel: 'critical' });
        expect(message.getAttribute('role')).toBeNull();
        expect(message.getAttribute('aria-live')).toBeNull();
    });
});

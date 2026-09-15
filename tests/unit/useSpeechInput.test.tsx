// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { speak, stop, beginListening, endListening, notifyUserNavigation, getSnapshot, unlockAudio } = vi.hoisted(() => ({
    speak: vi.fn(),
    stop: vi.fn(),
    beginListening: vi.fn(() => true),
    endListening: vi.fn(),
    notifyUserNavigation: vi.fn(),
    getSnapshot: vi.fn(),
    unlockAudio: vi.fn(),
}));

vi.mock('@/shared/accessibility/speechController', () => ({
    speechController: { speak, stop, beginListening, endListening, notifyUserNavigation, getSnapshot, unlockAudio },
}));

import { useSpeechInput } from '@/features/blind-assistant/hooks/useSpeechInput';
import { mediaSessionManager } from '@/shared/media/mediaSessionManager';

class MockMediaRecorder {
    static instances: MockMediaRecorder[] = [];
    static latest: MockMediaRecorder | null = null;
    static isTypeSupported = vi.fn(() => true);

    state: 'inactive' | 'recording' | 'paused' = 'inactive';
    stream: MediaStream;
    ondataavailable: ((event: any) => void) | null = null;
    onstop: (() => void) | null = null;
    onerror: ((event: any) => void) | null = null;

    start = vi.fn(() => {
        this.state = 'recording';
    });

    stop = vi.fn(async () => {
        this.state = 'inactive';
        // Emit a chunk
        this.ondataavailable?.({ data: new Blob(['fake audio chunk'], { type: 'audio/webm' }) });
        await this.onstop?.();
    });

    constructor(stream: MediaStream) {
        this.stream = stream;
        MockMediaRecorder.instances.push(this);
        MockMediaRecorder.latest = this;
    }
}

describe('useSpeechInput with MediaRecorder and /api/transcribe', () => {
    let mockAudioTrack: any;
    let mockStream: any;
    let globalFetch: any;

    beforeEach(() => {
        mockAudioTrack = { stop: vi.fn(), readyState: 'live', muted: false };
        mockStream = {
            getTracks: () => [mockAudioTrack],
            getAudioTracks: () => [mockAudioTrack],
        };

        Object.defineProperty(navigator, 'mediaDevices', {
            configurable: true,
            value: {
                getUserMedia: vi.fn().mockResolvedValue(mockStream),
            },
        });

        MockMediaRecorder.instances = [];
        MockMediaRecorder.latest = null;
        vi.stubGlobal('MediaRecorder', MockMediaRecorder);

        globalFetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ text: 'นี่คืออะไร' }),
        });
        vi.stubGlobal('fetch', globalFetch);

        beginListening.mockClear();
        endListening.mockClear();
        speak.mockClear();
    });

    afterEach(async () => {
        vi.unstubAllGlobals();
        await mediaSessionManager.endVoiceCapture();
    });

    it('starts MediaRecorder, sets state to listening, and suppresses TTS guidance on startListening', async () => {
        const onResult = vi.fn();
        const { result } = renderHook(() => useSpeechInput(onResult));

        await act(async () => {
            await result.current.startListening();
        });

        expect(beginListening).toHaveBeenCalledOnce();
        expect(MockMediaRecorder.latest).not.toBeNull();
        expect(MockMediaRecorder.latest?.start).toHaveBeenCalledOnce();
        expect(result.current.state).toBe('listening');
        expect(result.current.isListening).toBe(true);
    });

    it('stops recorder, releases mic tracks, transcribes audio, and calls onResult', async () => {
        const onResult = vi.fn();
        const { result } = renderHook(() => useSpeechInput(onResult));

        await act(async () => {
            await result.current.startListening();
        });

        const recorder = MockMediaRecorder.latest!;

        await act(async () => {
            result.current.stopListening();
            await new Promise((r) => setTimeout(r, 150));
        });

        expect(recorder.stop).toHaveBeenCalledOnce();
        expect(mockAudioTrack.stop).toHaveBeenCalled();
        expect(globalFetch).toHaveBeenCalledWith('/api/transcribe', expect.any(Object));
        expect(onResult).toHaveBeenCalledWith('นี่คืออะไร');
        expect(endListening).toHaveBeenCalled();
        expect(result.current.state).toBe('idle');
    });

    it('protects against rapid double clicks by maintaining a single active session', async () => {
        const onResult = vi.fn();
        const { result } = renderHook(() => useSpeechInput(onResult));

        await act(async () => {
            void result.current.startListening();
            void result.current.startListening();
        });

        expect(MockMediaRecorder.instances.length).toBe(1);
    });

    it('cleans up and stops tracks on cancelListening', async () => {
        const onResult = vi.fn();
        const { result } = renderHook(() => useSpeechInput(onResult));

        await act(async () => {
            await result.current.startListening();
        });

        act(() => {
            result.current.cancelListening();
        });

        expect(mockAudioTrack.stop).toHaveBeenCalled();
        expect(endListening).toHaveBeenCalled();
        expect(result.current.state).toBe('idle');
        expect(onResult).not.toHaveBeenCalled();
    });

    it('cleans up properly when unmounted during active recording', async () => {
        const onResult = vi.fn();
        const { result, unmount } = renderHook(() => useSpeechInput(onResult));

        await act(async () => {
            await result.current.startListening();
        });

        unmount();

        expect(mockAudioTrack.stop).toHaveBeenCalled();
        expect(endListening).toHaveBeenCalled();
    });

    it('handles mic permission error gracefully with audio feedback', async () => {
        Object.defineProperty(navigator, 'mediaDevices', {
            configurable: true,
            value: {
                getUserMedia: vi.fn().mockRejectedValue(new Error('Permission denied')),
            },
        });

        const onResult = vi.fn();
        const { result } = renderHook(() => useSpeechInput(onResult));

        await act(async () => {
            await result.current.startListening();
        });

        expect(speak).toHaveBeenCalledWith(
            expect.stringContaining('ไม่สามารถเข้าถึงไมโครโฟนได้'),
            expect.any(Object)
        );
        expect(result.current.state).toBe('idle');
    });
});

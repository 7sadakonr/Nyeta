// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { captureFrameFromVideo, extractGeminiText } = vi.hoisted(() => ({
  captureFrameFromVideo: vi.fn(() => 'data:image/jpeg;base64,camera-frame'),
  extractGeminiText: vi.fn(() => 'คำตอบจาก AI'),
}));

const { speak, stop, beginListening, endListening, notifyUserNavigation, getSnapshot, unlockAudio } = vi.hoisted(() => ({
    speak: vi.fn(), stop: vi.fn(), beginListening: vi.fn(), endListening: vi.fn(), notifyUserNavigation: vi.fn(), getSnapshot: vi.fn(), unlockAudio: vi.fn()
}));

vi.mock('@/shared/accessibility/speechController', () => ({
    speechController: { speak, stop, beginListening, endListening, notifyUserNavigation, getSnapshot, unlockAudio }
}));

vi.mock('@/features/blind-assistant/client/geminiVision', () => ({
  captureFrameFromVideo,
  extractGeminiText,
}));

import { useAiAssistant } from '@/features/blind-assistant/hooks/useAiAssistant';

describe('useAiAssistant', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    captureFrameFromVideo.mockClear();
    extractGeminiText.mockClear();
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('captures the current frame when submitting a voice question', async () => {
    const video = document.createElement('video');
    const { result } = renderHook(() => useAiAssistant({ current: video }, true));

    await act(async () => {
      await result.current.askTextOnly('นี่คืออะไร');
    });

    expect(captureFrameFromVideo).toHaveBeenCalledWith(video, { maxDimension: 800, quality: 0.70 });
    const request = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(request.contents[0].parts).toEqual([
      { text: '(พูด): "นี่คืออะไร"' },
      { inlineData: { mimeType: 'image/jpeg', data: 'camera-frame' } },
    ]);
  });

  it('keeps the first image request active when capture is triggered twice', async () => {
    const responseResolvers: Array<(response: any) => void> = [];
    fetchMock.mockClear();
    fetchMock.mockImplementation(() => new Promise(resolve => responseResolvers.push(resolve)));
    const video = document.createElement('video');
    const { result } = renderHook(() => useAiAssistant({ current: video }, true));

    let firstRequest!: Promise<boolean>;
    let repeatedRequest!: Promise<boolean>;
    act(() => {
      firstRequest = result.current.captureAndAsk();
      repeatedRequest = result.current.captureAndAsk();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.isCaptureInProgress()).toBe(true);
    expect(result.current.status).toBe('thinking');

    responseResolvers[0]({ ok: true, json: async () => ({}) });
    await act(async () => {
      await Promise.all([firstRequest, repeatedRequest]);
    });

    expect(result.current.status).toBe('idle');
    expect(result.current.isCaptureInProgress()).toBe(false);
  });
});

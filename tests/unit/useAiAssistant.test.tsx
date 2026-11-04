// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { captureFrameFromVideo, callGeminiVision } = vi.hoisted(() => ({
  captureFrameFromVideo: vi.fn(() => 'data:image/jpeg;base64,camera-frame'),
  callGeminiVision: vi.fn(),
}));

const { speak, stop } = vi.hoisted(() => ({ speak: vi.fn(), stop: vi.fn() }));

vi.mock('@/shared/accessibility/speechController', () => ({
    speechController: { speak, stop },
}));

vi.mock('@/features/blind-assistant/client/geminiVision', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/blind-assistant/client/geminiVision')>()),
  captureFrameFromVideo,
  callGeminiVision,
}));

import { GeminiRequestError } from '@/features/blind-assistant/client/geminiVision';
import { useAiAssistant } from '@/features/blind-assistant/hooks/useAiAssistant';

describe('useAiAssistant', () => {
  const feedback = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    captureFrameFromVideo.mockReturnValue('data:image/jpeg;base64,camera-frame');
    callGeminiVision.mockResolvedValue('คำตอบจาก AI');
  });

  const setup = () => renderHook(() => useAiAssistant({ current: document.createElement('video') }, true, feedback));

  it('captures the current frame and sends it with the voice question', async () => {
    const video = document.createElement('video');
    const { result } = renderHook(() => useAiAssistant({ current: video }, true));

    await act(async () => {
      await result.current.askTextOnly('นี่คืออะไร');
    });

    expect(captureFrameFromVideo).toHaveBeenCalledWith(video, { maxDimension: 800, quality: 0.70 });
    const request = callGeminiVision.mock.calls[0][0];
    expect(request.mode).toBe('assistant');
    expect(request.contents[0].parts).toEqual([
      { text: '(พูด): "นี่คืออะไร"' },
      { inlineData: { mimeType: 'image/jpeg', data: 'camera-frame' } },
    ]);
    expect(result.current.messages.at(-1)).toMatchObject({ role: 'ai', content: 'คำตอบจาก AI' });
    expect(result.current.messages.at(-1)?.isError).toBeUndefined();
  });

  it('does not blame the internet when the model is busy (HTTP 503)', async () => {
    callGeminiVision.mockRejectedValue(new GeminiRequestError('busy', 'high demand', 503));
    const { result } = setup();

    await act(async () => { await result.current.captureAndAsk(); });

    const reply = result.current.messages.at(-1);
    expect(reply?.isError).toBe(true);
    expect(reply?.content).toContain('ยุ่ง');
    expect(reply?.content).not.toContain('อินเทอร์เน็ต');
    expect(feedback).toHaveBeenCalledWith('error');
  });

  it('reports a real connection failure as an internet problem', async () => {
    callGeminiVision.mockRejectedValue(new GeminiRequestError('offline', 'Failed to fetch'));
    const { result } = setup();

    await act(async () => { await result.current.captureAndAsk(); });

    expect(result.current.messages.at(-1)).toMatchObject({ isError: true });
    expect(result.current.messages.at(-1)?.content).toContain('อินเทอร์เน็ต');
  });

  it('marks an empty answer as an error', async () => {
    callGeminiVision.mockResolvedValue('');
    const { result } = setup();

    await act(async () => { await result.current.captureAndAsk(); });

    expect(result.current.messages.at(-1)).toMatchObject({ isError: true });
  });
});

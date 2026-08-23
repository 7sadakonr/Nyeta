// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { beginListeningSession, endListeningSession, speak } = vi.hoisted(() => ({
  beginListeningSession: vi.fn(() => true),
  endListeningSession: vi.fn(),
  speak: vi.fn(),
}));

vi.mock('@/shared/accessibility/speechManager', () => ({
  default: { beginListeningSession, endListeningSession, speak },
  Priority: { CRITICAL: 4 },
}));

import { useSpeechInput } from '@/features/blind-assistant/hooks/useSpeechInput';

class MockRecognition {
  static latest: MockRecognition | null = null;
  continuous = false;
  interimResults = false;
  lang = '';
  onstart: (() => void) | null = null;
  onend: (() => void) | null = null;
  onresult: ((event: any) => void) | null = null;
  onerror: ((event: any) => void) | null = null;
  start = vi.fn(() => this.onstart?.());
  stop = vi.fn();
  abort = vi.fn(() => this.onend?.());

  constructor() { MockRecognition.latest = this; }
}

describe('useSpeechInput', () => {
  beforeEach(() => {
    vi.stubGlobal('SpeechRecognition', MockRecognition);
    beginListeningSession.mockClear();
    endListeningSession.mockClear();
  });

  afterEach(() => vi.unstubAllGlobals());

  it('toggles recognition and submits its final transcript only after the session ends', () => {
    const onResult = vi.fn();
    const { result } = renderHook(() => useSpeechInput(onResult));
    const recognition = MockRecognition.latest!;

    act(() => result.current.toggleListening());
    expect(beginListeningSession).toHaveBeenCalledOnce();
    expect(recognition.start).toHaveBeenCalledOnce();

    act(() => recognition.onresult?.({ results: [{ 0: { transcript: 'ถามหน่อย' }, isFinal: true }] }));
    expect(onResult).not.toHaveBeenCalled();

    act(() => result.current.toggleListening());
    expect(recognition.stop).toHaveBeenCalledOnce();

    act(() => recognition.onend?.());
    expect(endListeningSession).toHaveBeenCalledOnce();
    expect(onResult).toHaveBeenCalledExactlyOnceWith('ถามหน่อย');
  });
});

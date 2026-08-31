// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { speak, stop, beginListening, endListening, notifyUserNavigation, getSnapshot } = vi.hoisted(() => ({
    speak: vi.fn(), stop: vi.fn(), beginListening: vi.fn(() => true), endListening: vi.fn(), notifyUserNavigation: vi.fn(), getSnapshot: vi.fn()
}));

vi.mock('@/shared/accessibility/speechController', () => ({
    speechController: { speak, stop, beginListening, endListening, notifyUserNavigation, getSnapshot }
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
    beginListening.mockClear();
    endListening.mockClear();
  });

  afterEach(() => vi.unstubAllGlobals());

  it('toggles recognition and submits its final transcript only after the session ends', () => {
    const onResult = vi.fn();
    const { result } = renderHook(() => useSpeechInput(onResult));
    const recognition = MockRecognition.latest!;

    act(() => result.current.toggleListening());
    expect(beginListening).toHaveBeenCalledOnce();
    expect(recognition.start).toHaveBeenCalledOnce();

    act(() => recognition.onresult?.({ results: [{ 0: { transcript: 'ถามหน่อย' }, isFinal: true }] }));
    expect(onResult).not.toHaveBeenCalled();

    act(() => result.current.toggleListening());
    expect(recognition.stop).toHaveBeenCalledOnce();

    act(() => recognition.onend?.());
    expect(endListening).toHaveBeenCalledOnce();
    expect(onResult).toHaveBeenCalledExactlyOnceWith('ถามหน่อย');
  });
});

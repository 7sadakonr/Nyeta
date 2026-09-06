// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { speak, stop, beginListening, endListening, notifyUserNavigation, getSnapshot, unlockAudio } = vi.hoisted(() => ({
    speak: vi.fn(), stop: vi.fn(), beginListening: vi.fn(() => true), endListening: vi.fn(), notifyUserNavigation: vi.fn(), getSnapshot: vi.fn(), unlockAudio: vi.fn()
}));

vi.mock('@/shared/accessibility/speechController', () => ({
    speechController: { speak, stop, beginListening, endListening, notifyUserNavigation, getSnapshot, unlockAudio }
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

    act(() => result.current.toggleListening());
    const recognition = MockRecognition.latest!;
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

  it('does not auto-submit on premature onend and only submits when stopListening is explicitly invoked', () => {
    const onResult = vi.fn();
    const { result } = renderHook(() => useSpeechInput(onResult));

    act(() => result.current.startListening());
    const recognition = MockRecognition.latest!;
    expect(beginListening).toHaveBeenCalledOnce();

    act(() => recognition.onresult?.({ results: [{ 0: { transcript: 'นี่คืออะไร' }, isFinal: true }] }));

    // Browser prematurely fires onend without user clicking stop
    act(() => recognition.onend?.());
    // Must NOT submit!
    expect(onResult).not.toHaveBeenCalled();
    expect(endListening).not.toHaveBeenCalled();

    // User explicitly clicks stop
    act(() => result.current.stopListening());
    expect(recognition.stop).toHaveBeenCalled();

    act(() => recognition.onend?.());
    expect(endListening).toHaveBeenCalledOnce();
    expect(onResult).toHaveBeenCalledWith('นี่คืออะไร');
  });
});

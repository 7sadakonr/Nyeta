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
    unlockAudio: vi.fn()
}));

vi.mock('@/shared/accessibility/speechController', () => ({
    speechController: { speak, stop, beginListening, endListening, notifyUserNavigation, getSnapshot, unlockAudio }
}));

import { useSpeechInput } from '@/features/blind-assistant/hooks/useSpeechInput';

class MockRecognition {
  static instances: MockRecognition[] = [];
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
  abort = vi.fn();

  constructor() {
    MockRecognition.instances.push(this);
    MockRecognition.latest = this;
  }
}

describe('useSpeechInput lifecycle and one-shot session enforcement', () => {
  let mockAudioSession: { type: string };

  beforeEach(() => {
    mockAudioSession = { type: 'auto' };
    Object.defineProperty(navigator, 'audioSession', {
      configurable: true,
      value: mockAudioSession,
    });
    MockRecognition.instances = [];
    MockRecognition.latest = null;
    vi.stubGlobal('SpeechRecognition', MockRecognition);
    beginListening.mockClear();
    endListening.mockClear();
    speak.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete (navigator as any).audioSession;
  });

  it('calls recognition.start() once, leaves audio session to WebKit, and suppresses TTS guidance on startListening', () => {
    const onResult = vi.fn();
    const { result } = renderHook(() => useSpeechInput(onResult));

    act(() => result.current.startListening());
    const recognition = MockRecognition.latest!;

    expect(mockAudioSession.type).toBe('auto');
    expect(beginListening).toHaveBeenCalledOnce();
    expect(recognition.start).toHaveBeenCalledOnce();
    expect(result.current.state).toBe('listening');
  });

  it('final result triggers recognition.stop() and submits transcript once after onend and restores audio session', () => {
    const onResult = vi.fn();
    const { result } = renderHook(() => useSpeechInput(onResult));

    act(() => result.current.startListening());
    const recognition = MockRecognition.latest!;

    act(() => {
      recognition.onresult?.({
        resultIndex: 0,
        results: [{ 0: { transcript: 'นี่คืออะไร' }, isFinal: true }],
      });
    });

    // Final result must request stop immediately
    expect(recognition.stop).toHaveBeenCalledOnce();
    expect(onResult).not.toHaveBeenCalled();

    // Browser fires onend
    act(() => {
      recognition.onend?.();
    });

    expect(mockAudioSession.type).toBe('playback');
    expect(endListening).toHaveBeenCalledOnce();
    expect(onResult).toHaveBeenCalledExactlyOnceWith('นี่คืออะไร');
    expect(result.current.state).toBe('idle');
  });

  it('does not restart recognition on onend (no auto-restart loop)', () => {
    const onResult = vi.fn();
    const { result } = renderHook(() => useSpeechInput(onResult));

    act(() => result.current.startListening());
    const recognition = MockRecognition.latest!;
    expect(recognition.start).toHaveBeenCalledOnce();

    act(() => {
      recognition.onend?.();
    });

    // Must NOT restart!
    expect(recognition.start).toHaveBeenCalledOnce();
    expect(endListening).toHaveBeenCalledOnce();
    expect(result.current.state).toBe('idle');
  });

  it('handles no-speech error without restarting and cleanly ends session', () => {
    const onResult = vi.fn();
    const { result } = renderHook(() => useSpeechInput(onResult));

    act(() => result.current.startListening());
    const recognition = MockRecognition.latest!;

    act(() => {
      recognition.onerror?.({ error: 'no-speech' });
      recognition.onend?.();
    });

    expect(recognition.start).toHaveBeenCalledOnce();
    expect(endListening).toHaveBeenCalledOnce();
    expect(onResult).not.toHaveBeenCalled();
    expect(result.current.state).toBe('idle');
  });

  it('handles aborted error without restarting and cleanly ends session', () => {
    const onResult = vi.fn();
    const { result } = renderHook(() => useSpeechInput(onResult));

    act(() => result.current.startListening());
    const recognition = MockRecognition.latest!;

    act(() => {
      recognition.onerror?.({ error: 'aborted' });
      recognition.onend?.();
    });

    expect(recognition.start).toHaveBeenCalledOnce();
    expect(endListening).toHaveBeenCalledOnce();
    expect(onResult).not.toHaveBeenCalled();
    expect(result.current.state).toBe('idle');
  });

  it('aborts and cleans up on unmount', () => {
    const onResult = vi.fn();
    const { result, unmount } = renderHook(() => useSpeechInput(onResult));

    act(() => result.current.startListening());
    const recognition = MockRecognition.latest!;

    unmount();

    expect(recognition.abort).toHaveBeenCalledOnce();
    expect(endListening).toHaveBeenCalledOnce();
  });

  it('handles rapid double-click by aborting previous session and creating only one active recognition', () => {
    const onResult = vi.fn();
    const { result } = renderHook(() => useSpeechInput(onResult));

    act(() => {
      result.current.startListening();
      result.current.startListening();
    });

    expect(MockRecognition.instances.length).toBe(2);
    // First instance was aborted during cleanup
    expect(MockRecognition.instances[0].abort).toHaveBeenCalledOnce();
    // Second instance started
    expect(MockRecognition.instances[1].start).toHaveBeenCalledOnce();
    expect(result.current.state).toBe('listening');
  });

  it('toggleListening toggles between starting and stopping', () => {
    const onResult = vi.fn();
    const { result } = renderHook(() => useSpeechInput(onResult));

    act(() => result.current.toggleListening());
    const recognition = MockRecognition.latest!;
    expect(recognition.start).toHaveBeenCalledOnce();

    act(() => result.current.toggleListening());
    expect(recognition.stop).toHaveBeenCalledOnce();

    act(() => recognition.onend?.());
    expect(endListening).toHaveBeenCalledOnce();
  });
});

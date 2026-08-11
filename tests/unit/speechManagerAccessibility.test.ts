// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Priority } from '@/shared/types/speech';
import { SpeechManager } from '@/shared/accessibility/speechManager';

class MockUtterance {
  public lang = '';
  public rate = 1;
  public voice: SpeechSynthesisVoice | null = null;
  public onend: (() => void) | null = null;
  public onerror: ((event: SpeechSynthesisErrorEvent) => void) | null = null;
  constructor(public text: string) {}
}

describe('SpeechManager accessibility navigation coordination', () => {
  let utterances: MockUtterance[];
  let cancel: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    utterances = [];
    cancel = vi.fn();
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
      cancel,
      speak: vi.fn((utterance: MockUtterance) => utterances.push(utterance)),
      getVoices: vi.fn(() => []), paused: false, speaking: true, resume: vi.fn(), pause: vi.fn(), onvoiceschanged: null,
    }});
    vi.stubGlobal('SpeechSynthesisUtterance', MockUtterance);
  });

  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it('cancels current speech once and never resumes the old utterance after navigation', () => {
    const manager = new SpeechManager();
    const onEnd = vi.fn();
    expect(manager.speak('กำลังอ่านเอกสารยาว', { chunk: true, onEnd })).toBe(true);
    const oldUtterance = utterances[0];
    manager.interruptForAccessibilityNavigation();
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(onEnd).toHaveBeenCalledExactlyOnceWith(false);
    expect(manager.isSpeaking).toBe(false);
    oldUtterance.onend?.();
    vi.advanceTimersByTime(1500);
    expect(utterances).toHaveLength(1);
    expect(onEnd).toHaveBeenCalledExactlyOnceWith(false);
  });

  it('drops LOW guidance, defers new events, and extends the quiet window for repeated navigation', () => {
    const manager = new SpeechManager();
    const lowEnd = vi.fn();
    manager.interruptForAccessibilityNavigation();
    expect(manager.speak('ขยับซ้าย', { priority: Priority.LOW, onEnd: lowEnd })).toBe(false);
    expect(lowEnd).toHaveBeenCalledExactlyOnceWith(false);
    expect(manager.speak('คำตอบใหม่', { priority: Priority.HIGH, owner: 'ai' })).toBe(true);
    vi.advanceTimersByTime(700);
    manager.interruptForAccessibilityNavigation();
    vi.advanceTimersByTime(900);
    expect(utterances).toHaveLength(0);
    expect(manager.speak('คำตอบหลัง swipe', { priority: Priority.HIGH, owner: 'ai' })).toBe(true);
    vi.advanceTimersByTime(100);
    expect(utterances.map(utterance => utterance.text)).toEqual(['คำตอบหลัง swipe']);
  });

  it('clears deferred noncritical messages while retaining critical safety messages', () => {
    const manager = new SpeechManager();
    const normalEnd = vi.fn();
    manager.interruptForAccessibilityNavigation();
    manager.speak('อ่านเอกสารต่อ', { priority: Priority.NORMAL, onEnd: normalEnd });
    manager.speak('กล้องมีปัญหา', { priority: Priority.CRITICAL, owner: 'camera-error' });
    manager.interruptForAccessibilityNavigation();
    expect(normalEnd).toHaveBeenCalledExactlyOnceWith(false);
    vi.advanceTimersByTime(1000);
    expect(utterances.map(utterance => utterance.text)).toEqual(['กล้องมีปัญหา']);
  });

  it('remains usable after an accessibility interruption', () => {
    const manager = new SpeechManager();
    manager.interruptForAccessibilityNavigation();
    vi.advanceTimersByTime(1000);
    expect(manager.speak('เหตุการณ์ใหม่', { priority: Priority.LOW })).toBe(true);
    expect(utterances.map(utterance => utterance.text)).toEqual(['เหตุการณ์ใหม่']);
  });
});


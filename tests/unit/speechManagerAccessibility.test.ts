// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Priority, SpeechCategory } from '@/shared/types/speech';
import { SpeechManager } from '@/shared/accessibility/speechManager';

class MockUtterance {
  public lang = '';
  public rate = 1;
  public volume = 1;
  public voice: SpeechSynthesisVoice | null = null;
  public onstart: (() => void) | null = null;
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
    expect(manager.speak('ขยับกล้องไปทางซ้าย', { priority: Priority.GUIDANCE, chunk: true, onEnd })).toBe(true);
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

  it('drops guidance, defers results, and extends the quiet window for repeated navigation', () => {
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
    expect(utterances.map(utterance => utterance.text)).toEqual(['คำตอบใหม่']);
  });

  it('retains deferred actions and critical safety messages during navigation', () => {
    const manager = new SpeechManager();
    const normalEnd = vi.fn();
    manager.interruptForAccessibilityNavigation();
    manager.speak('อ่านเอกสารต่อ', { priority: Priority.NORMAL, onEnd: normalEnd });
    manager.speak('กล้องมีปัญหา', { priority: Priority.CRITICAL, owner: 'camera-error' });
    manager.interruptForAccessibilityNavigation();
    expect(normalEnd).not.toHaveBeenCalled();
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

  it('deduplicates guidance during its cooldown and lets a result interrupt it', () => {
    const manager = new SpeechManager();

    expect(manager.speak('ขยับกล้องไปทางซ้าย', {
      priority: Priority.GUIDANCE,
      owner: 'object-detector',
      dedupe: true,
      cooldown: 1200,
    })).toBe(true);
    expect(manager.speak('ขยับกล้องไปทางซ้าย', {
      priority: Priority.GUIDANCE,
      owner: 'object-detector',
      dedupe: true,
      cooldown: 1200,
    })).toBe(false);
    expect(manager.speak('ล็อกแก้วน้ำแล้ว', {
      priority: Priority.RESULT,
      owner: 'object-detector',
      interrupt: true,
    })).toBe(true);

    expect(cancel).toHaveBeenCalledTimes(1);
    expect(utterances.map(utterance => utterance.text)).toEqual(['ขยับกล้องไปทางซ้าย', 'ล็อกแก้วน้ำแล้ว']);
  });

  it('keeps an active result and critical error when navigation interrupts guidance', () => {
    const manager = new SpeechManager();
    manager.speak('ตรวจพบธนบัตร 100 บาท', { priority: Priority.RESULT, owner: 'currency' });
    manager.interruptForAccessibilityNavigation();
    expect(cancel).not.toHaveBeenCalled();

    const critical = new SpeechManager();
    critical.speak('กล้องมีปัญหา', { priority: Priority.CRITICAL, owner: 'camera-error' });
    critical.interruptForAccessibilityNavigation();
    expect(cancel).not.toHaveBeenCalled();
  });

  it('bounds cooldown dedupe history for many unique events', () => {
    const manager = new SpeechManager();
    for (let index = 0; index < 300; index += 1) {
      manager.speak(`สถานะ ${index}`, {
        priority: Priority.ACTION,
        owner: 'status',
        dedupe: true,
        cooldown: 10_000,
      });
    }

    expect((manager as any)._spokenAt.size).toBeLessThanOrEqual(128);
  });

  it('replaces an active realtime state with the latest state instead of queuing it', () => {
    const manager = new SpeechManager();

    expect(manager.speak('ขยับซ้าย', {
      category: SpeechCategory.REALTIME,
      owner: 'object-detector',
      realtimeKey: 'object-guidance',
    })).toBe(true);
    expect(manager.speak('ขยับขวา', {
      category: SpeechCategory.REALTIME,
      owner: 'object-detector',
      realtimeKey: 'object-guidance',
    })).toBe(true);

    expect(cancel).toHaveBeenCalledTimes(1);
    expect(utterances.map(utterance => utterance.text)).toEqual(['ขยับซ้าย', 'ขยับขวา']);
  });

  it('drops object guidance while an AI task response is speaking', () => {
    const manager = new SpeechManager();
    const guidanceEnd = vi.fn();

    expect(manager.speak('ด้านหน้ามีโต๊ะ', {
      category: SpeechCategory.TASK,
      owner: 'ai-response',
    })).toBe(true);
    expect(manager.speak('ขยับไปทางซ้าย', {
      category: SpeechCategory.REALTIME,
      owner: 'object-detector',
      realtimeKey: 'object-guidance',
      onEnd: guidanceEnd,
    })).toBe(false);

    utterances[0].onend?.();
    expect(utterances.map(utterance => utterance.text)).toEqual(['ด้านหน้ามีโต๊ะ']);
    expect(guidanceEnd).toHaveBeenCalledExactlyOnceWith(false);
  });

  it('keeps an exclusive AI response as the only speech until it ends or is stopped', () => {
    const manager = new SpeechManager();
    const queuedEnd = vi.fn();
    const blockedTaskEnd = vi.fn();
    const blockedCriticalEnd = vi.fn();

    expect(manager.speak('กำลังประมวลผล', {
      category: SpeechCategory.TASK,
      owner: 'camera',
    })).toBe(true);
    expect(manager.speak('ยอดรวมเงิน', {
      category: SpeechCategory.TASK,
      owner: 'currency',
      onEnd: queuedEnd,
    })).toBe(true);
    expect(manager.speak('คำตอบจาก AI', {
      category: SpeechCategory.TASK,
      owner: 'ai-response',
      exclusive: true,
      interrupt: true,
    })).toBe(true);
    expect(manager.speak('อ่านเอกสาร', {
      category: SpeechCategory.TASK,
      owner: 'document-reader',
      onEnd: blockedTaskEnd,
    })).toBe(false);
    expect(manager.speak('กล้องโดนบัง', {
      category: SpeechCategory.CRITICAL,
      owner: 'camera-error',
      onEnd: blockedCriticalEnd,
    })).toBe(false);

    expect(utterances.map(utterance => utterance.text)).toEqual(['กำลังประมวลผล', 'คำตอบจาก AI']);
    expect(queuedEnd).toHaveBeenCalledExactlyOnceWith(false);
    expect(blockedTaskEnd).toHaveBeenCalledExactlyOnceWith(false);
    expect(blockedCriticalEnd).toHaveBeenCalledExactlyOnceWith(false);

    manager.stopByOwner('ai-response');
    expect(manager.speak('กล้องโดนบัง', {
      category: SpeechCategory.CRITICAL,
      owner: 'camera-error',
    })).toBe(true);
  });

  it('drops non-critical speech while listening and drains a critical message after the microphone ends', () => {
    const manager = new SpeechManager();
    const abortRecognition = vi.fn();

    expect(manager.beginListeningSession({ abortRecognition })).toBe(true);
    expect(manager.speak('คำตอบ AI', { category: SpeechCategory.TASK, owner: 'ai-response' })).toBe(false);
    expect(manager.speak('ขยับซ้าย', { category: SpeechCategory.REALTIME, owner: 'object-detector' })).toBe(false);
    expect(manager.speak('กล้องโดนบัง', { category: SpeechCategory.CRITICAL, owner: 'camera-error' })).toBe(true);
    expect(abortRecognition).toHaveBeenCalledOnce();
    expect(utterances).toHaveLength(0);

    manager.endListeningSession();
    expect(utterances.map(utterance => utterance.text)).toEqual(['กล้องโดนบัง']);
  });

  it('activates iOS playback with a short spoken phrase only once', () => {
    const manager = new SpeechManager();

    expect(manager.activateFromUserGesture('ผู้ช่วยพร้อม', {
      owner: 'blind-entry',
      scope: 'blind:shared',
    })).toBe(true);

    expect(utterances).toHaveLength(1);
    expect(utterances[0]).toMatchObject({ text: 'ผู้ช่วยพร้อม', volume: 1 });
    expect(cancel).not.toHaveBeenCalled();

    utterances[0].onstart?.();
    expect(manager.activateFromUserGesture('ผู้ช่วยพร้อม')).toBe(true);
    expect(utterances).toHaveLength(1);
  });

  it('reports a native speech error as incomplete', () => {
    const manager = new SpeechManager();
    const onEnd = vi.fn();

    manager.speak('ขยับซ้าย', { onEnd });
    utterances[0].onerror?.({ error: 'not-allowed' } as SpeechSynthesisErrorEvent);

    expect(onEnd).toHaveBeenCalledExactlyOnceWith(false);
  });
});


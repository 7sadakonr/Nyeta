// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startProcessingEarcon, stopProcessingEarcon, playEarcon } from '@/shared/accessibility/audio';

class FakeGainNode {
    public gain = {
        value: 1,
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
    };
    public connect = vi.fn();
}

class FakeOscillatorNode {
    public frequency = { value: 440 };
    public connect = vi.fn();
    public start = vi.fn();
    public stop = vi.fn();
}

let createdOscillators: FakeOscillatorNode[] = [];

class FakeAudioContext {
    public currentTime = 0;
    public state = 'running';
    public destination = {};
    public createGain = vi.fn(() => new FakeGainNode());
    public createOscillator = vi.fn(() => {
        const osc = new FakeOscillatorNode();
        createdOscillators.push(osc);
        return osc;
    });
    public resume = vi.fn();
}

describe('Processing Earcon', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        createdOscillators = [];
        vi.stubGlobal('AudioContext', FakeAudioContext);
    });

    afterEach(() => {
        stopProcessingEarcon();
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it('plays a single processing earcon tone', () => {
        playEarcon('processing');
        expect(createdOscillators.length).toBeGreaterThan(0);
        expect(createdOscillators[0].frequency.value).toBe(600);
        expect(createdOscillators[0].start).toHaveBeenCalled();
        expect(createdOscillators[0].stop).toHaveBeenCalled();
    });

    it('starts pulsing after the initial delay and continues at intervals', () => {
        const stop = startProcessingEarcon(2000);

        expect(createdOscillators.length).toBe(0);

        vi.advanceTimersByTime(1200);
        expect(createdOscillators.length).toBe(1);

        vi.advanceTimersByTime(2000);
        expect(createdOscillators.length).toBe(2);

        vi.advanceTimersByTime(2000);
        expect(createdOscillators.length).toBe(3);

        stop();

        vi.advanceTimersByTime(5000);
        expect(createdOscillators.length).toBe(3);
    });

    it('cancels the previous loop when startProcessingEarcon is called again', () => {
        startProcessingEarcon(2000);
        vi.advanceTimersByTime(1200);
        expect(createdOscillators.length).toBe(1);

        startProcessingEarcon(2000);

        vi.advanceTimersByTime(500);
        expect(createdOscillators.length).toBe(1);

        vi.advanceTimersByTime(700);
        expect(createdOscillators.length).toBe(2);

        stopProcessingEarcon();
        vi.advanceTimersByTime(4000);
        expect(createdOscillators.length).toBe(2);
    });

    it('stops looping cleanly via stopProcessingEarcon()', () => {
        startProcessingEarcon(1000);
        vi.advanceTimersByTime(1200);
        expect(createdOscillators.length).toBe(1);

        stopProcessingEarcon();
        vi.advanceTimersByTime(5000);
        expect(createdOscillators.length).toBe(1);
    });
});
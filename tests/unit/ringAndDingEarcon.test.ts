// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { playEarcon, startRingEarcon, stopRingEarcon } from '@/shared/accessibility/audio';

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

describe('Ring and Ding Earcons', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        createdOscillators = [];
        vi.stubGlobal('AudioContext', FakeAudioContext);
    });

    afterEach(() => {
        stopRingEarcon();
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it('plays ding earcon with two tones', () => {
        playEarcon('ding');
        expect(createdOscillators.length).toBe(2);
        expect(createdOscillators[0].frequency.value).toBe(880);
        expect(createdOscillators[1].frequency.value).toBe(1175);
        expect(createdOscillators[0].start).toHaveBeenCalled();
        expect(createdOscillators[1].start).toHaveBeenCalled();
    });

    it('plays mode-assistant earcon with rising 3-tone arpeggio', () => {
        createdOscillators = [];
        playEarcon('mode-assistant');
        expect(createdOscillators.length).toBe(3);
        expect(createdOscillators[0].frequency.value).toBe(523);
        expect(createdOscillators[1].frequency.value).toBe(659);
        expect(createdOscillators[2].frequency.value).toBe(1046);
    });

    it('plays mode-currency earcon with bright metallic 2-tone clink', () => {
        createdOscillators = [];
        playEarcon('mode-currency');
        expect(createdOscillators.length).toBe(2);
        expect(createdOscillators[0].frequency.value).toBe(1318);
        expect(createdOscillators[1].frequency.value).toBe(1760);
    });

    it('plays mode-reader earcon with warm resonant 2-tone chime', () => {
        createdOscillators = [];
        playEarcon('mode-reader');
        expect(createdOscillators.length).toBe(2);
        expect(createdOscillators[0].frequency.value).toBe(440);
        expect(createdOscillators[1].frequency.value).toBe(659);
    });

    it('plays mode-volunteer earcon matching calling bell tones', () => {
        createdOscillators = [];
        playEarcon('mode-volunteer');
        expect(createdOscillators.length).toBe(2);
        expect(createdOscillators[0].frequency.value).toBe(880);
        expect(createdOscillators[1].frequency.value).toBe(1175);
    });

    it('starts ringing earcon immediately and repeats on interval', () => {
        const stop = startRingEarcon(2500);

        // First ring pulse immediately
        expect(createdOscillators.length).toBe(2);
        expect(createdOscillators[0].frequency.value).toBe(880);
        expect(createdOscillators[1].frequency.value).toBe(1047);

        // Next pulse after 2500ms
        vi.advanceTimersByTime(2500);
        expect(createdOscillators.length).toBe(4);

        stop();
        vi.advanceTimersByTime(5000);
        expect(createdOscillators.length).toBe(4);
    });

    it('stops ringing earcon cleanly with stopRingEarcon()', () => {
        startRingEarcon(2000);
        expect(createdOscillators.length).toBe(2);

        stopRingEarcon();
        vi.advanceTimersByTime(5000);
        expect(createdOscillators.length).toBe(2);
    });
});

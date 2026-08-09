import { describe, expect, it } from 'vitest';
import { DetectedObject } from '@/features/blind-assistant/types/assistant';
import {
    advanceObjectTargeting,
    calculateCandidateGuidance,
    calculateObjectGuidance,
    createInitialObjectTargetingState,
    rankNearReticle,
    isImportantTargetingEvent,
} from '@/features/blind-assistant/client/objectTargeting';

const frame = { width: 1000, height: 800 };
const box = (className: string, bbox: [number, number, number, number], score = 0.8): DetectedObject => ({ class: className, bbox, score });
const step = (state: ReturnType<typeof createInitialObjectTargetingState>, detections: DetectedObject[], now: number) =>
    advanceObjectTargeting(state, detections, frame, now, (className) => className);

describe('pre-lock nearest bbox selection', () => {
    it('chooses a glass near the reticle over a large, higher-confidence monitor', () => {
        const monitor = box('tv', [0, 20, 700, 700], 0.99);
        const glass = box('cup', [450, 320, 100, 160], 0.55);
        expect(rankNearReticle([monitor, glass], frame)[0]).toBe(glass);
    });

    it('uses nearest bbox edge rather than bbox center for acquisition ranking', () => {
        const edgeNear = box('cup', [510, 200, 300, 300]);
        const centerNearButEdgeFar = box('cell phone', [300, 350, 100, 100]);
        expect(rankNearReticle([centerNearButEdgeFar, edgeNear], frame)[0]).toBe(edgeNear);
    });

    it('demotes an oversized bbox enclosing the reticle when a small object is nearby', () => {
        const monitor = box('tv', [0, 0, 1000, 500], 0.99);
        const cup = box('cup', [510, 360, 80, 80], 0.55);
        expect(rankNearReticle([monitor, cup], frame)[0]).toBe(cup);
    });

    it('keeps an oversized bbox when no small object is near the reticle', () => {
        const monitor = box('tv', [0, 0, 1000, 500], 0.99);
        const phone = box('cell phone', [850, 650, 80, 80], 0.8);
        expect(rankNearReticle([monitor, phone], frame)[0]).toBe(monitor);
    });

    it('ranks nearby small objects deterministically', () => {
        const leftCup = box('cup', [440, 350, 40, 80], 0.7);
        const rightCup = box('cup', [535, 350, 40, 80], 0.7);
        expect(rankNearReticle([rightCup, leftCup], frame)[0]).toBe(leftCup);
    });

    it('treats an enclosing bbox as distance zero and chooses the smaller overlapping bbox', () => {
        const monitor = box('tv', [100, 50, 800, 700], 0.99);
        const glass = box('cup', [460, 340, 80, 120], 0.55);
        expect(rankNearReticle([monitor, glass], frame)[0]).toBe(glass);
    });

    it('shows generic guidance for the nearest bbox immediately and speaks only after two stable frames', () => {
        const nearestCup = box('cup', [200, 350, 100, 100]);
        const fartherPhone = box('cell phone', [850, 350, 80, 100]);
        let result = step(createInitialObjectTargetingState(), [fartherPhone, nearestCup], 0);
        expect(result.state.phase).toBe('candidate');
        expect(result.targetObject?.class).toBe('cup');
        expect(result.guidance?.message).toBe('มีวัตถุทางซ้าย ขยับกล้องไปทางซ้าย');
        expect(result.event).toBeNull();

        result = step(result.state, [fartherPhone, box('cup', [202, 350, 100, 100])], 100);
        expect(result.targetObject?.class).toBe('cup');
        expect(result.event?.type).toBe('candidate-guidance');
        expect(result.event?.guidance?.message).not.toContain('cup');
    });

    it('announces a new search candidate after an empty interval even when its direction is unchanged', () => {
        let result = step(createInitialObjectTargetingState(), [box('cup', [200, 350, 100, 100])], 0);
        result = step(result.state, [box('cup', [202, 350, 100, 100])], 100);
        expect(result.event?.type).toBe('candidate-guidance');

        result = step(result.state, [], 200);
        expect(result.state.phase).toBe('searching');
        result = step(result.state, [box('cup', [200, 350, 100, 100])], 300);
        expect(result.event).toBeNull();
        result = step(result.state, [box('cup', [202, 350, 100, 100])], 400);
        expect(result.event?.type).toBe('candidate-guidance');
    });
    it('does not switch an existing candidate until a challenger wins for three frames', () => {
        const candidateA = box('cup', [100, 350, 100, 100]);
        let result = step(createInitialObjectTargetingState(), [candidateA], 0);
        result = step(result.state, [box('cup', [104, 350, 100, 100])], 100);
        result = step(result.state, [box('cup', [108, 350, 100, 100])], 200);
        expect(result.state.phase).toBe('candidate');

        const stableA = box('cup', [110, 350, 100, 100]);
        const challenger = box('cell phone', [520, 350, 80, 100]);
        result = step(result.state, [stableA, challenger], 300);
        expect(result.targetObject?.class).toBe('cup');
        result = step(result.state, [stableA, challenger], 400);
        expect(result.targetObject?.class).toBe('cup');
        result = step(result.state, [stableA, challenger], 500);
        expect(result.targetObject?.class).toBe('cell phone');
    });

    it('locks only after the same candidate remains inside the reticle bbox target zone for three frames', () => {
        const outsideCup = box('cup', [100, 350, 100, 100]);
        let result = step(createInitialObjectTargetingState(), [outsideCup], 0);
        result = step(result.state, [box('cup', [104, 350, 100, 100])], 100);
        result = step(result.state, [box('cup', [108, 350, 100, 100])], 200);
        expect(result.state.phase).toBe('candidate');
        expect(result.event?.type).not.toBe('locked');

        const inZoneCup = box('cup', [450, 350, 100, 100]);
        result = step(result.state, [inZoneCup], 300);
        expect(result.state.phase).toBe('candidate');
        result = step(result.state, [inZoneCup], 400);
        expect(result.state.phase).toBe('candidate');
        result = step(result.state, [inZoneCup], 500);
        expect(result.state.phase).toBe('locked');
        expect(result.event?.type).toBe('locked');
        expect(result.event?.guidance?.message).toBe('cupอยู่ตรงกลางแล้ว');
    });
});

describe('locked target tracking', () => {
    it('keeps the locked object when another object of the same class becomes nearer to the reticle', () => {
        const cupA = box('cup', [450, 350, 100, 100]);
        let result = step(createInitialObjectTargetingState(), [cupA], 0);
        result = step(result.state, [box('cup', [452, 350, 100, 100])], 100);
        result = step(result.state, [box('cup', [454, 350, 100, 100])], 200);
        expect(result.state.phase).toBe('locked');

        const cupANext = box('cup', [458, 350, 100, 100]);
        const cupB = box('cup', [490, 350, 40, 60], 0.95);
        result = step(result.state, [cupANext, cupB], 300);
        expect(result.targetObject?.bbox).toEqual(cupANext.bbox);
    });

    it('keeps a small locked target after a faster, size-relative movement', () => {
        let result = step(createInitialObjectTargetingState(), [box('cup', [480, 370, 40, 60])], 0);
        result = step(result.state, [box('cup', [482, 370, 40, 60])], 100);
        result = step(result.state, [box('cup', [484, 370, 40, 60])], 200);
        const movedCup = box('cup', [503, 370, 40, 60]);
        result = step(result.state, [movedCup], 300);
        expect(result.state.phase).toBe('locked');
        expect(result.targetObject?.bbox).toEqual(movedCup.bbox);
    });

    it('does not switch to a nearby same-class object when the locked target disappears', () => {
        let result = step(createInitialObjectTargetingState(), [box('cup', [480, 370, 40, 60])], 0);
        result = step(result.state, [box('cup', [482, 370, 40, 60])], 100);
        result = step(result.state, [box('cup', [484, 370, 40, 60])], 200);
        result = step(result.state, [box('cup', [509, 370, 40, 60])], 300);
        expect(result.state.phase).toBe('lost');
        expect(result.targetObject).toBeNull();
    });

    it('silently re-acquires the same locked target during the one-second grace period', () => {
        let result = step(createInitialObjectTargetingState(), [box('cup', [450, 350, 100, 100])], 0);
        result = step(result.state, [box('cup', [452, 350, 100, 100])], 100);
        result = step(result.state, [box('cup', [454, 350, 100, 100])], 200);
        const lockId = result.state.eventId;

        result = step(result.state, [], 700);
        expect(result.state.phase).toBe('lost');
        const reacquired = box('cup', [458, 350, 100, 100]);
        result = step(result.state, [reacquired], 900);
        expect(result.state.phase).toBe('locked');
        expect(result.targetObject?.bbox).toEqual(reacquired.bbox);
        expect(result.state.eventId).toBe(lockId);
    });
});

describe('guidance geometry', () => {
    it.each([
        ['left', box('cup', [100, 350, 100, 100]), 'มีวัตถุทางซ้าย ขยับกล้องไปทางซ้าย'],
        ['right', box('cup', [800, 350, 100, 100]), 'มีวัตถุทางขวา ขยับกล้องไปทางขวา'],
        ['up', box('cup', [450, 20, 100, 100]), 'มีวัตถุด้านบน ยกกล้องขึ้น'],
        ['down', box('cup', [450, 680, 100, 100]), 'มีวัตถุด้านล่าง ลดกล้องลง'],
    ] as const)('guides candidate %s toward the nearest bbox edge', (direction, target, message) => {
        const guidance = calculateCandidateGuidance(target, frame);
        expect(guidance.direction).toBe(direction);
        expect(guidance.message).toBe(message);
    });

    it('names the centered candidate before it is locked', () => {
        const guidance = calculateCandidateGuidance(box('cup', [480, 370, 40, 60]), frame, 'แก้วน้ำ');
        expect(guidance.message).toBe('แก้วน้ำอยู่ตรงกลาง ถือกล้องให้นิ่ง');
    });
    it('uses locked-target hysteresis after lock', () => {
        const nearRight = box('cup', [590, 350, 100, 100]);
        const right = calculateObjectGuidance(nearRight, frame, null, 'แก้ว');
        expect(right.message).toBe('ขยับกล้องไปทางขวาอีกเล็กน้อย');
        const jitterWithinExit = box('cup', [580, 350, 100, 100]);
        expect(calculateObjectGuidance(jitterWithinExit, frame, { direction: 'center', proximity: 'center', message: '' }, 'แก้ว').direction).toBe('center');
        expect(calculateObjectGuidance(jitterWithinExit, frame, right, 'แก้ว').direction).toBe('right');
    });
});

describe('targeting announcement priority', () => {
    it('allows a lock, centered, or loss announcement to replace disposable candidate guidance', () => {
        expect(isImportantTargetingEvent('candidate-guidance')).toBe(false);
        expect(isImportantTargetingEvent('locked')).toBe(true);
        expect(isImportantTargetingEvent('centered')).toBe(true);
        expect(isImportantTargetingEvent('target-lost')).toBe(true);
    });
});
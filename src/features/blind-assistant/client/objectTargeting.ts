import { DetectedObject, DetectionGuidance } from '@/features/blind-assistant/types/assistant';

export const OBJECT_TARGETING = {
    MIN_SCORE: 0.5,
    STABLE_FRAMES: 3,
    CANDIDATE_SPEECH_FRAMES: 2,
    GRACE_PERIOD_MS: 1000,
    TRACK_IOU: 0.3,
    TRACK_CENTER_DISTANCE: 0.04,
    REACQUIRE_IOU: 0.15,
    REACQUIRE_CENTER_DISTANCE: 0.06,
    SAFE_ENTER: 0.1,
    SAFE_EXIT: 0.14,
    NEAR_LIMIT: 0.18,
    CANDIDATE_NEAR_DISTANCE: 0.08,
    AXIS_SWITCH_MARGIN: 0.03,
    OVERSIZED_AREA: 0.35,
} as const;

export interface VideoFrameSize {
    width: number;
    height: number;
}

export type TargetPhase = 'searching' | 'candidate' | 'locked' | 'lost';
export type TargetingEventType = 'candidate-reset' | 'candidate-guidance' | 'locked' | 'guidance' | 'centered' | 'target-lost';

export function isImportantTargetingEvent(type: TargetingEventType): boolean {
    return type === 'locked' || type === 'centered' || type === 'target-lost';
}

export interface TargetingEvent {
    id: number;
    type: TargetingEventType;
    target: DetectedObject | null;
    guidance: DetectionGuidance | null;
}

interface CandidateState {
    target: DetectedObject;
    frames: number;
    targetZoneFrames: number;
}

export interface ObjectTargetingState {
    phase: TargetPhase;
    candidate: CandidateState | null;
    challenger: CandidateState | null;
    lockedTarget: DetectedObject | null;
    lostSince: number | null;
    lastGuidance: DetectionGuidance | null;
    candidateGuidanceKey: string | null;
    candidateGuidanceTarget: DetectedObject | null;
    candidateGuidanceFrames: number;
    lastCandidateAnnouncementKey: string | null;
    eventId: number;
}

export interface ObjectTargetingResult {
    state: ObjectTargetingState;
    detections: DetectedObject[];
    targetObject: DetectedObject | null;
    targetIndex: number | null;
    guidance: DetectionGuidance | null;
    event: TargetingEvent | null;
}

interface RankedDetection {
    detection: DetectedObject;
    containsReticle: boolean;
    areaRatio: number;
    boxDistance: number;
}

export function createInitialObjectTargetingState(eventId = 0): ObjectTargetingState {
    return {
        phase: 'searching',
        candidate: null,
        challenger: null,
        lockedTarget: null,
        lostSince: null,
        lastGuidance: null,
        candidateGuidanceKey: null,
        candidateGuidanceTarget: null,
        candidateGuidanceFrames: 0,
        lastCandidateAnnouncementKey: null,
        eventId,
    };
}

function isUsableFrame(frame: VideoFrameSize): boolean {
    return Number.isFinite(frame.width) && Number.isFinite(frame.height) && frame.width > 0 && frame.height > 0;
}

function isFiniteBbox(bbox: DetectedObject['bbox']): boolean {
    return bbox.every(Number.isFinite) && bbox[2] > 0 && bbox[3] > 0;
}

function clampBbox(detection: DetectedObject, frame: VideoFrameSize): DetectedObject | null {
    if (!isFiniteBbox(detection.bbox) || !Number.isFinite(detection.score)) return null;
    const [x, y, width, height] = detection.bbox;
    const left = Math.max(0, x);
    const top = Math.max(0, y);
    const right = Math.min(frame.width, x + width);
    const bottom = Math.min(frame.height, y + height);
    if (right <= left || bottom <= top) return null;
    return { ...detection, bbox: [left, top, right - left, bottom - top] };
}

export function filterObjectDetections(rawDetections: DetectedObject[], frame: VideoFrameSize): DetectedObject[] {
    if (!isUsableFrame(frame)) return [];
    return rawDetections
        .filter((detection) => detection.class !== 'book' && detection.score >= OBJECT_TARGETING.MIN_SCORE)
        .map((detection) => clampBbox(detection, frame))
        .filter((detection): detection is DetectedObject => detection !== null);
}

function centerOf(detection: DetectedObject) {
    const [x, y, width, height] = detection.bbox;
    return { x: x + width / 2, y: y + height / 2 };
}

function diagonal(frame: VideoFrameSize): number {
    return Math.hypot(frame.width, frame.height);
}

function areaRatio(detection: DetectedObject, frame: VideoFrameSize): number {
    const [, , width, height] = detection.bbox;
    return (width * height) / (frame.width * frame.height);
}

function nearestPointOnBbox(point: { x: number; y: number }, detection: DetectedObject) {
    const [x, y, width, height] = detection.bbox;
    return {
        x: Math.max(x, Math.min(point.x, x + width)),
        y: Math.max(y, Math.min(point.y, y + height)),
    };
}

function distanceToBbox(point: { x: number; y: number }, detection: DetectedObject): number {
    const nearest = nearestPointOnBbox(point, detection);
    return Math.hypot(point.x - nearest.x, point.y - nearest.y);
}

function containsPoint(point: { x: number; y: number }, detection: DetectedObject): boolean {
    const [x, y, width, height] = detection.bbox;
    return point.x >= x && point.x <= x + width && point.y >= y && point.y <= y + height;
}

function rankDetection(detection: DetectedObject, frame: VideoFrameSize): RankedDetection {
    const reticle = { x: frame.width / 2, y: frame.height / 2 };
    return {
        detection,
        containsReticle: containsPoint(reticle, detection),
        areaRatio: areaRatio(detection, frame),
        boxDistance: distanceToBbox(reticle, detection) / diagonal(frame),
    };
}

export function rankNearReticle(detections: DetectedObject[], frame: VideoFrameSize): DetectedObject[] {
    const ranked = detections.map((detection) => rankDetection(detection, frame));
    const hasNearbySpecificObject = ranked.some((candidate) =>
        candidate.areaRatio < OBJECT_TARGETING.OVERSIZED_AREA
        && candidate.boxDistance <= OBJECT_TARGETING.CANDIDATE_NEAR_DISTANCE,
    );

    return ranked
        .sort((a, b) => {
            const aIsOversizedEnclosure = a.containsReticle
                && a.areaRatio >= OBJECT_TARGETING.OVERSIZED_AREA
                && hasNearbySpecificObject;
            const bIsOversizedEnclosure = b.containsReticle
                && b.areaRatio >= OBJECT_TARGETING.OVERSIZED_AREA
                && hasNearbySpecificObject;
            // A monitor/table enclosing the reticle is useful when it is alone, but should
            // yield to a nearby specific object the user is likely aiming for.
            if (aIsOversizedEnclosure !== bIsOversizedEnclosure) return aIsOversizedEnclosure ? 1 : -1;
            // Distance from reticle to the nearest bbox edge is the primary intent signal.
            if (a.boxDistance !== b.boxDistance) return a.boxDistance - b.boxDistance;
            if (a.containsReticle && b.containsReticle && a.areaRatio !== b.areaRatio) return a.areaRatio - b.areaRatio;
            if (a.areaRatio !== b.areaRatio) return a.areaRatio - b.areaRatio;
            return b.detection.score - a.detection.score;
        })
        .map(({ detection }) => detection);
}

export function intersectionOverUnion(a: DetectedObject, b: DetectedObject): number {
    const [ax, ay, aw, ah] = a.bbox;
    const [bx, by, bw, bh] = b.bbox;
    const overlapWidth = Math.max(0, Math.min(ax + aw, bx + bw) - Math.max(ax, bx));
    const overlapHeight = Math.max(0, Math.min(ay + ah, by + bh) - Math.max(ay, by));
    const intersection = overlapWidth * overlapHeight;
    const union = aw * ah + bw * bh - intersection;
    return union > 0 ? intersection / union : 0;
}

function centerDistanceRatio(a: DetectedObject, b: DetectedObject, frame: VideoFrameSize): number {
    const aCenter = centerOf(a);
    const bCenter = centerOf(b);
    return Math.hypot(aCenter.x - bCenter.x, aCenter.y - bCenter.y) / diagonal(frame);
}

function sizeRatio(a: DetectedObject, b: DetectedObject): number {
    const [, , aw, ah] = a.bbox;
    const [, , bw, bh] = b.bbox;
    const aArea = aw * ah;
    const bArea = bw * bh;
    return aArea > 0 && bArea > 0 ? Math.max(aArea, bArea) / Math.min(aArea, bArea) : Number.POSITIVE_INFINITY;
}

function findSpatialMatch(previous: DetectedObject, detections: DetectedObject[], frame: VideoFrameSize, minimumIou: number, maximumCenterDistance: number): DetectedObject | null {
    const [, , previousWidth, previousHeight] = previous.bbox;
    const minimumDimension = Math.min(previousWidth, previousHeight);
    const centerFallbackLimit = Math.min(maximumCenterDistance, Math.max(8, minimumDimension * 0.5) / diagonal(frame));
    const matches = detections
        .filter((detection) => detection.class === previous.class && sizeRatio(previous, detection) <= 1.6)
        .filter((detection) => intersectionOverUnion(previous, detection) >= minimumIou || centerDistanceRatio(previous, detection, frame) <= centerFallbackLimit)
        .map((detection) => ({ detection, iou: intersectionOverUnion(previous, detection), centerDistance: centerDistanceRatio(previous, detection, frame) }))
        .sort((a, b) => b.iou - a.iou || a.centerDistance - b.centerDistance);
    return matches[0]?.detection ?? null;
}

function guidanceKey(guidance: DetectionGuidance | null): string | null {
    return guidance ? `${guidance.direction}:${guidance.proximity}` : null;
}

function isInTargetZone(target: DetectedObject, frame: VideoFrameSize): boolean {
    return containsPoint({ x: frame.width / 2, y: frame.height / 2 }, target);
}

export function calculateCandidateGuidance(target: DetectedObject, frame: VideoFrameSize, label = target.class): DetectionGuidance {
    const reticle = { x: frame.width / 2, y: frame.height / 2 };
    const nearest = nearestPointOnBbox(reticle, target);
    const deltaX = nearest.x - reticle.x;
    const deltaY = nearest.y - reticle.y;
    const edgeDistance = Math.hypot(deltaX, deltaY) / diagonal(frame);

    if (edgeDistance === 0) {
        return { direction: 'center', proximity: 'center', message: `${label}อยู่ตรงกลางแล้ว` };
    }

    const useHorizontal = Math.abs(deltaX / frame.width) >= Math.abs(deltaY / frame.height);
    const direction = useHorizontal ? deltaX < 0 ? 'left' : 'right' : deltaY < 0 ? 'up' : 'down';
    const proximity = edgeDistance <= OBJECT_TARGETING.CANDIDATE_NEAR_DISTANCE ? 'near' : 'far';
    const suffix = proximity === 'near' ? 'อีกเล็กน้อย' : '';
    const messages = {
        left: `มีวัตถุทางซ้าย ขยับกล้องไปทางซ้าย${suffix}`,
        right: `มีวัตถุทางขวา ขยับกล้องไปทางขวา${suffix}`,
        up: `มีวัตถุด้านบน ยกกล้องขึ้น${suffix}`,
        down: `มีวัตถุด้านล่าง ลดกล้องลง${suffix}`,
    };
    return { direction, proximity, message: messages[direction] };
}

export function calculateObjectGuidance(target: DetectedObject, frame: VideoFrameSize, previous: DetectionGuidance | null, label: string): DetectionGuidance {
    const center = centerOf(target);
    const offsetX = (center.x - frame.width / 2) / frame.width;
    const offsetY = (center.y - frame.height / 2) / frame.height;
    const safeLimit = previous?.direction === 'center' ? OBJECT_TARGETING.SAFE_EXIT : OBJECT_TARGETING.SAFE_ENTER;
    if (Math.abs(offsetX) <= safeLimit && Math.abs(offsetY) <= safeLimit) {
        return { direction: 'center', proximity: 'center', message: `${label}อยู่ตรงกลางแล้ว` };
    }

    const horizontalOvershoot = Math.max(0, Math.abs(offsetX) - OBJECT_TARGETING.SAFE_ENTER);
    const verticalOvershoot = Math.max(0, Math.abs(offsetY) - OBJECT_TARGETING.SAFE_ENTER);
    const previousIsHorizontal = previous?.direction === 'left' || previous?.direction === 'right';
    const keepHorizontal = previousIsHorizontal && horizontalOvershoot > 0 && verticalOvershoot < horizontalOvershoot + OBJECT_TARGETING.AXIS_SWITCH_MARGIN;
    const useHorizontal = keepHorizontal || horizontalOvershoot >= verticalOvershoot;
    const direction = useHorizontal ? offsetX < 0 ? 'left' : 'right' : offsetY < 0 ? 'up' : 'down';
    const magnitude = useHorizontal ? Math.abs(offsetX) : Math.abs(offsetY);
    const proximity = magnitude <= OBJECT_TARGETING.NEAR_LIMIT ? 'near' : 'far';
    const suffix = proximity === 'near' ? 'อีกเล็กน้อย' : '';
    const messages = { left: `ขยับกล้องไปทางซ้าย${suffix}`, right: `ขยับกล้องไปทางขวา${suffix}`, up: `ยกกล้องขึ้น${suffix}`, down: `ลดกล้องลง${suffix}` };
    return { direction, proximity, message: messages[direction] };
}

function makeEvent(state: ObjectTargetingState, type: TargetingEventType, target: DetectedObject | null, guidance: DetectionGuidance | null): { state: ObjectTargetingState; event: TargetingEvent } {
    const eventId = state.eventId + 1;
    return { state: { ...state, eventId }, event: { id: eventId, type, target, guidance } };
}

function result(state: ObjectTargetingState, detections: DetectedObject[], targetObject: DetectedObject | null, guidance: DetectionGuidance | null, event: TargetingEvent | null): ObjectTargetingResult {
    return { state, detections, targetObject, targetIndex: targetObject ? detections.indexOf(targetObject) : null, guidance, event };
}

function buildCandidateState(target: DetectedObject, previous: CandidateState | null, frame: VideoFrameSize): CandidateState {
    return {
        target,
        frames: (previous?.frames ?? 0) + 1,
        targetZoneFrames: isInTargetZone(target, frame) ? (previous?.targetZoneFrames ?? 0) + 1 : 0,
    };
}

export function advanceObjectTargeting(previousState: ObjectTargetingState, rawDetections: DetectedObject[], frame: VideoFrameSize, now: number, getLabel: (className: string) => string = (className) => className): ObjectTargetingResult {
    const detections = filterObjectDetections(rawDetections, frame);
    const ranked = rankNearReticle(detections, frame);

    if (previousState.phase === 'locked' || previousState.phase === 'lost') {
        const lockedTarget = previousState.lockedTarget;
        if (!lockedTarget) return result(createInitialObjectTargetingState(previousState.eventId), detections, null, null, null);
        const reacquiring = previousState.phase === 'lost';
        const match = findSpatialMatch(lockedTarget, detections, frame, reacquiring ? OBJECT_TARGETING.REACQUIRE_IOU : OBJECT_TARGETING.TRACK_IOU, reacquiring ? OBJECT_TARGETING.REACQUIRE_CENTER_DISTANCE : OBJECT_TARGETING.TRACK_CENTER_DISTANCE);
        if (match) {
            const guidance = calculateObjectGuidance(match, frame, previousState.lastGuidance, getLabel(match.class));
            let state: ObjectTargetingState = { ...previousState, phase: 'locked', lockedTarget: match, lostSince: null, lastGuidance: guidance };
            let event: TargetingEvent | null = null;
            if (guidanceKey(guidance) !== guidanceKey(previousState.lastGuidance)) {
                ({ state, event } = makeEvent(state, guidance.direction === 'center' ? 'centered' : 'guidance', match, guidance));
            }
            return result(state, detections, match, guidance, event);
        }
        const lostSince = previousState.lostSince ?? now;
        if (now - lostSince < OBJECT_TARGETING.GRACE_PERIOD_MS) return result({ ...previousState, phase: 'lost', lostSince }, detections, null, null, null);
        const reset = createInitialObjectTargetingState(previousState.eventId);
        const withEvent = makeEvent(reset, 'target-lost', lockedTarget, null);
        return result(withEvent.state, detections, null, null, withEvent.event);
    }

    const top = ranked[0] ?? null;
    if (!top) {
        const state = { ...previousState, phase: 'searching' as const, candidate: null, challenger: null, lastGuidance: null, candidateGuidanceKey: null, candidateGuidanceTarget: null, candidateGuidanceFrames: 0, lastCandidateAnnouncementKey: null };
        return result(state, detections, null, null, null);
    }

    const activeMatch = previousState.candidate
        ? findSpatialMatch(previousState.candidate.target, detections, frame, OBJECT_TARGETING.TRACK_IOU, OBJECT_TARGETING.TRACK_CENTER_DISTANCE)
        : null;
    const topMatchesActive = previousState.candidate
        ? findSpatialMatch(previousState.candidate.target, [top], frame, OBJECT_TARGETING.TRACK_IOU, OBJECT_TARGETING.TRACK_CENTER_DISTANCE)
        : null;

    let candidate = previousState.candidate;
    let challenger = previousState.challenger;
    let guideTarget: DetectedObject;

    if (!candidate) {
        candidate = buildCandidateState(top, null, frame);
        challenger = null;
        guideTarget = top;
    } else if (topMatchesActive) {
        candidate = buildCandidateState(top, candidate, frame);
        challenger = null;
        guideTarget = top;
    } else {
        const challengerMatches = challenger && findSpatialMatch(challenger.target, [top], frame, OBJECT_TARGETING.TRACK_IOU, OBJECT_TARGETING.TRACK_CENTER_DISTANCE);
        challenger = buildCandidateState(top, challengerMatches ? challenger : null, frame);
        if (challenger.frames >= OBJECT_TARGETING.STABLE_FRAMES) {
            candidate = challenger;
            challenger = null;
            guideTarget = top;
        } else {
            // Keep a detected stable candidate during a brief challenger flicker;
            // when it is gone, guide visually toward the provisional challenger.
            guideTarget = activeMatch ?? top;
            if (!topMatchesActive && activeMatch) candidate = { ...candidate, targetZoneFrames: 0 };
        }
    }

    const candidateIsGuide = candidate && findSpatialMatch(candidate.target, [guideTarget], frame, OBJECT_TARGETING.TRACK_IOU, OBJECT_TARGETING.TRACK_CENTER_DISTANCE);
    if (candidateIsGuide && candidate.frames >= OBJECT_TARGETING.STABLE_FRAMES && candidate.targetZoneFrames >= OBJECT_TARGETING.STABLE_FRAMES) {
        const lockedGuidance = calculateObjectGuidance(guideTarget, frame, null, getLabel(guideTarget.class));
        let state: ObjectTargetingState = { ...previousState, phase: 'locked', candidate: null, challenger: null, lockedTarget: guideTarget, lostSince: null, lastGuidance: lockedGuidance, candidateGuidanceKey: null, candidateGuidanceTarget: null, candidateGuidanceFrames: 0 };
        const withEvent = makeEvent(state, 'locked', guideTarget, lockedGuidance);
        state = withEvent.state;
        return result(state, detections, guideTarget, lockedGuidance, withEvent.event);
    }

    const guidance = calculateCandidateGuidance(guideTarget, frame, getLabel(guideTarget.class));
    const key = guidanceKey(guidance);
    const sameGuideTarget = previousState.candidateGuidanceTarget
        && findSpatialMatch(previousState.candidateGuidanceTarget, [guideTarget], frame, OBJECT_TARGETING.TRACK_IOU, OBJECT_TARGETING.TRACK_CENTER_DISTANCE);
    const sameCandidateGuidance = !!sameGuideTarget && key === previousState.candidateGuidanceKey;
    const candidateGuidanceFrames = sameCandidateGuidance ? previousState.candidateGuidanceFrames + 1 : 1;
    const targetChanged = previousState.candidateGuidanceTarget !== null && !sameGuideTarget;
    let state: ObjectTargetingState = {
        ...previousState,
        phase: 'candidate',
        candidate,
        challenger,
        lockedTarget: null,
        lostSince: null,
        lastGuidance: guidance,
        candidateGuidanceKey: key,
        candidateGuidanceTarget: guideTarget,
        candidateGuidanceFrames,
        lastCandidateAnnouncementKey: targetChanged ? null : previousState.lastCandidateAnnouncementKey,
    };
    let event: TargetingEvent | null = null;
    if (targetChanged) {
        ({ state, event } = makeEvent(state, 'candidate-reset', guideTarget, guidance));
    } else if (candidateGuidanceFrames >= OBJECT_TARGETING.CANDIDATE_SPEECH_FRAMES && key !== previousState.lastCandidateAnnouncementKey) {
        ({ state, event } = makeEvent({ ...state, lastCandidateAnnouncementKey: key }, 'candidate-guidance', guideTarget, guidance));
    }
    return result(state, detections, guideTarget, guidance, event);
}

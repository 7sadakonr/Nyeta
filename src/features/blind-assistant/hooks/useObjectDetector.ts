'use client';

import { useEffect, useRef, useState, RefObject } from 'react';
import { DetectedObject, DetectionGuidance } from '@/features/blind-assistant/types/assistant';
import { getObjectLabel } from '@/features/blind-assistant/client/objectLabels';
import {
    advanceObjectTargeting,
    createInitialObjectTargetingState,
    ObjectTargetingState,
    TargetingEvent,
    TargetPhase,
} from '@/features/blind-assistant/client/objectTargeting';
import { getVisibleVideoRegion } from '@/features/blind-assistant/client/videoCoords';

// COCO-SSD is only used for coarse "something is there / move left" guidance, so ~5 checks per second is
// plenty; running it faster just burns battery and re-renders the whole screen.
const DETECTION_INTERVAL_MS = 200;
// Boxes that moved less than this many video pixels are treated as unchanged to avoid pointless re-renders.
const BOX_TOLERANCE_PX = 3;

type Box = [number, number, number, number];
const sameBox = (a: Box, b: Box) => a.every((value, index) => Math.abs(value - b[index]) <= BOX_TOLERANCE_PX);
const sameObject = (a: DetectedObject | null, b: DetectedObject | null) =>
    a === b || (!!a && !!b && a.class === b.class && sameBox(a.bbox as Box, b.bbox as Box));
const sameDetections = (a: DetectedObject[], b: DetectedObject[]) =>
    a.length === b.length && a.every((item, index) => sameObject(item, b[index]));

/** Run `task` when the browser is idle so model loading does not compete with the camera starting up. */
function whenIdle(task: () => void): () => void {
    if (typeof window.requestIdleCallback === 'function') {
        const handle = window.requestIdleCallback(task, { timeout: 2500 });
        return () => window.cancelIdleCallback?.(handle);
    }
    const handle = window.setTimeout(task, 800);
    return () => window.clearTimeout(handle);
}

export interface UseObjectDetectorResult {
    isLoading: boolean;
    detections: DetectedObject[];
    targetObject: DetectedObject | null;
    targetIndex: number | null;
    targetPhase: TargetPhase;
    guidance: DetectionGuidance | null;
    targetingEvent: TargetingEvent | null;
}

/** Client-side COCO-SSD orchestration plus stable reticle-based target tracking. */
export function useObjectDetector(
    videoRef: RefObject<HTMLVideoElement | null>,
    enabled = false,
    containerRef?: RefObject<HTMLElement | null>,
): UseObjectDetectorResult {
    const [isLoading, setIsLoading] = useState(true);
    const [detections, setDetections] = useState<DetectedObject[]>([]);
    const [targetObject, setTargetObject] = useState<DetectedObject | null>(null);
    const [targetIndex, setTargetIndex] = useState<number | null>(null);
    const [targetPhase, setTargetPhase] = useState<TargetPhase>('searching');
    const [guidance, setGuidance] = useState<DetectionGuidance | null>(null);
    const [targetingEvent, setTargetingEvent] = useState<TargetingEvent | null>(null);

    const modelRef = useRef<any>(null);
    const animationFrameRef = useRef<number | null>(null);
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);
    const targetingStateRef = useRef<ObjectTargetingState>(createInitialObjectTargetingState());
    const detectCanvasRef = useRef<HTMLCanvasElement | null>(null);
    // What React currently holds, so unchanged results can be skipped.
    const publishedRef = useRef<{ detections: DetectedObject[]; targetObject: DetectedObject | null; targetIndex: number | null; phase: TargetPhase; guidanceKey: string }>({
        detections: [], targetObject: null, targetIndex: null, phase: 'searching', guidanceKey: '',
    });

    useEffect(() => {
        if (typeof window === 'undefined' || !enabled) return;
        if (modelRef.current) {
            setIsLoading(false);
            return;
        }

        let isMounted = true;
        const loadModel = async () => {
            try {
                // Only the pieces COCO-SSD needs (core + converter + WebGL, CPU as fallback), not the full tfjs bundle.
                const [tf, , , cocoSsd] = await Promise.all([
                    import('@tensorflow/tfjs-core'),
                    import('@tensorflow/tfjs-converter'),
                    import('@tensorflow/tfjs-backend-webgl'),
                    import('@tensorflow-models/coco-ssd'),
                    import('@tensorflow/tfjs-backend-cpu'),
                ]);
                await tf.ready();
                const model = await cocoSsd.load({ base: 'lite_mobilenet_v2' });
                // Compile shaders now, on a tiny canvas, so the first real frame does not freeze the UI.
                const warmup = document.createElement('canvas');
                warmup.width = warmup.height = 64;
                await model.detect(warmup).catch(() => []);
                if (isMounted) {
                    modelRef.current = model;
                    setIsLoading(false);
                }
            } catch (error) {
                console.error('Failed to load COCO-SSD model:', error);
                if (isMounted) setIsLoading(false);
            }
        };

        const cancelIdle = whenIdle(() => { void loadModel(); });
        return () => {
            isMounted = false;
            cancelIdle();
        };
    }, [enabled]);

    useEffect(() => {
        if (enabled) return;
        targetingStateRef.current = createInitialObjectTargetingState(targetingStateRef.current.eventId);
        publishedRef.current = { detections: [], targetObject: null, targetIndex: null, phase: 'searching', guidanceKey: '' };
        setDetections([]);
        setTargetObject(null);
        setTargetIndex(null);
        setTargetPhase('searching');
        setGuidance(null);
        setTargetingEvent(null);
    }, [enabled]);

    useEffect(() => {
        if (!enabled || isLoading || !modelRef.current) return;

        let isActive = true;
        const detect = async () => {
            if (!isActive) return;
            const video = videoRef.current;
            if (video && video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
                try {
                    const container = containerRef?.current || null;
                    const visible = container ? getVisibleVideoRegion(video, container) : null;
                    let rawPredictions: DetectedObject[];

                    if (visible && (visible.width < video.videoWidth || visible.height < video.videoHeight)) {
                        if (!detectCanvasRef.current) {
                            detectCanvasRef.current = document.createElement('canvas');
                        }
                        const canvas = detectCanvasRef.current;
                        canvas.width = visible.width;
                        canvas.height = visible.height;
                        const ctx = canvas.getContext('2d');
                        ctx?.drawImage(video, visible.x, visible.y, visible.width, visible.height, 0, 0, visible.width, visible.height);

                        const predictions: DetectedObject[] = await modelRef.current.detect(canvas);
                        rawPredictions = predictions.map(p => ({
                            ...p,
                            bbox: [
                                p.bbox[0] + visible.x,
                                p.bbox[1] + visible.y,
                                p.bbox[2],
                                p.bbox[3],
                            ] as [number, number, number, number],
                        }));
                    } else {
                        rawPredictions = await modelRef.current.detect(video);
                    }

                    if (!isActive) return;
                    const next = advanceObjectTargeting(
                        targetingStateRef.current,
                        rawPredictions,
                        { width: video.videoWidth, height: video.videoHeight },
                        Date.now(),
                        getObjectLabel,
                    );
                    targetingStateRef.current = next.state;
                    // Only touch React state for values that actually changed.
                    const published = publishedRef.current;
                    if (!sameDetections(published.detections, next.detections)) {
                        published.detections = next.detections;
                        setDetections(next.detections);
                    }
                    if (!sameObject(published.targetObject, next.targetObject)) {
                        published.targetObject = next.targetObject;
                        setTargetObject(next.targetObject);
                    }
                    if (published.targetIndex !== next.targetIndex) {
                        published.targetIndex = next.targetIndex;
                        setTargetIndex(next.targetIndex);
                    }
                    if (published.phase !== next.state.phase) {
                        published.phase = next.state.phase;
                        setTargetPhase(next.state.phase);
                    }
                    const guidanceKey = next.guidance ? JSON.stringify(next.guidance) : '';
                    if (published.guidanceKey !== guidanceKey) {
                        published.guidanceKey = guidanceKey;
                        setGuidance(next.guidance);
                    }
                    if (next.event) setTargetingEvent(next.event);
                } catch (error) {
                    console.error('Object detection error:', error);
                }
            }

            if (isActive) {
                timeoutRef.current = setTimeout(() => {
                    if (isActive) animationFrameRef.current = requestAnimationFrame(detect);
                }, DETECTION_INTERVAL_MS);
            }
        };

        detect();
        return () => {
            isActive = false;
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
            if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
        };
    }, [containerRef, enabled, isLoading, videoRef]);

    return { isLoading, detections, targetObject, targetIndex, targetPhase, guidance, targetingEvent };
}

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

    useEffect(() => {
        if (typeof window === 'undefined' || !enabled) return;
        if (modelRef.current) {
            setIsLoading(false);
            return;
        }

        let isMounted = true;
        const loadModel = async () => {
            try {
                await import('@tensorflow/tfjs');
                const cocoSsd = await import('@tensorflow-models/coco-ssd');
                const model = await cocoSsd.load();
                if (isMounted) {
                    modelRef.current = model;
                    setIsLoading(false);
                }
            } catch (error) {
                console.error('Failed to load COCO-SSD model:', error);
                if (isMounted) setIsLoading(false);
            }
        };

        loadModel();
        return () => {
            isMounted = false;
        };
    }, [enabled]);

    useEffect(() => {
        if (enabled) return;
        targetingStateRef.current = createInitialObjectTargetingState(targetingStateRef.current.eventId);
        setDetections([]);
        setTargetObject(null);
        setTargetIndex(null);
        setTargetPhase('searching');
        setGuidance(null);
        setTargetingEvent(null);
    }, [enabled]);

    useEffect(() => {
        if (!enabled || isLoading || !modelRef.current || !videoRef.current) return;

        const video = videoRef.current;
        let isActive = true;
        const detect = async () => {
            if (!isActive) return;
            if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
                try {
                    const rawPredictions: DetectedObject[] = await modelRef.current.detect(video);
                    if (!isActive) return;
                    const next = advanceObjectTargeting(
                        targetingStateRef.current,
                        rawPredictions,
                        { width: video.videoWidth, height: video.videoHeight },
                        Date.now(),
                        getObjectLabel,
                    );
                    targetingStateRef.current = next.state;
                    setDetections(next.detections);
                    setTargetObject(next.targetObject);
                    setTargetIndex(next.targetIndex);
                    setTargetPhase(next.state.phase);
                    setGuidance(next.guidance);
                    if (next.event) setTargetingEvent(next.event);
                } catch (error) {
                    console.error('Object detection error:', error);
                }
            }

            if (isActive) {
                timeoutRef.current = setTimeout(() => {
                    if (isActive) animationFrameRef.current = requestAnimationFrame(detect);
                }, 100);
            }
        };

        detect();
        return () => {
            isActive = false;
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
            if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
        };
    }, [enabled, isLoading, videoRef]);

    return { isLoading, detections, targetObject, targetIndex, targetPhase, guidance, targetingEvent };
}

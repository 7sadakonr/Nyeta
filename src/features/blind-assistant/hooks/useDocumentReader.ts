import { useState, useEffect, useRef, useCallback, RefObject } from 'react';
import { analyzePageAlignment, preloadPageScanner } from '@/features/blind-assistant/client/pageEdgeDetection';
import { callGeminiVision, captureSharpestFrame, describeGeminiError, isAbortError } from '@/features/blind-assistant/client/geminiVision';
import { speechController } from '@/shared/accessibility/speechController';

import { AssistantStatus, BoundingBox, QuadCorners } from '@/features/blind-assistant/types/assistant';
import { EarconType, startProcessingEarcon } from '@/shared/accessibility/audio';

export interface UseDocumentReaderResult {
    docText: string;
    docIsError: boolean;
    isReading: boolean;
    isProcessing: boolean;
    readerGuidance: string;
    readerAligned: boolean;
    pageBounds: BoundingBox | null;
    pageCorners: QuadCorners | null;
    readDocument: () => Promise<void>;
    replayDocument: () => void;
    stopReading: () => void;
    resetDocument: () => void;
}

const DOCUMENT_IMAGE_MAX_DIMENSION = 2048;
const DOCUMENT_IMAGE_QUALITY = 0.88;
const DOCUMENT_REQUEST_TIMEOUT_MS = 55000;
const PAGE_CROP_PADDING = 0.04;

// A page with usable framing must be seen this many analysis frames in a row before auto-capture.
const CAPTURABLE_FRAMES_REQUIRED = 2;
// Guidance is spoken once it is stable for this many frames, and may repeat after this interval.
const GUIDANCE_STABLE_FRAMES = 2;
const GUIDANCE_REPEAT_MS = 4000;
const NO_PAGE_HINT_AFTER_MS = 3000;
const NO_PAGE_HINT_REPEAT_MS = 6000;
const NO_PAGE_HINT = 'ยังไม่เจอเอกสาร วางเอกสารบนพื้นเรียบให้เห็นทั้งแผ่น แล้วยกโทรศัพท์ขึ้นตรงๆ';

/** Expand a box by a fraction of its size on every side, clamped to the video frame. */
export function padBounds(box: BoundingBox, ratio: number, maxWidth: number, maxHeight: number): BoundingBox {
    const padX = box.width * ratio;
    const padY = box.height * ratio;
    const x = Math.max(0, box.x - padX);
    const y = Math.max(0, box.y - padY);
    return {
        x,
        y,
        width: Math.min(maxWidth - x, box.width + padX * 2),
        height: Math.min(maxHeight - y, box.height + padY * 2),
    };
}

export function useDocumentReader(
    videoRef: RefObject<HTMLVideoElement | null>,
    enabled: boolean,
    isReady: boolean,
    audioReady: boolean,
    aiStatus: AssistantStatus,
    feedback?: (type: EarconType) => void,
    addLog?: (msg: string) => void,
    cameraContainerRef?: RefObject<HTMLElement | null>
): UseDocumentReaderResult {
    const [docText, setDocText] = useState<string>('');
    const [docIsError, setDocIsError] = useState<boolean>(false);
    const [isReading, setIsReading] = useState<boolean>(false);
    const [isProcessing, setIsProcessing] = useState<boolean>(false);
    const [readerGuidance, setReaderGuidance] = useState<string>('');
    const [readerAligned, setReaderAligned] = useState<boolean>(false);
    const [pageBounds, setPageBounds] = useState<BoundingBox | null>(null);
    const [pageCorners, setPageCorners] = useState<QuadCorners | null>(null);

    const docTextRef = useRef<string>(docText);
    const audioReadyRef = useRef(audioReady);
    useEffect(() => { docTextRef.current = docText; }, [docText]);
    audioReadyRef.current = audioReady;

    const lastSpokenPageRef = useRef<string>('');
    const lastSpokenPageAtRef = useRef<number>(0);
    const noPageSinceRef = useRef<number>(0);
    const lastNoPageHintAtRef = useRef<number>(0);
    const alignedCountRef = useRef<number>(0);
    const pageSeenCountRef = useRef<number>(0);
    const pageOverlayActiveRef = useRef<boolean>(false);
    const scanBusyRef = useRef<boolean>(false);
    const autoCaptureFiredRef = useRef<boolean>(false);
    const abortControllerRef = useRef<AbortController | null>(null);

    const consecutiveGuidanceRef = useRef<number>(0);
    const guidanceCandidateRef = useRef<string>('');

    // Status refs for effect closures
    const aiStatusRef = useRef<AssistantStatus>(aiStatus);
    const isReadingRef = useRef<boolean>(isReading);
    useEffect(() => { aiStatusRef.current = aiStatus; }, [aiStatus]);
    useEffect(() => { isReadingRef.current = isReading; }, [isReading]);

    const pageBoundsRef = useRef<BoundingBox | null>(null);
    useEffect(() => { pageBoundsRef.current = pageBounds; }, [pageBounds]);

    const readDocument = useCallback(async () => {
        if (isProcessing || !enabled) return;
        if (!isReady || !videoRef.current) {
            feedback?.('error');
            if (audioReadyRef.current) speechController.speak('กล้องยังไม่พร้อม กรุณารอสักครู่ครับ', { channel: 'critical' });
            return;
        }

        const controller = new AbortController();
        let timedOut = false;
        const timeoutId = setTimeout(() => { timedOut = true; controller.abort(); }, DOCUMENT_REQUEST_TIMEOUT_MS);
        let stopProcessingSound: (() => void) | null = null;

        try {
            setIsProcessing(true);
            feedback?.('capture');
            addLog?.('Capturing document...');

            const captureOptions: { container?: HTMLElement | null; cropRegion?: BoundingBox | null; maxDimension: number; quality: number } = {
                maxDimension: DOCUMENT_IMAGE_MAX_DIMENSION,
                quality: DOCUMENT_IMAGE_QUALITY,
            };
            if (cameraContainerRef?.current) {
                captureOptions.container = cameraContainerRef.current;
            }
            // Crop to the detected page so the OCR model sees the text at the highest possible resolution.
            const video = videoRef.current;
            if (pageBoundsRef.current && video.videoWidth && video.videoHeight) {
                captureOptions.cropRegion = padBounds(pageBoundsRef.current, PAGE_CROP_PADDING, video.videoWidth, video.videoHeight);
            }
            const imageDataUrl = await captureSharpestFrame(video, captureOptions);
            if (!imageDataUrl) {
                feedback?.('error');
                if (audioReadyRef.current) speechController.speak('จับภาพไม่ได้ ถือโทรศัพท์ให้นิ่งแล้วกดใหม่ครับ', { channel: 'critical' });
                return;
            }

            autoCaptureFiredRef.current = true;
            speechController.stop();
            setIsReading(false);
            setDocIsError(false);
            setDocText('');

            abortControllerRef.current?.abort();
            abortControllerRef.current = controller;
            stopProcessingSound = startProcessingEarcon();

            const text = await callGeminiVision({
                mode: 'reader',
                imageDataUrl,
                userPrompt: 'อ่านข้อความทั้งหมดในภาพนี้',
                maxTokens: 4096,
                temperature: 0,
                signal: controller.signal,
            });

            if (!text.trim()) {
                setDocIsError(true);
                setDocText('ไม่พบข้อความในภาพ ลองถือกล้องให้นิ่งและให้เห็นตัวหนังสือชัดขึ้นแล้วกดอ่านใหม่');
                feedback?.('error');
                return;
            }

            setDocText(text);
            feedback?.('success');

            // Do not auto-speak OCR document text; VoiceOver will read from the semantic DOM.
        } catch (error: unknown) {
            if (isAbortError(error)) {
                if (timedOut) {
                    setDocIsError(true);
                    setDocText('ใช้เวลานานเกินไป กรุณากดอ่านใหม่ครับ');
                    feedback?.('error');
                }
                return;
            }
            console.error('Read document error:', error);
            setDocIsError(true);
            // Error text is placed in docText; focus moves there so it is read from the DOM.
            setDocText(describeGeminiError(error));
            addLog?.(`Read document error: ${error instanceof Error ? error.message : String(error)}`);
            feedback?.('error');
        } finally {
            clearTimeout(timeoutId);
            stopProcessingSound?.();
            if (abortControllerRef.current === controller) abortControllerRef.current = null;
            setIsProcessing(false);
        }
    }, [isReady, isProcessing, enabled, videoRef, feedback, addLog, cameraContainerRef]);

    // Use a stable ref for readDocument to use inside the interval
    const readDocumentRef = useRef<() => Promise<void>>(readDocument);
    useEffect(() => { readDocumentRef.current = readDocument; }, [readDocument]);

    useEffect(() => {
        if (!enabled || !isReady) {
            setPageBounds(null);
            setPageCorners(null);
            setReaderGuidance('');
            setReaderAligned(false);
            alignedCountRef.current = 0;
            pageSeenCountRef.current = 0;
            pageOverlayActiveRef.current = false;
            scanBusyRef.current = false;
            return;
        }

        preloadPageScanner().catch(() => {});

        const speakPageGuidance = (text: string) => {
            if (!text) return;
            if (aiStatusRef.current !== 'idle' || isReadingRef.current) return;

            if (text !== guidanceCandidateRef.current) {
                guidanceCandidateRef.current = text;
                consecutiveGuidanceRef.current = 1;
                return;
            }

            consecutiveGuidanceRef.current += 1;
            if (consecutiveGuidanceRef.current < GUIDANCE_STABLE_FRAMES) {
                return;
            }

            if (text.includes('ตรงแล้ว')) return;
            if (!audioReadyRef.current) return;
            // The same guidance may be repeated after a while, so a user who missed it is not left in silence.
            const now = Date.now();
            if (text === lastSpokenPageRef.current && now - lastSpokenPageAtRef.current < GUIDANCE_REPEAT_MS) return;
            if (speechController.speak(text, { channel: 'realtime', dedupeMs: 1200 })) {
                lastSpokenPageRef.current = text;
                lastSpokenPageAtRef.current = now;
            }
        };

        // With no page in view the guidance is empty, which used to leave the user in silence.
        const hintNoPage = () => {
            const now = Date.now();
            if (!noPageSinceRef.current) noPageSinceRef.current = now;
            if (docTextRef.current || aiStatusRef.current !== 'idle' || isReadingRef.current || !audioReadyRef.current) return;
            if (now - noPageSinceRef.current < NO_PAGE_HINT_AFTER_MS) return;
            if (now - lastNoPageHintAtRef.current < NO_PAGE_HINT_REPEAT_MS) return;
            if (speechController.speak(NO_PAGE_HINT, { channel: 'realtime', key: 'reader-no-page', dedupeMs: NO_PAGE_HINT_REPEAT_MS })) {
                lastNoPageHintAtRef.current = now;
            }
        };

        const clearPageOverlay = () => {
            if (!pageOverlayActiveRef.current) return;
            pageOverlayActiveRef.current = false;
            consecutiveGuidanceRef.current = 0;
            guidanceCandidateRef.current = '';
            lastSpokenPageRef.current = '';
            setPageBounds(null);
            setPageCorners(null);
            setReaderGuidance('');
            setReaderAligned(false);
        };

        const applyPageOverlay = (result: any) => {
            pageOverlayActiveRef.current = true;
            setPageBounds(result.bounds);
            setPageCorners(result.corners);
            setReaderGuidance(result.guidance);
            setReaderAligned(result.aligned);
        };

        const analyze = async () => {
            if (scanBusyRef.current) return;
            if (!videoRef.current || videoRef.current.readyState < 2) return;
            if (aiStatusRef.current === 'thinking' || isReadingRef.current) return;

            scanBusyRef.current = true;
            try {
                const result = await analyzePageAlignment(videoRef.current, cameraContainerRef?.current);

                if (!result.detected) {
                    pageSeenCountRef.current = 0;
                    alignedCountRef.current = 0;
                    clearPageOverlay();
                    hintNoPage();
                    return;
                }
                noPageSinceRef.current = 0;

                pageSeenCountRef.current += 1;
                if (pageSeenCountRef.current < 2) {
                    alignedCountRef.current = 0;
                    clearPageOverlay();
                    return;
                }

                applyPageOverlay(result);

                // Capture as soon as the page is readable (fully in frame, reasonable size); exact alignment is not required.
                const canAutoCapture = !autoCaptureFiredRef.current && !docTextRef.current && aiStatusRef.current === 'idle';
                if (!(result.capturable && canAutoCapture)) speakPageGuidance(result.guidance);

                if (result.capturable && canAutoCapture) {
                    alignedCountRef.current += 1;
                    if (alignedCountRef.current >= CAPTURABLE_FRAMES_REQUIRED) {
                        autoCaptureFiredRef.current = true;
                        alignedCountRef.current = 0;
                        feedback?.('success');
                        readDocumentRef.current?.();
                    }
                } else if (!result.capturable) {
                    alignedCountRef.current = 0;
                }
            } finally {
                scanBusyRef.current = false;
            }
        };

        analyze();
        const interval = setInterval(analyze, 500);

        return () => {
            clearInterval(interval);
            pageOverlayActiveRef.current = false;
            scanBusyRef.current = false;
            consecutiveGuidanceRef.current = 0;
            guidanceCandidateRef.current = '';
            lastSpokenPageRef.current = '';
            noPageSinceRef.current = 0;
            setPageBounds(null);
            setPageCorners(null);
            setReaderGuidance('');
            setReaderAligned(false);
            alignedCountRef.current = 0;
            pageSeenCountRef.current = 0;
        };
    }, [enabled, isReady, videoRef, feedback, cameraContainerRef]);

    const replayDocument = useCallback(() => {
        // Document content is read by VoiceOver; no TTS replay
    }, []);

    const resetDocument = useCallback(() => {
        abortControllerRef.current?.abort();
        abortControllerRef.current = null;
        setDocText('');
        setDocIsError(false);
        setIsReading(false);
        autoCaptureFiredRef.current = false;
        
        speechController.stop();
    }, []);

    const stopReading = useCallback(() => {
        
        speechController.stop();
        
        setIsReading(false);
        feedback?.('success');
    }, [feedback]);

    useEffect(() => () => {
        abortControllerRef.current?.abort();
        abortControllerRef.current = null;
    }, []);

    return {
        docText,
        docIsError,
        isReading,
        isProcessing,
        readerGuidance,
        readerAligned,
        pageBounds,
        pageCorners,
        readDocument,
        replayDocument,
        stopReading,
        resetDocument,
    };
}

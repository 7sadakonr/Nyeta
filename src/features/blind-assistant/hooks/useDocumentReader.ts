import { useState, useEffect, useRef, useCallback, RefObject } from 'react';
import { analyzePageAlignment, preloadPageScanner } from '@/features/blind-assistant/client/pageEdgeDetection';
import { callGeminiVision, captureFrameFromVideo } from '@/features/blind-assistant/client/geminiVision';
import speechManager, { Priority } from '@/shared/accessibility/speechManager';
import { SpeechCategory } from '@/shared/types/speech';
import { AssistantStatus, BoundingBox, QuadCorners } from '@/features/blind-assistant/types/assistant';
import { EarconType } from '@/shared/accessibility/audio';

export interface UseDocumentReaderResult {
    docText: string;
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

export function useDocumentReader(
    videoRef: RefObject<HTMLVideoElement | null>,
    enabled: boolean,
    isReady: boolean,
    aiStatus: AssistantStatus,
    feedback?: (type: EarconType) => void,
    addLog?: (msg: string) => void
): UseDocumentReaderResult {
    const [docText, setDocText] = useState<string>('');
    const [isReading, setIsReading] = useState<boolean>(false);
    const [isProcessing, setIsProcessing] = useState<boolean>(false);
    const [readerGuidance, setReaderGuidance] = useState<string>('');
    const [readerAligned, setReaderAligned] = useState<boolean>(false);
    const [pageBounds, setPageBounds] = useState<BoundingBox | null>(null);
    const [pageCorners, setPageCorners] = useState<QuadCorners | null>(null);

    const docTextRef = useRef<string>(docText);
    useEffect(() => { docTextRef.current = docText; }, [docText]);

    const lastSpokenPageRef = useRef<string>('');
    const alignedCountRef = useRef<number>(0);
    const pageSeenCountRef = useRef<number>(0);
    const pageOverlayActiveRef = useRef<boolean>(false);
    const scanBusyRef = useRef<boolean>(false);
    const autoCaptureFiredRef = useRef<boolean>(false);

    const consecutiveGuidanceRef = useRef<number>(0);
    const guidanceCandidateRef = useRef<string>('');

    // Status refs for effect closures
    const aiStatusRef = useRef<AssistantStatus>(aiStatus);
    const isReadingRef = useRef<boolean>(isReading);
    useEffect(() => { aiStatusRef.current = aiStatus; }, [aiStatus]);
    useEffect(() => { isReadingRef.current = isReading; }, [isReading]);

    const readDocument = useCallback(async () => {
        if (isProcessing || !enabled) return;
        if (!isReady || !videoRef.current) {
            feedback?.('error');
            speechManager?.speak('กล้องกำลังเริ่มต้น กรุณารอสักครู่ครับ', {
                priority: Priority.CRITICAL,
                category: SpeechCategory.CRITICAL,
                owner: 'document-reader',
                scope: 'blind:reader',
            });
            return;
        }

        try {
            setIsProcessing(true);
            const imageDataUrl = captureFrameFromVideo(videoRef.current, { maxDimension: 1024, quality: 0.75 });
            if (!imageDataUrl) {
                feedback?.('error');
                speechManager?.speak('ยังจับภาพเอกสารไม่ได้ กรุณาถือกล้องให้นิ่งแล้วลองใหม่ครับ', {
                    priority: Priority.CRITICAL,
                    category: SpeechCategory.CRITICAL,
                    owner: 'document-reader',
                    scope: 'blind:reader',
                });
                setIsProcessing(false);
                return;
            }

            autoCaptureFiredRef.current = true;
            speechManager?.cancel({ owner: 'page-guidance' });
            setIsReading(false);
            feedback?.('capture');
            addLog?.('Capturing document...');
            setDocText('กำลังอ่านเอกสาร รอสักครู่...');

            const text = await callGeminiVision({
                mode: 'reader',
                imageDataUrl,
                userPrompt: 'อ่านข้อความทั้งหมดในภาพนี้',
                maxTokens: 1500,
                temperature: 0,
            });

            setDocText(text);
            feedback?.('success');

            setIsReading(true);
            speechManager?.speak(text, {
                priority: Priority.RESULT,
                category: SpeechCategory.TASK,
                owner: 'document-reader',
                scope: 'blind:reader',
                rate: 1.0,
                chunk: true,
                onEnd: () => setIsReading(false),
            });
        } catch (error: any) {
            console.error('Read document error:', error);
            setDocText(`เกิดข้อผิดพลาด: ${error.message}`);
            addLog?.(`Read document error: ${error.message}`);
            feedback?.('error');
            speechManager?.speak('เกิดข้อผิดพลาดในการอ่านเอกสาร กรุณาลองใหม่อีกครั้งครับ', {
                priority: Priority.CRITICAL,
                category: SpeechCategory.CRITICAL,
                owner: 'document-reader',
                scope: 'blind:reader',
            });
        } finally {
            setIsProcessing(false);
        }
    }, [isReady, isProcessing, enabled, videoRef, feedback, addLog]);

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
            if (!text || text === lastSpokenPageRef.current) return;
            if (aiStatusRef.current !== 'idle' || isReadingRef.current) return;

            if (text !== guidanceCandidateRef.current) {
                guidanceCandidateRef.current = text;
                consecutiveGuidanceRef.current = 1;
                return;
            }

            consecutiveGuidanceRef.current += 1;
            if (consecutiveGuidanceRef.current < 3) {
                return;
            }

            if (text.includes('ตรงแล้ว')) return;
            speechManager?.speak(text, {
                priority: Priority.GUIDANCE,
                category: SpeechCategory.REALTIME,
                owner: 'page-guidance',
                scope: 'blind:reader',
                realtimeKey: 'page-guidance',
                rate: 1.1,
                dedupe: true,
                cooldown: 1200,
            });
            lastSpokenPageRef.current = text;
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
                const result = await analyzePageAlignment(videoRef.current);

                if (!result.detected) {
                    pageSeenCountRef.current = 0;
                    alignedCountRef.current = 0;
                    clearPageOverlay();
                    return;
                }

                pageSeenCountRef.current += 1;
                if (pageSeenCountRef.current < 2) {
                    alignedCountRef.current = 0;
                    clearPageOverlay();
                    return;
                }

                applyPageOverlay(result);
                speakPageGuidance(result.guidance);

                const canAutoCapture = !autoCaptureFiredRef.current && !docTextRef.current;
                if (result.aligned && canAutoCapture && aiStatusRef.current === 'idle') {
                    alignedCountRef.current += 1;
                    if (alignedCountRef.current >= 3) {
                        autoCaptureFiredRef.current = true;
                        alignedCountRef.current = 0;
                        feedback?.('success');
                        speechManager?.cancel({ owner: 'page-guidance' });
                        speechManager?.speak('ตรงแล้ว กำลังถ่ายเอกสาร', {
                            priority: Priority.ACTION,
                            category: SpeechCategory.TASK,
                            owner: 'document-reader',
                            scope: 'blind:reader',
                            rate: 1.1,
                            interrupt: true,
                            dedupe: true,
                        });
                        readDocumentRef.current?.();
                    }
                } else if (!result.aligned) {
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
            setPageBounds(null);
            setPageCorners(null);
            setReaderGuidance('');
            setReaderAligned(false);
            alignedCountRef.current = 0;
            pageSeenCountRef.current = 0;
        };
    }, [enabled, isReady, videoRef, feedback]);

    const replayDocument = useCallback(() => {
        if (!docText || docText.startsWith('กำลังอ่าน') || docText.startsWith('เกิดข้อผิดพลาด')) return;
        speechManager?.cancel({ owner: 'document-reader' });
        setIsReading(true);
        speechManager?.speak(docText, {
            priority: Priority.RESULT,
            category: SpeechCategory.TASK,
            owner: 'document-reader',
            scope: 'blind:reader',
            rate: 1.0,
            chunk: true,
            navigationBehavior: 'pause-resume',
            onEnd: () => setIsReading(false),
        });
        feedback?.('success');
    }, [docText, feedback]);

    const resetDocument = useCallback(() => {
        setDocText('');
        setIsReading(false);
        autoCaptureFiredRef.current = false;
        speechManager?.clearPausedSpeech();
        speechManager?.stopByOwner('document-reader');
        speechManager?.stopByOwner('page-guidance');
    }, []);

    const stopReading = useCallback(() => {
        speechManager?.clearPausedSpeech();
        speechManager?.stopByOwner('document-reader');
        speechManager?.stopByOwner('page-guidance');
        setIsReading(false);
        feedback?.('success');
    }, [feedback]);

    return {
        docText,
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

import { useState, useEffect, useRef, useCallback } from 'react';
import { analyzePageAlignment, preloadPageScanner } from '@/lib/pageEdgeDetection';
import { callGeminiVision, captureFrameFromVideo } from '@/lib/geminiVision';
import { OCR_PROMPT } from '@/lib/visionPrompts';
import speechManager, { Priority } from '@/lib/speechManager';

export function useDocumentReader(videoRef, enabled, isReady, aiStatus, feedback, addLog, setModeAnnouncement) {
    const [docText, setDocText] = useState('');
    const [isReading, setIsReading] = useState(false);
    const [readerGuidance, setReaderGuidance] = useState('');
    const [readerAligned, setReaderAligned] = useState(false);
    const [pageBounds, setPageBounds] = useState(null);
    const [pageCorners, setPageCorners] = useState(null);

    const docTextRef = useRef(docText);
    useEffect(() => { docTextRef.current = docText; }, [docText]);

    const lastSpokenPageRef = useRef('');
    const alignedCountRef = useRef(0);
    const pageSeenCountRef = useRef(0);
    const pageOverlayActiveRef = useRef(false);
    const scanBusyRef = useRef(false);
    const autoCaptureFiredRef = useRef(false);

    const consecutiveGuidanceRef = useRef(0);
    const guidanceCandidateRef = useRef('');
    
    // Status refs for effect closures
    const aiStatusRef = useRef(aiStatus);
    const isReadingRef = useRef(isReading);
    useEffect(() => { aiStatusRef.current = aiStatus; }, [aiStatus]);
    useEffect(() => { isReadingRef.current = isReading; }, [isReading]);

    const readDocument = useCallback(async () => {
        if (!isReady || aiStatus === 'thinking' || !enabled) return;

        const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
        if (!apiKey || !videoRef.current) return;

        try {
            autoCaptureFiredRef.current = true;
            speechManager?.stopAll();
            setIsReading(false);
            feedback?.('capture');
            addLog?.('Capturing document...');

            const imageDataUrl = captureFrameFromVideo(videoRef.current);
            setDocText('กำลังอ่านเอกสาร รอสักครู่...');

            const text = await callGeminiVision({
                apiKey,
                imageDataUrl,
                systemPrompt: OCR_PROMPT,
                userPrompt: 'อ่านข้อความทั้งหมดในภาพนี้',
                maxTokens: 1500,
                temperature: 0,
            });

            setDocText(text);
            feedback?.('success');
            setModeAnnouncement?.(`อ่านเอกสาร: ${text.slice(0, 120)}${text.length > 120 ? '...' : ''}`);

            setIsReading(true);
            speechManager?.speak(text, {
                priority: Priority.NORMAL,
                owner: 'document-reader',
                rate: 1.0,
                chunk: true,
                onEnd: () => setIsReading(false),
            });
        } catch (error) {
            console.error('Read document error:', error);
            setDocText(`เกิดข้อผิดพลาด: ${error.message}`);
            addLog?.(`Read document error: ${error.message}`);
            feedback?.('error');
        }
    }, [isReady, aiStatus, enabled, videoRef, feedback, addLog, setModeAnnouncement]);

    // Use a stable ref for readDocument to use inside the interval
    const readDocumentRef = useRef(readDocument);
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

        const speakPageGuidance = (text) => {
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

            speechManager?.speak(text, {
                priority: Priority.LOW,
                owner: 'page-guidance',
                rate: 1.1,
            });
            lastSpokenPageRef.current = text;
        };

        const clearPageOverlay = () => {
            if (!pageOverlayActiveRef.current) return;
            pageOverlayActiveRef.current = false;
            consecutiveGuidanceRef.current = 0;
            guidanceCandidateRef.current = '';
            setPageBounds(null);
            setPageCorners(null);
            setReaderGuidance('');
            setReaderAligned(false);
        };

        const applyPageOverlay = (result) => {
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
                        setModeAnnouncement?.('ตรงแล้ว กำลังถ่ายเอกสาร');
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
            setPageBounds(null);
            setPageCorners(null);
            setReaderGuidance('');
            setReaderAligned(false);
            alignedCountRef.current = 0;
            pageSeenCountRef.current = 0;
        };
    }, [enabled, isReady, videoRef, feedback, setModeAnnouncement]);

    const replayDocument = useCallback(() => {
        if (!docText || docText.startsWith('กำลังอ่าน') || docText.startsWith('เกิดข้อผิดพลาด')) return;
        speechManager?.stopAll();
        setIsReading(true);
        speechManager?.speak(docText, {
            priority: Priority.HIGH,
            owner: 'document-reader',
            rate: 1.0,
            chunk: true,
            onEnd: () => setIsReading(false),
        });
        feedback?.('success');
    }, [docText, feedback]);

    const resetDocument = useCallback(() => {
        setDocText('');
        setIsReading(false);
        autoCaptureFiredRef.current = false;
        speechManager?.stopByOwner('document-reader');
        speechManager?.stopByOwner('page-guidance');
    }, []);

    const stopReading = useCallback(() => {
        speechManager?.stopByOwner('document-reader');
        speechManager?.stopByOwner('page-guidance');
        setIsReading(false);
        feedback?.('success');
    }, [feedback]);

    return { docText, isReading, readerGuidance, readerAligned, pageBounds, pageCorners, readDocument, replayDocument, stopReading, resetDocument };
}

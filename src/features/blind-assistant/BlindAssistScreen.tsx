'use client';

import { forwardRef, useState, useRef, useEffect, useCallback, useImperativeHandle } from 'react';
import HapticFeedback, { HapticFeedbackHandle } from '@/shared/accessibility/HapticFeedback';

// Custom Hooks
import { useCamera } from '@/features/blind-assistant/hooks/useCamera';
import { useFeedback } from '@/features/blind-assistant/hooks/useFeedback';
import { useSpeechInput } from '@/features/blind-assistant/hooks/useSpeechInput';
import { useObjectDetector } from '@/features/blind-assistant/hooks/useObjectDetector';
import { useAiAssistant } from '@/features/blind-assistant/hooks/useAiAssistant';
import { useCurrencyScanner } from '@/features/blind-assistant/hooks/useCurrencyScanner';
import { useDocumentReader } from '@/features/blind-assistant/hooks/useDocumentReader';
import { useSpeechStatus } from '@/shared/hooks/useSpeechStatus';
import { speechController } from '@/shared/accessibility/speechController';
import { useResultRegionSuppression } from '@/shared/accessibility/useResultRegionSuppression';
import { startProcessingEarcon, stopProcessingEarcon } from '@/shared/accessibility/audio';

import { AssistantMode } from '@/features/blind-assistant/types/assistant';
import { getObjectLabel } from '@/features/blind-assistant/client/objectLabels';
import { isImportantTargetingEvent } from '@/features/blind-assistant/client/objectTargeting';

// UI Components
import TopNavBar from '@/features/blind-assistant/components/TopNavBar';
import CameraView from '@/features/blind-assistant/components/CameraView';
import ChatHistory from '@/features/blind-assistant/components/ChatHistory';
import ControlBar from '@/features/blind-assistant/components/ControlBar';

export function getCameraHeightClass(showCapturedText: boolean, expandCameraPreview = false) {
    if (expandCameraPreview) return 'h-full min-h-0 flex-1';

    return showCapturedText
        ? 'h-[clamp(7rem,20vh,14rem)] min-h-0'
        : 'h-[clamp(14rem,52vh,38rem)] min-h-0';
}

export interface BlindAssistHandle {
    prepareForCall: () => void;
}

export interface BlindAssistScreenProps {
    mode?: AssistantMode;
    presentation?: 'standalone' | 'embedded';
    audioReady?: boolean;
}

export default forwardRef<BlindAssistHandle, BlindAssistScreenProps>(function BlindAssistScreen({ mode = 'assistant', presentation = 'standalone', audioReady = false }, ref) {
    const [, setLogs] = useState<string[]>([]);

    // Refs
    const hapticRef = useRef<HapticFeedbackHandle | null>(null);
    const cameraContainerRef = useRef<HTMLDivElement | null>(null);
    const { resultRegionProps, resetSuppression } = useResultRegionSuppression();

    const stopProcessingRef = useRef<(() => void) | null>(null);
    const stopWaitingSound = useCallback(() => {
        if (stopProcessingRef.current) {
            stopProcessingRef.current();
            stopProcessingRef.current = null;
        }
        stopProcessingEarcon();
    }, []);

    const addLog = useCallback((msg: string) => {
        setLogs(prev => [...prev.slice(-4), msg]);
    }, []);

    // 1. Core Services
    const { feedback } = useFeedback(hapticRef);
    const { videoRef, isReady: aiReady, error: cameraError, initCamera, stopCamera } = useCamera();

    useEffect(() => {
        initCamera();
        return () => stopCamera();
    }, [initCamera, stopCamera]);
    
    // Announce camera access error if any

    useEffect(() => {
        if (cameraError) {
            speechController.speak('ไม่สามารถเปิดกล้องได้ กรุณาไปที่การตั้งค่าเบราว์เซอร์ แล้วอนุญาตให้ใช้กล้องครับ', {
                channel: 'critical'
            });
        }
    }, [cameraError]);

    const { isSpeaking, isQuiet: isSpeechQuiet } = useSpeechStatus();

    // 2. Feature Hooks
    // A. Object Detector: COCO stays client-side; targeting state owns candidate stability and spatial tracking.
    const {
        detections: cocoBoxes,
        guidance: objGuidance,
        targetObject,
        targetPhase,
        targetingEvent,
    } = useObjectDetector(videoRef, mode === 'assistant', cameraContainerRef);

    const guidanceText = objGuidance?.message || '';

    const detectedObjects = targetObject
        ? targetPhase === 'locked' ? `เจอ ${getObjectLabel(targetObject.class)}` : 'พบวัตถุ'
        : '';
    const lastHapticEventIdRef = useRef(0);
    const pendingObjectAnnouncementRef = useRef<{ eventId: number; text: string; important: boolean; candidate: boolean } | null>(null);

    // Drop pending object guidance immediately when guidance suppression activates
    useEffect(() => {
        return speechController.subscribeGuidanceSuppressed(() => {
            if (speechController.isGuidanceSuppressed) {
                pendingObjectAnnouncementRef.current = null;
            }
        });
    }, []);

    useEffect(() => {
        if (mode !== 'assistant' || !targetingEvent || targetingEvent.id <= lastHapticEventIdRef.current) return;
        lastHapticEventIdRef.current = targetingEvent.id;

        if (targetingEvent.type === 'candidate-reset' || speechController.isGuidanceSuppressed) {
            pendingObjectAnnouncementRef.current = null;
            return;
        }

        const target = targetingEvent.target;
        const eventGuidance = targetingEvent.guidance;
        const important = isImportantTargetingEvent(targetingEvent.type);
        if (!important && pendingObjectAnnouncementRef.current?.important) return;
        const label = target ? getObjectLabel(target.class) : '';
        const text = targetingEvent.type === 'target-lost'
            ? `ไม่พบ${label}แล้ว`
            : !target || !eventGuidance
                ? ''
                : targetingEvent.type === 'candidate-guidance'
                    ? eventGuidance.message
                    : targetingEvent.type === 'locked'
                        ? `ล็อก${label}แล้ว ${eventGuidance.message}`
                        : targetingEvent.type === 'centered' || eventGuidance.direction === 'center'
                            ? eventGuidance.message
                            : `${label} ${eventGuidance.message}`;
        if (!text) return;

        // A current lock/lost notification replaces expendable candidate guidance.
        pendingObjectAnnouncementRef.current = { eventId: targetingEvent.id, text, important, candidate: targetingEvent.type === 'candidate-guidance' };
        if (targetingEvent.type === 'centered' || (targetingEvent.type === 'locked' && eventGuidance?.direction === 'center')) {
            hapticRef.current?.trigger(2);
        } else if (targetingEvent.type === 'locked') {
            hapticRef.current?.trigger(1);
        }
    }, [mode, targetingEvent]);

    useEffect(() => {
        if (speechController.isGuidanceSuppressed || speechController.isGuidanceMuted) {
            pendingObjectAnnouncementRef.current = null;
            return;
        }

        const pending = pendingObjectAnnouncementRef.current;
        const eventIsCurrent = !!targetingEvent && targetingEvent.id === pending?.eventId;
        const phaseMatches = pending?.important
            ? (targetingEvent?.type === 'target-lost' ? targetPhase === 'searching' : targetPhase === 'locked')
            : pending?.candidate ? targetPhase === 'candidate' : targetPhase === 'locked';
        
        if (mode !== 'assistant' || !pending || !eventIsCurrent || !phaseMatches) {
            if (!phaseMatches) pendingObjectAnnouncementRef.current = null;
            return;
        }

        if (!pending.important && isSpeechQuiet) return;

        const didSpeak = speechController.speak(pending.text, {
            channel: pending.important ? 'result' : 'realtime',
            key: 'object-guidance',
            rate: 1.2,
            dedupeMs: pending.important ? 0 : 1200,
        });
        
        if (didSpeak && pendingObjectAnnouncementRef.current?.eventId === pending.eventId) {
            pendingObjectAnnouncementRef.current = null;
        }
    }, [isSpeechQuiet, mode, targetPhase, targetingEvent]);

    useEffect(() => () => {
        stopWaitingSound();
        pendingObjectAnnouncementRef.current = null;
        speechController.stop();
        speechController.setGuidanceSuppressed(false);
        speechController.setGuidanceMuted(false);
        resetSuppression();
    }, [resetSuppression, stopWaitingSound]);

    // B. AI Assistant
    const {
        status: aiStatus,
        messages: aiMessages,
        captureAndAsk,
        clearMessages,
        stopSpeaking
    } = useAiAssistant(videoRef, aiReady, feedback, addLog, audioReady, cameraContainerRef);

    const latestResultRef = useRef<HTMLParagraphElement | null>(null);
    const lastFocusedMessageIdRef = useRef<string | null>(null);

    // Be My Eyes capture flow:
    // Preflight check -> stop active speech -> start processing earcon -> suppress guidance persistently -> send request
    const handleCaptureAndAsk = useCallback(async (customPrompt?: string | null) => {
        if (!aiReady) {
            speechController.speak('กล้องยังไม่พร้อม กรุณารอ 2-3 วินาทีแล้วลองกดใหม่ครับ', {
                channel: 'critical',
            });
            feedback('error');
            return;
        }

        // Preflight passed: stop current guidance immediately
        speechController.stop();

        // Start processing earcon loop
        stopWaitingSound();
        stopProcessingRef.current = startProcessingEarcon();

        // Suppress guidance persistently
        speechController.setGuidanceSuppressed(true);

        try {
            const captured = await captureAndAsk(customPrompt);
            if (!captured) {
                // Frame capture failed before request started
                stopWaitingSound();
                speechController.setGuidanceSuppressed(false);
            }
        } catch {
            stopWaitingSound();
        } finally {
            stopWaitingSound();
        }
    }, [aiReady, captureAndAsk, feedback, stopWaitingSound]);

    // เลื่อน focus กลับไปที่จุดเริ่มต้นของผลลัพธ์เพื่ออ่านใหม่ตามที่ผู้ใช้สั่ง
    const handleReadAgain = useCallback(() => {
        feedback('button');
        requestAnimationFrame(() => {
            latestResultRef.current?.focus({ preventScroll: false });
        });
    }, [feedback]);

    const [isGuidanceMuted, setIsGuidanceMuted] = useState(false);

    const handleToggleGuidance = useCallback(() => {
        setIsGuidanceMuted(prev => {
            const next = !prev;
            speechController.setGuidanceMuted(next);
            feedback('button');
            if (next) {
                speechController.speak('ปิดเสียงนำทางแล้ว', { channel: 'critical' });
            } else {
                speechController.speak('เปิดเสียงนำทางแล้ว', { channel: 'critical' });
            }
            return next;
        });
    }, [feedback]);

    // One-shot focus on new AI message without re-focusing on subsequent re-renders
    useEffect(() => {
        if (aiMessages.length === 0) {
            lastFocusedMessageIdRef.current = null;
            return;
        }

        const latestMessage = aiMessages[aiMessages.length - 1];
        if (latestMessage && latestMessage.role === 'ai') {
            const msgId = latestMessage.id || `ai-${aiMessages.length - 1}`;
            if (lastFocusedMessageIdRef.current !== msgId) {
                lastFocusedMessageIdRef.current = msgId;
                stopWaitingSound();
                requestAnimationFrame(() => {
                    if (latestResultRef.current) {
                        latestResultRef.current.focus();
                    }
                });
            }
        }
    }, [aiMessages, stopWaitingSound]);

    // C. Speech Input
    const {
        isListening,
        transcript: voiceTranscript,
        toggleListening,
        cancelListening,
        setTranscript: setVoiceTranscript
    } = useSpeechInput(
        useCallback((text: string) => {
            feedback('capture');
            handleCaptureAndAsk(text);
        }, [feedback, handleCaptureAndAsk]),
        useCallback((type: string) => {
            if (type === 'start') feedback('capture');
        }, [feedback])
    );

    // D. Currency Scanner
    const {
        currencyResult,
        currencyScanning,
        currencyMonitoring,
        currencyHint,
        currencyBounds,
        totalAmount,
        captureCurrency,
        isBlocked: currencyBlocked,
        replayCurrencyDetails,
        clearTotal
    } = useCurrencyScanner(videoRef, mode === 'currency', aiReady, audioReady, feedback, addLog, cameraContainerRef);

    // E. Document Reader
    const {
        docText,
        isReading,
        isProcessing: isDocProcessing,
        readerGuidance,
        readerAligned,
        pageBounds,
        pageCorners,
        readDocument,
        replayDocument,
        stopReading,
        resetDocument
    } = useDocumentReader(videoRef, mode === 'reader', aiReady, audioReady, aiStatus, feedback, addLog, cameraContainerRef);

    // 3. Mode Switcher
    const previousModeRef = useRef<AssistantMode>(mode);
    useEffect(() => {
        if (previousModeRef.current === mode) return;
        cancelListening();
        stopWaitingSound();
        lastFocusedMessageIdRef.current = null;
        pendingObjectAnnouncementRef.current = null;
        speechController.stop();
        speechController.setGuidanceSuppressed(false);
        resetSuppression();
        if (mode !== 'reader') resetDocument();
        if (mode !== 'assistant') setVoiceTranscript('');
        previousModeRef.current = mode;
    }, [cancelListening, mode, resetDocument, resetSuppression, setVoiceTranscript, stopWaitingSound]);

    const prepareForCall = useCallback(() => {
        cancelListening();
        stopWaitingSound();
        lastFocusedMessageIdRef.current = null;
        pendingObjectAnnouncementRef.current = null;
        stopSpeaking();
        stopReading();
        resetDocument();
        stopCamera();
        speechController.stop();
        speechController.setGuidanceSuppressed(false);
        resetSuppression();
    }, [cancelListening, resetDocument, resetSuppression, stopCamera, stopReading, stopSpeaking, stopWaitingSound]);

    const handleClearMessages = useCallback(() => {
        stopWaitingSound();
        lastFocusedMessageIdRef.current = null;
        pendingObjectAnnouncementRef.current = null;
        speechController.stop();
        speechController.setGuidanceSuppressed(false);
        resetSuppression();
        clearMessages();
    }, [clearMessages, resetSuppression, stopWaitingSound]);

    useImperativeHandle(ref, () => ({ prepareForCall }), [prepareForCall]);

    // AI response is read by assistive technology from semantic DOM instead of auto-TTS.

    // Derived State
    const statusLabel = !aiReady
        ? 'กำลังเริ่ม...'
        : mode === 'currency'
            ? currencyBlocked
                ? 'กล้องโดนบัง'
                : currencyScanning || currencyMonitoring
                    ? 'กำลังสแกนเงิน...'
                    : 'พร้อมสแกน'
            : mode === 'reader' && (isDocProcessing || aiStatus === 'thinking')
                ? 'กำลังอ่านเอกสาร...'
                : mode === 'reader' && readerAligned
                    ? 'ตรงแล้ว พร้อมถ่าย'
                    : mode === 'reader' && readerGuidance

                        ? 'จัดกล้อง...'
                        : aiStatus === 'thinking'
                            ? 'กำลังคิด...'
                            : 'AI พร้อม';

    const showCapturedText =
        (mode === 'reader' && !!docText) ||
        (mode === 'assistant' && aiMessages.length > 0);

    const expandCameraPreview = !showCapturedText;
    const cameraHeightClass = getCameraHeightClass(showCapturedText, expandCameraPreview);

    return (
        <div
            data-testid="blind-assistant-shell"
            onContextMenu={(event) => event.preventDefault()}
            className="nyeta-surface flex flex-1 h-full w-full flex-col overflow-hidden bg-[#090909] text-white"
        >
            <HapticFeedback ref={hapticRef} />

            <TopNavBar
                aiReady={aiReady}
                aiStatus={aiStatus}
                mode={mode}
                currencyScanning={currencyScanning}
                currencyMonitoring={currencyMonitoring}
                statusLabel={statusLabel}
            />

            <div className="flex min-h-0 flex-1 flex-col">
                {cameraError && <p className="sr-only">ไม่สามารถเปิดกล้องได้ กรุณาไปที่การตั้งค่าเบราว์เซอร์ แล้วอนุญาตให้ใช้กล้อง</p>}

                <section
                    className={expandCameraPreview
                        ? 'flex min-h-0 flex-1 overflow-hidden p-3 pb-0'
                        : 'min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 pb-2'}
                >
                    <div className={`mx-auto w-full max-w-xl ${expandCameraPreview ? 'flex min-h-0 flex-1 flex-col' : 'space-y-3'}`}>
                        <CameraView
                            videoRef={videoRef}
                            cameraContainerRef={cameraContainerRef}
                            cameraHeightClass={cameraHeightClass}
                            pageBounds={pageBounds}
                            pageCorners={pageCorners}
                            readerAligned={readerAligned}
                            currencyBounds={currencyBounds}
                            mode={mode}
                            currencyResult={currencyResult}
                            currencyScanning={currencyScanning}
                            currencyHint={currencyHint}
                            isBlocked={currencyBlocked}
                            aiStatus={aiStatus}
                            readerGuidance={readerGuidance}
                            showCapturedText={showCapturedText}
                        />

                        {mode === 'assistant' && showCapturedText && (
                            <ChatHistory
                                aiMessages={aiMessages}
                                resultRegionProps={resultRegionProps}
                                latestResultRef={latestResultRef}
                            />
                        )}

                        {mode === 'reader' && showCapturedText && (
                            <section
                                className="mx-4 mt-4 rounded-xl bg-[#1C1C1E] px-5 py-6"
                                aria-label="เนื้อหาเอกสาร"
                                role="region"
                                tabIndex={-1}
                                {...resultRegionProps}
                            >
                                <h2 className="text-[17px] font-semibold text-white">เนื้อหาเอกสาร</h2>
                                <p className="mt-3 whitespace-pre-wrap text-[17px] leading-relaxed text-[#EBEBF5]">{docText}</p>
                            </section>
                        )}
                    </div>
                </section>

                <div className="shrink-0 bg-[#090909] pt-2">
                    <ControlBar
                        mode={mode}
                        aiReady={aiReady}
                        aiStatus={aiStatus}
                        isSpeaking={isSpeaking}
                        isListening={isListening}
                        docText={docText}
                        isReading={isReading}
                        isProcessingDoc={isDocProcessing}
                        currencyResult={currencyResult}
                        currencyScanning={currencyScanning}
                        currencyMonitoring={currencyMonitoring}
                        totalAmount={totalAmount}
                        hasAssistantMessages={aiMessages.length > 0}
                        isGuidanceMuted={isGuidanceMuted}
                        isBlocked={currencyBlocked}
                        readerAligned={readerAligned}
                        onCapture={handleCaptureAndAsk}
                        onStopSpeaking={stopSpeaking}
                        onToggleGuidance={handleToggleGuidance}
                        onStartListening={toggleListening}
                        onStopListening={toggleListening}
                        onCurrencyCapture={captureCurrency}
                        onReplayCurrencyDetails={replayCurrencyDetails}
                        onClearTotal={clearTotal}
                        onClearMessages={handleClearMessages}
                        onReadAgain={handleReadAgain}
                        onReadDocument={readDocument}
                        onReplayDocument={replayDocument}
                        onStopReading={stopReading}
                    />
                </div>
            </div>
        </div>
    );
});

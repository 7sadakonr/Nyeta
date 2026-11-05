'use client';

import { forwardRef, useState, useRef, useEffect, useCallback, useImperativeHandle, useMemo, useSyncExternalStore, RefObject } from 'react';
import HapticFeedback, { HapticFeedbackHandle } from '@/shared/accessibility/HapticFeedback';

// Custom Hooks
import { useCamera } from '@/features/blind-assistant/hooks/useCamera';
import { useFeedback } from '@/features/blind-assistant/hooks/useFeedback';
import { useSpeechInput } from '@/features/blind-assistant/hooks/useSpeechInput';
import { useObjectDetector } from '@/features/blind-assistant/hooks/useObjectDetector';
import { useAiAssistant } from '@/features/blind-assistant/hooks/useAiAssistant';
import { useCameraPauseForMic } from '@/features/blind-assistant/hooks/useCameraPauseForMic';
import { useCurrencyScanner } from '@/features/blind-assistant/hooks/useCurrencyScanner';
import { useDocumentReader } from '@/features/blind-assistant/hooks/useDocumentReader';
import { formatOcrText } from '@/features/blind-assistant/client/ocrText';
import { useSpeechStatus } from '@/shared/hooks/useSpeechStatus';
import { speechController } from '@/shared/accessibility/speechController';
import { useResultRegionSuppression } from '@/shared/accessibility/useResultRegionSuppression';
import { focusProgrammatically } from '@/shared/accessibility/programmaticFocus';
import { announce } from '@/shared/accessibility/announcer';
import { startProcessingEarcon, stopProcessingEarcon } from '@/shared/accessibility/audio';

import { AssistantMode } from '@/features/blind-assistant/types/assistant';
import { getObjectLabel } from '@/features/blind-assistant/client/objectLabels';
import { isImportantTargetingEvent } from '@/features/blind-assistant/client/objectTargeting';

// UI Components
import TopNavBar from '@/features/blind-assistant/components/TopNavBar';
import CameraView from '@/features/blind-assistant/components/CameraView';
import ChatHistory from '@/features/blind-assistant/components/ChatHistory';
import ControlBar from '@/features/blind-assistant/components/ControlBar';

const CLEAR_DOCUMENT_HOLD_MS = 1500;

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
    const { videoRef, isReady: aiReady, error: cameraError, initCamera, retryCamera, stopCamera, setHighResolution } = useCamera();

    useEffect(() => {
        initCamera();
        return () => stopCamera();
    }, [initCamera, stopCamera]);
    
    // Document reading needs the extra resolution; every other mode runs lighter at 720p.
    useEffect(() => {
        setHighResolution(mode === 'reader');
    }, [mode, setHighResolution]);

    // A camera failure is urgent: warn once by voice. The screen then shows the reason and a retry button.
    useEffect(() => {
        if (cameraError) {
            speechController.speak('ไม่สามารถเปิดกล้องได้ กรุณาอนุญาตให้ใช้กล้องในการตั้งค่า แล้วกดลองอีกครั้ง', {
                channel: 'critical'
            });
        }
    }, [cameraError]);

    const handleRetryCamera = useCallback(() => {
        feedback('button');
        void retryCamera();
    }, [feedback, retryCamera]);

    const { isSpeaking, isQuiet: isSpeechQuiet } = useSpeechStatus();

    // 2. Feature Hooks
    // A. Object Detector: COCO stays client-side; targeting state owns candidate stability and spatial tracking.
    const {
        detections: cocoBoxes,
        guidance: objGuidance,
        targetObject,
        targetPhase,
        targetingEvent,
    } = useObjectDetector(videoRef, mode === 'assistant' && aiReady, cameraContainerRef);

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
        // Guidance mute is deliberately kept: it is an app-wide setting that must survive tab changes and calls.
        resetSuppression();
    }, [resetSuppression, stopWaitingSound]);

    // Captures are cropped to what the preview shows. Once a result is on screen the preview shrinks to a thin strip,
    // and cropping to that strip would send the model a sliver of the scene, so then capture the whole frame.
    const previewExpandedRef = useRef(true);
    const captureContainerRef = useMemo<RefObject<HTMLElement | null>>(() => ({
        get current() { return previewExpandedRef.current ? cameraContainerRef.current : null; },
    }), []);

    // B. AI Assistant
    const {
        status: aiStatus,
        messages: aiMessages,
        captureAndAsk,
        clearMessages,
        stopSpeaking,
        cancel: cancelAiRequest,
    } = useAiAssistant(videoRef, aiReady, feedback, addLog, audioReady, captureContainerRef);

    const latestResultRef = useRef<HTMLParagraphElement | null>(null);
    const docResultRef = useRef<HTMLParagraphElement | null>(null);
    const currencyDetailsRef = useRef<HTMLDivElement | null>(null);
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
            focusProgrammatically(latestResultRef.current, { preventScroll: false });
        });
    }, [feedback]);

    // The controller is the single source of truth for the mute switch, so every tab shows the same state.
    const isGuidanceMuted = useSyncExternalStore(
        speechController.subscribeGuidanceMuted.bind(speechController),
        () => speechController.isGuidanceMuted,
        () => false,
    );

    const handleToggleGuidance = useCallback(() => {
        speechController.setGuidanceMuted(!speechController.isGuidanceMuted);
        feedback('button');
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
                    focusProgrammatically(latestResultRef.current);
                });
            }
        }
    }, [aiMessages, stopWaitingSound]);

    // C. Speech Input
    // The newest capture handler, so a question that waited for the camera uses the up-to-date (ready) one.
    const latestCaptureRef = useRef(handleCaptureAndAsk);
    useEffect(() => { latestCaptureRef.current = handleCaptureAndAsk; }, [handleCaptureAndAsk]);
    const waitUntilReadyRef = useRef<(timeoutMs?: number) => Promise<boolean>>(async () => true);

    const {
        isListening,
        transcript: voiceTranscript,
        toggleListening,
        cancelListening,
        setTranscript: setVoiceTranscript
    } = useSpeechInput(
        useCallback((text: string) => {
            feedback('capture');
            // The camera was released while listening; send the question once it is live again.
            void (async () => {
                await waitUntilReadyRef.current(4000);
                // Let the render that marked the camera ready commit, so the ready handler is the current one.
                await new Promise((resolve) => setTimeout(resolve, 0));
                await latestCaptureRef.current(text);
            })();
        }, [feedback]),
        useCallback((type: string) => {
            if (type === 'start' || type === 'mic-start') feedback('capture');
            if (type === 'error') feedback('error');
        }, [feedback]),
        // Microphone problems are announced through the live region; speech synthesis would end up in the open microphone.
        useCallback((message: string) => announce(message), [])
    );

    // iOS can freeze the camera when the microphone opens next to it, so they are never open together.
    const { pauseForListening, waitUntilReady } = useCameraPauseForMic({ isListening, isReady: aiReady, stopCamera, initCamera });
    useEffect(() => { waitUntilReadyRef.current = waitUntilReady; }, [waitUntilReady]);

    const handleStartListening = useCallback(() => {
        pauseForListening();
        toggleListening();
    }, [pauseForListening, toggleListening]);

    // D. Currency Scanner
    const {
        currencyResult,
        currencyScanning,
        currencyMonitoring,
        currencyHint,
        captureMessage: currencyCaptureMessage,
        captureNoticeId: currencyCaptureNoticeId,
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
        docIsError,
        isProcessing: isDocProcessing,
        readerGuidance,
        readerAligned,
        pageBounds,
        pageCorners,
        readDocument,
        restartScan,
        resetDocument
    } = useDocumentReader(videoRef, mode === 'reader', aiReady, audioReady, aiStatus, feedback, addLog, cameraContainerRef, captureContainerRef);

    // Move focus to the OCR result once per new document so assistive tech reads it from the DOM.
    const lastFocusedDocRef = useRef('');
    useEffect(() => {
        if (!docText) {
            lastFocusedDocRef.current = '';
            return;
        }
        if (mode !== 'reader' || lastFocusedDocRef.current === docText) return;
        lastFocusedDocRef.current = docText;
        stopWaitingSound();
        requestAnimationFrame(() => focusProgrammatically(docResultRef.current));
    }, [docText, mode, stopWaitingSound]);

    // 3. Mode Switcher
    const previousModeRef = useRef<AssistantMode>(mode);
    useEffect(() => {
        if (previousModeRef.current === mode) return;
        cancelListening();
        // Leaving a tab abandons whatever it was waiting for, so a late answer cannot land in the wrong mode.
        cancelAiRequest();
        stopWaitingSound();
        lastFocusedMessageIdRef.current = null;
        pendingObjectAnnouncementRef.current = null;
        speechController.stop();
        speechController.setGuidanceSuppressed(false);
        resetSuppression();
        resetDocument();
        if (mode !== 'assistant') setVoiceTranscript('');
        previousModeRef.current = mode;
    }, [cancelAiRequest, cancelListening, mode, resetDocument, resetSuppression, setVoiceTranscript, stopWaitingSound]);

    const prepareForCall = useCallback(() => {
        cancelListening();
        stopWaitingSound();
        lastFocusedMessageIdRef.current = null;
        pendingObjectAnnouncementRef.current = null;
        cancelAiRequest();
        stopSpeaking();
        resetDocument();
        stopCamera();
        speechController.stop();
        speechController.setGuidanceSuppressed(false);
        resetSuppression();
    }, [cancelAiRequest, cancelListening, resetDocument, resetSuppression, stopCamera, stopSpeaking, stopWaitingSound]);

    // With a result on screen the button means "next page": go back to finding one (and give the user time to
    // turn the page). After an error, or with nothing read yet, it reads right away.
    const handleReadDocument = useCallback(() => {
        if (docText && !docIsError) {
            resetSuppression();
            restartScan();
            feedback('button');
            announce('พร้อมอ่านหน้าใหม่ วางเอกสารให้เห็นทั้งแผ่น');
            return;
        }
        void readDocument();
    }, [docIsError, docText, feedback, readDocument, resetSuppression, restartScan]);

    // Currency results and failures are announced through the polite live region (queued, never cutting off).
    useEffect(() => {
        if (mode === 'currency' && currencyResult) announce(`ครั้งนี้ ${currencyResult.total.toLocaleString()} บาท`);
    }, [mode, currencyResult?.captureId]); // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => {
        if (mode === 'currency' && currencyCaptureMessage) announce(currencyCaptureMessage);
    }, [mode, currencyCaptureNoticeId]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleReplayCurrencyDetails = useCallback(() => {
        replayCurrencyDetails();
        requestAnimationFrame(() => focusProgrammatically(currencyDetailsRef.current));
    }, [replayCurrencyDetails]);

    // The result area disappears when cleared, so focus would be lost; put it on the main action instead.
    const dockRef = useRef<HTMLDivElement | null>(null);
    const focusMainAction = useCallback(() => {
        requestAnimationFrame(() => focusProgrammatically(dockRef.current?.querySelector<HTMLElement>('button')));
    }, []);

    const handleClearMessages = useCallback(() => {
        // A request still in flight must not bring its answer back after the chat was cleared.
        cancelAiRequest();
        stopWaitingSound();
        lastFocusedMessageIdRef.current = null;
        pendingObjectAnnouncementRef.current = null;
        speechController.stop();
        speechController.setGuidanceSuppressed(false);
        resetSuppression();
        clearMessages();
        announce('ล้างแชทแล้ว');
        focusMainAction();
    }, [cancelAiRequest, clearMessages, focusMainAction, resetSuppression, stopWaitingSound]);

    const handleClearDocument = useCallback(() => {
        const wasReading = isDocProcessing;
        // Short hold so a page still in view is not captured again the instant it is cleared.
        resetDocument(CLEAR_DOCUMENT_HOLD_MS);
        stopWaitingSound();
        resetSuppression();
        feedback('button');
        announce(wasReading ? 'ยกเลิกการอ่านแล้ว' : 'ล้างเอกสารแล้ว');
        focusMainAction();
    }, [feedback, focusMainAction, isDocProcessing, resetDocument, resetSuppression, stopWaitingSound]);

    useImperativeHandle(ref, () => ({ prepareForCall }), [prepareForCall]);

    // AI response is read by assistive technology from semantic DOM instead of auto-TTS.

    const showCapturedText =
        (mode === 'reader' && !!docText) ||
        (mode === 'assistant' && aiMessages.length > 0);

    const expandCameraPreview = !showCapturedText;
    useEffect(() => {
        previewExpandedRef.current = expandCameraPreview;
    }, [expandCameraPreview]);
    const cameraHeightClass = getCameraHeightClass(showCapturedText, expandCameraPreview);

    return (
        <div
            data-testid="blind-assistant-shell"
            onContextMenu={(event) => event.preventDefault()}
            className="nyeta-surface flex flex-1 h-full w-full flex-col overflow-hidden bg-[#090909] text-white"
        >
            <HapticFeedback ref={hapticRef} />

            <TopNavBar />

            <div className="flex min-h-0 flex-1 flex-col">
                {cameraError && (
                    <p className="mx-3 mt-3 rounded-xl bg-[#3A1418] px-4 py-3 text-[17px] font-semibold text-[#FF453A]">
                        ไม่สามารถเปิดกล้องได้ กรุณาอนุญาตให้ใช้กล้องในการตั้งค่าเบราว์เซอร์ แล้วกดลองอีกครั้ง
                    </p>
                )}

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
                            currencyDetailsRef={currencyDetailsRef}
                        />

                        {mode === 'assistant' && showCapturedText && (
                            <ChatHistory
                                aiMessages={aiMessages}
                                resultRegionProps={resultRegionProps}
                                latestResultRef={latestResultRef}
                            />
                        )}

                        {mode === 'reader' && showCapturedText && (
                            <div
                                className="mx-4 mt-4 rounded-xl bg-[#1C1C1E] px-5 py-6"
                                tabIndex={-1}
                                {...resultRegionProps}
                            >
                                <h2 className="text-[17px] font-semibold text-white">เนื้อหาเอกสาร</h2>
                                {/* One paragraph per element so a screen-reader user can swipe through a long document. */}
                                {formatOcrText(docText).map((paragraph, index) => (
                                    <p
                                        key={index}
                                        ref={index === 0 ? docResultRef : undefined}
                                        tabIndex={index === 0 ? -1 : undefined}
                                        className={`${index === 0 ? 'mt-3' : 'mt-4'} whitespace-pre-wrap text-[17px] leading-relaxed outline-none ${docIsError ? 'text-[#FF453A]' : 'text-[#EBEBF5]'}`}
                                    >{paragraph}</p>
                                ))}
                            </div>
                        )}
                    </div>
                </section>

                <div ref={dockRef} className="shrink-0 bg-[#090909] pt-2">
                    <ControlBar
                        mode={mode}
                        aiReady={aiReady}
                        aiStatus={aiStatus}
                        isListening={isListening}
                        docText={docText}
                        isProcessingDoc={isDocProcessing}
                        currencyResult={currencyResult}
                        currencyScanning={currencyScanning}
                        totalAmount={totalAmount}
                        hasAssistantMessages={aiMessages.length > 0}
                        isGuidanceMuted={isGuidanceMuted}
                        readerAligned={readerAligned}
                        cameraError={!!cameraError}
                        onRetryCamera={handleRetryCamera}
                        onCapture={handleCaptureAndAsk}
                        onToggleGuidance={handleToggleGuidance}
                        onStartListening={handleStartListening}
                        onStopListening={toggleListening}
                        onCurrencyCapture={captureCurrency}
                        onReplayCurrencyDetails={handleReplayCurrencyDetails}
                        onClearTotal={clearTotal}
                        onClearMessages={handleClearMessages}
                        onReadAgain={handleReadAgain}
                        onReadDocument={handleReadDocument}
                        onClearDocument={handleClearDocument}
                        onDisabledPress={() => feedback('error')}
                    />
                </div>
            </div>
        </div>
    );
});

'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import HapticFeedback, { HapticFeedbackHandle } from '@/shared/accessibility/HapticFeedback';

// Custom Hooks
import { useCamera } from '@/features/blind-assistant/hooks/useCamera';
import { useFeedback } from '@/features/blind-assistant/hooks/useFeedback';
import { useSpeechInput } from '@/features/blind-assistant/hooks/useSpeechInput';
import { useObjectDetector } from '@/features/blind-assistant/hooks/useObjectDetector';
import { useAiAssistant } from '@/features/blind-assistant/hooks/useAiAssistant';
import { useCurrencyScanner } from '@/features/blind-assistant/hooks/useCurrencyScanner';
import { useDocumentReader } from '@/features/blind-assistant/hooks/useDocumentReader';
import { useSpeechSpeaking } from '@/features/blind-assistant/hooks/useSpeechStatus';
import speechManager, { Priority } from '@/shared/accessibility/speechManager';
import { SpeechCategory } from '@/shared/types/speech';
import { useAccessibilitySpeechNavigation } from '@/shared/accessibility/useAccessibilitySpeechNavigation';
import { AssistantMode } from '@/features/blind-assistant/types/assistant';
import { getObjectLabel } from '@/features/blind-assistant/client/objectLabels';
import { isImportantTargetingEvent } from '@/features/blind-assistant/client/objectTargeting';

// UI Components
import TopNavBar from '@/features/blind-assistant/components/TopNavBar';
import CameraView from '@/features/blind-assistant/components/CameraView';
import ModeSwitcher from '@/features/blind-assistant/components/ModeSwitcher';
import ChatHistory from '@/features/blind-assistant/components/ChatHistory';
import ControlBar from '@/features/blind-assistant/components/ControlBar';

export function getCameraHeightClass(showCapturedText: boolean, expandCameraPreview = false) {
    if (expandCameraPreview) return 'h-full min-h-0 flex-1';

    return showCapturedText
        ? 'h-[clamp(7rem,20dvh,14rem)] min-h-0'
        : 'h-[clamp(14rem,52dvh,38rem)] min-h-0';
}

export default function BlindAssistScreen() {
    // Mode State
    const [mode, setMode] = useState<AssistantMode>(() => {
        if (typeof window !== 'undefined') {
            const savedMode = localStorage.getItem('nyeta_blind_mode') as AssistantMode | null;
            if (savedMode && ['assistant', 'currency', 'reader'].includes(savedMode)) {
                return savedMode;
            }
        }
        return 'assistant';
    });
    const [, setLogs] = useState<string[]>([]);

    // Refs
    const hapticRef = useRef<HapticFeedbackHandle | null>(null);
    const cameraContainerRef = useRef<HTMLDivElement | null>(null);

    const activateBlindAudio = useCallback(() => {
        speechManager?.activateFromUserGesture('ผู้ช่วยพร้อม', {
            priority: Priority.ACTION,
            category: SpeechCategory.TASK,
            owner: 'blind-entry',
            scope: 'blind:shared',
            rate: 1.1,
            dedupe: 'blind-entry',
        });
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
            speechManager?.speak('ไม่สามารถเข้าถึงกล้องได้ กรุณาอนุญาตการใช้งานกล้องในเบราว์เซอร์ครับ', {
                priority: Priority.CRITICAL,
                category: SpeechCategory.CRITICAL,
                owner: 'camera-error',
                scope: 'blind:shared',
                rate: 1.1,
            });
        }
    }, [cameraError]);

    // 2. Feature Hooks
    // A. Object Detector: COCO stays client-side; targeting state owns candidate stability and spatial tracking.
    const {
        detections: cocoBoxes,
        guidance: objGuidance,
        targetObject,
        targetPhase,
        targetingEvent,
    } = useObjectDetector(videoRef, mode === 'assistant');

    const guidanceText = objGuidance?.message || '';

    const detectedObjects = targetObject
        ? targetPhase === 'locked' ? `เจอ ${getObjectLabel(targetObject.class)}` : 'พบวัตถุ'
        : '';
    const lastHapticEventIdRef = useRef(0);
    const pendingObjectAnnouncementRef = useRef<{ eventId: number; text: string; important: boolean; candidate: boolean } | null>(null);

    useEffect(() => {
        if (mode !== 'assistant' || !targetingEvent || targetingEvent.id <= lastHapticEventIdRef.current) return;
        lastHapticEventIdRef.current = targetingEvent.id;


        if (targetingEvent.type === 'candidate-reset') {
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
        const pending = pendingObjectAnnouncementRef.current;
        const eventIsCurrent = !!targetingEvent && targetingEvent.id === pending?.eventId;
        const phaseMatches = pending?.important
            ? (targetingEvent?.type === 'target-lost' ? targetPhase === 'searching' : targetPhase === 'locked')
            : pending?.candidate ? targetPhase === 'candidate' : targetPhase === 'locked';
        if (mode !== 'assistant' || !pending || !eventIsCurrent || !phaseMatches) {
            if (!phaseMatches) pendingObjectAnnouncementRef.current = null;
            return;
        }

        const didSpeak = speechManager?.speak(pending.text, {
            priority: pending.important ? Priority.RESULT : Priority.GUIDANCE,
            category: pending.important ? SpeechCategory.TASK : SpeechCategory.REALTIME,
            owner: 'object-detector',
            scope: 'blind:assistant',
            realtimeKey: 'object-guidance',
            rate: 1.2,
            interrupt: pending.important,
            dedupe: true,
            cooldown: pending.important ? 0 : 1200,
        }) ?? false;
        if (didSpeak) {

            if (pendingObjectAnnouncementRef.current?.eventId === pending.eventId) pendingObjectAnnouncementRef.current = null;
            return;
        }

        if (pendingObjectAnnouncementRef.current?.eventId === pending.eventId) pendingObjectAnnouncementRef.current = null;
    }, [mode, targetPhase, targetingEvent]);

    useEffect(() => () => {
        pendingObjectAnnouncementRef.current = null;
        speechManager?.stopByOwner('object-detector');
    }, []);

    // The blind surface is TTS-first: assistive-tech focus reads controls, but
    // does not cancel task/realtime audio while the user navigates between them.
    useAccessibilitySpeechNavigation(undefined, 'preserve');

    // B. AI Assistant
    const {
        status: aiStatus,
        messages: aiMessages,
        captureAndAsk,
        askTextOnly,
        clearMessages,
        stopSpeaking
    } = useAiAssistant(videoRef, aiReady, feedback, addLog);

    const isSpeaking = useSpeechSpeaking('ai-response');

    // C. Speech Input
    const {
        isListening,
        transcript: voiceTranscript,
        toggleListening,
        cancelListening,
        setTranscript: setVoiceTranscript
    } = useSpeechInput(
        useCallback((text: string) => {
            feedback('success');
            askTextOnly(text);
        }, [askTextOnly, feedback]),
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
    } = useCurrencyScanner(videoRef, mode === 'currency', aiReady, feedback, addLog);

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
    } = useDocumentReader(videoRef, mode === 'reader', aiReady, aiStatus, feedback, addLog);

    // 3. Mode Switcher
    const switchMode = useCallback((newMode: AssistantMode) => {
        if (newMode === mode) return;

        cancelListening();
        speechManager?.cancel({ scope: `blind:${mode}` });
        speechManager?.interruptForAccessibilityNavigation();
        hapticRef.current?.trigger(1);
        setMode(newMode);
        if (typeof window !== 'undefined') {
            localStorage.setItem('nyeta_blind_mode', newMode);
        }
        // Reset state
        if (newMode !== 'reader') resetDocument();
        if (newMode !== 'assistant') setVoiceTranscript('');
    }, [cancelListening, mode, resetDocument, setVoiceTranscript]);

    // Auto-speak AI responses for blind users
    const prevMessagesLenRef = useRef<number>(0);
    useEffect(() => {
        const hasNewMessage = aiMessages.length > prevMessagesLenRef.current;
        prevMessagesLenRef.current = aiMessages.length;
        if (mode !== 'assistant' || !hasNewMessage) return;
        const lastMsg = aiMessages[aiMessages.length - 1];
        if (lastMsg?.role === 'ai' && lastMsg.content) {
            speechManager?.speak(lastMsg.content, {
                priority: Priority.RESULT,
                category: SpeechCategory.TASK,
                owner: 'ai-response',
                scope: 'blind:assistant',
                rate: 1.0,
                chunk: true,
                interrupt: true,
                exclusive: true,
                dedupe: true,
            });
        }
    }, [aiMessages, mode]);

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
            onClick={activateBlindAudio}
            onTouchStart={activateBlindAudio}
            onContextMenu={(event) => event.preventDefault()}
            className="nyeta-surface flex h-dvh min-h-dvh flex-col overflow-hidden bg-[#08111F] text-[#F8FAFC]"
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

                {cameraError && <p className="sr-only">ไม่สามารถเข้าถึงกล้องได้ กรุณาอนุญาตการใช้งานกล้องในเบราว์เซอร์</p>}

                <ModeSwitcher mode={mode} switchMode={switchMode} />

                <section
                    id={`blind-mode-${mode}-panel`}
                    role="tabpanel"
                    aria-labelledby={`blind-mode-${mode}-tab`}
                    className={expandCameraPreview
                        ? 'flex min-h-0 flex-1 overflow-hidden'
                        : 'min-h-0 flex-1 overflow-y-auto overscroll-contain pb-2'}
                >
                    <div className={`mx-auto w-full max-w-xl ${expandCameraPreview ? 'flex min-h-0 flex-1 flex-col' : ''}`}>
                        <CameraView
                            videoRef={videoRef}
                            cameraContainerRef={cameraContainerRef}
                            cameraHeightClass={cameraHeightClass}
                            cocoBoxes={cocoBoxes}
                            targetObject={targetObject}
                            pageBounds={pageBounds}
                            pageCorners={pageCorners}
                            readerAligned={readerAligned}
                            currencyBounds={currencyBounds}
                            mode={mode}
                            objectDetectorEnabled={true}
                            aiReady={aiReady}
                            currencyResult={currencyResult}
                            currencyScanning={currencyScanning}
                            currencyHint={currencyHint}
                            isBlocked={currencyBlocked}
                            guidanceText={guidanceText}
                            voiceTranscript={voiceTranscript}
                            isListening={isListening}
                            aiStatus={aiStatus}
                            readerGuidance={readerGuidance}
                            showCapturedText={showCapturedText}
                            detectedObjects={detectedObjects}
                        />

                        {mode === 'assistant' && showCapturedText && <ChatHistory aiMessages={aiMessages} />}

                        {mode === 'reader' && showCapturedText && (
                            <section className="bg-[#0F1B2D] px-5 py-6" aria-label="เนื้อหาเอกสาร">
                                <h2 className="text-lg font-semibold text-[#6FE8FF]">เอกสารพร้อมแล้ว</h2>
                                <p className="mt-3 whitespace-pre-wrap text-lg leading-8 text-[#F8FAFC]">{docText}</p>
                                {isReading && <p className="mt-4 text-sm font-medium text-[#6FE8FF]">กำลังอ่านออกเสียง...</p>}
                            </section>
                        )}
                    </div>
                </section>

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
                    isBlocked={currencyBlocked}
                    readerAligned={readerAligned}
                    onCapture={captureAndAsk}
                    onStopSpeaking={stopSpeaking}
                    onStartListening={toggleListening}
                    onStopListening={toggleListening}
                    onCurrencyCapture={captureCurrency}
                    onReplayCurrencyDetails={replayCurrencyDetails}
                    onClearTotal={clearTotal}
                    onClearMessages={clearMessages}
                    onReadDocument={readDocument}
                    onReplayDocument={replayDocument}
                    onStopReading={stopReading}
                />
            </div>
        </div>
    );
}

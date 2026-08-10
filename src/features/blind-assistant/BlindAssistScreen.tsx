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
                owner: 'camera-error',
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
    const lastCandidateSpeechAtRef = useRef(0);
    const speechRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [speechRetryTick, setSpeechRetryTick] = useState(0);
    const pendingObjectAnnouncementRef = useRef<{ eventId: number; text: string; important: boolean; candidate: boolean } | null>(null);

    const clearObjectSpeechRetry = useCallback(() => {
        if (speechRetryTimerRef.current) clearTimeout(speechRetryTimerRef.current);
        speechRetryTimerRef.current = null;
    }, []);

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
        clearObjectSpeechRetry();
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
    }, [clearObjectSpeechRetry, mode, targetingEvent]);

    useEffect(() => {
        const pending = pendingObjectAnnouncementRef.current;
        const eventIsCurrent = !!targetingEvent && targetingEvent.id === pending?.eventId;
        const phaseMatches = pending?.important
            ? (targetingEvent?.type === 'target-lost' ? targetPhase === 'searching' : targetPhase === 'locked')
            : pending?.candidate ? targetPhase === 'candidate' : targetPhase === 'locked';
        if (mode !== 'assistant' || !pending || !eventIsCurrent || !phaseMatches) {
            if (!phaseMatches) pendingObjectAnnouncementRef.current = null;
            clearObjectSpeechRetry();
            return;
        }

        const didSpeak = speechManager?.speak(pending.text, {
            priority: Priority.LOW,
            owner: 'object-detector',
            rate: 1.2,
        }) ?? false;
        if (didSpeak) {

            if (pendingObjectAnnouncementRef.current?.eventId === pending.eventId) pendingObjectAnnouncementRef.current = null;
            clearObjectSpeechRetry();
            return;
        }

        // Retry only this still-current state. A newer candidate, lock, or loss event
        // clears this timer and replaces it, so delayed speech cannot become stale.
        clearObjectSpeechRetry();
        speechRetryTimerRef.current = setTimeout(() => setSpeechRetryTick((tick) => tick + 1), 500);
    }, [clearObjectSpeechRetry, mode, speechRetryTick, targetPhase, targetingEvent]);

    useEffect(() => () => {
        pendingObjectAnnouncementRef.current = null;
        clearObjectSpeechRetry();
        speechManager?.stopByOwner('object-detector');
    }, [clearObjectSpeechRetry]);

    const handleAccessibilityNavigation = useCallback(() => {
        pendingObjectAnnouncementRef.current = null;
        clearObjectSpeechRetry();
    }, [clearObjectSpeechRetry]);
    const accessibilitySpeechNavigation = useAccessibilitySpeechNavigation(handleAccessibilityNavigation);

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
        startListening,
        stopListening,
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
        scannedHistory,
        scannedCount,
        detailsOpen,
        captureCurrency,
        showCurrencyDetails,
        closeCurrencyDetails,
        isBlocked: currencyBlocked,
        replayTotal,
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

        speechManager?.stopAll();
        hapticRef.current?.trigger(1);
        setMode(newMode);
        if (typeof window !== 'undefined') {
            localStorage.setItem('nyeta_blind_mode', newMode);
        }
        // Reset state
        if (newMode !== 'reader') resetDocument();
        if (newMode !== 'assistant') setVoiceTranscript('');
    }, [mode, resetDocument, setVoiceTranscript]);

    // Auto-speak AI responses for blind users
    const prevMessagesLenRef = useRef<number>(0);
    useEffect(() => {
        if (mode !== 'assistant') return;
        if (aiMessages.length <= prevMessagesLenRef.current) {
            prevMessagesLenRef.current = aiMessages.length;
            return;
        }
        prevMessagesLenRef.current = aiMessages.length;
        const lastMsg = aiMessages[aiMessages.length - 1];
        if (lastMsg?.role === 'ai' && lastMsg.content) {
            speechManager?.speak(lastMsg.content, {
                priority: Priority.HIGH,
                owner: 'ai-response',
                rate: 1.0,
                chunk: true,
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

    const cameraHeightClass = showCapturedText ? 'h-[38%]' : 'flex-1 min-h-0';

    return (
        <div
            onClick={() => speechManager?.unlock()}
            onTouchStart={() => speechManager?.unlock()}
            className="flex flex-col h-screen bg-black text-white relative overflow-hidden font-sans"
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

            <main className="w-full h-full flex flex-col relative min-h-0 overflow-hidden" aria-label="ผู้ช่วย AI สำหรับผู้พิการทางสายตา">

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
                    totalAmount={totalAmount}
                    isBlocked={currencyBlocked}
                    guidanceText={guidanceText}
                    voiceTranscript={voiceTranscript}
                    isListening={isListening}
                    aiStatus={aiStatus}
                    readerGuidance={readerGuidance}
                    showCapturedText={showCapturedText}
                    detectedObjects={detectedObjects}
                />
                <ModeSwitcher mode={mode} switchMode={switchMode} />

                {mode === 'assistant' && showCapturedText && (
                    <ChatHistory aiMessages={aiMessages} />
                )}

                {mode === 'reader' && showCapturedText && (
                    <section className="flex-1 overflow-y-auto p-4 bg-zinc-950 min-h-0" aria-label="เนื้อหาเอกสาร" tabIndex={0}>
                        <div className="bg-zinc-900 rounded-2xl p-5 border border-zinc-700">
                            <p className="text-lg leading-relaxed whitespace-pre-wrap text-white">{docText}</p>
                            {isReading && (
                                <p className="text-violet-400 text-sm mt-4 animate-pulse">กำลังอ่านออกเสียง...</p>
                            )}
                        </div>
                    </section>
                )}


                {mode === 'currency' && detailsOpen && currencyResult && (
                    <section className="absolute inset-x-4 bottom-28 z-30 rounded-2xl bg-zinc-950 border-2 border-amber-500 p-5 shadow-2xl" role="dialog" aria-modal="true" aria-label="รายละเอียดเงินที่ตรวจพบ">
                        <div className="flex items-center justify-between gap-4">
                            <h2 className="text-xl font-bold text-amber-200">รายละเอียดเงิน</h2>
                            <button type="button" onClick={closeCurrencyDetails} className="min-h-11 min-w-11 rounded-full bg-zinc-800 text-white border border-zinc-600 focus:ring-2 focus:ring-white focus:outline-none" aria-label="ปิดรายละเอียด">×</button>
                        </div>
                        <ul className="mt-3 space-y-2 text-base text-white">
                            {currencyResult.items.map(item => (
                                <li key={`${item.type}-${item.value}`}>
                                    {item.type === 'note' ? 'ธนบัตร' : 'เหรียญ'} {item.value} บาท จำนวน {item.quantity} {item.type === 'note' ? 'ใบ' : 'เหรียญ'}{item.locations.length ? ` อยู่${item.locations.map(location => ({ top_left: 'ด้านซ้ายบน', top_center: 'ด้านบน', top_right: 'ด้านขวาบน', middle_left: 'ด้านซ้าย', center: 'กลางภาพ', middle_right: 'ด้านขวา', bottom_left: 'ด้านซ้ายล่าง', bottom_center: 'ด้านล่าง', bottom_right: 'ด้านขวาล่าง' }[location])).join(' และ ')}` : ''}
                                </li>
                            ))}
                        </ul>
                        <p className="mt-3 text-lg font-bold text-amber-300">รวมชุดนี้ ฿{currencyResult.total.toLocaleString()}</p>
                    </section>
                )}
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
                    scannedCount={scannedCount}
                    isBlocked={currencyBlocked}
                    readerAligned={readerAligned}
                    onClearChat={clearMessages}
                    onCapture={captureAndAsk}
                    onStopSpeaking={stopSpeaking}
                    onStartListening={startListening}
                    onStopListening={stopListening}
                    onCurrencyCapture={captureCurrency}
                    onShowCurrencyDetails={showCurrencyDetails}
                    onReplayTotal={replayTotal}
                    onClearTotal={clearTotal}
                    onReadDocument={readDocument}
                    onReplayDocument={replayDocument}
                    onStopReading={stopReading}
                />
            </main>
        </div>
    );
}

'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import HapticFeedback from '@/components/HapticFeedback';

// Custom Hooks
import { useCamera } from '@/hooks/useCamera';
import { useFeedback } from '@/hooks/useFeedback';
import { useSpeechInput } from '@/hooks/useSpeechInput';
import { useObjectDetector } from '@/hooks/useObjectDetector';
import { useAiAssistant } from '@/hooks/useAiAssistant';
import { useCurrencyScanner } from '@/hooks/useCurrencyScanner';
import { useDocumentReader } from '@/hooks/useDocumentReader';
import { useSpeechSpeaking } from '@/hooks/useSpeechStatus';
import speechManager, { Priority } from '@/lib/speechManager';

// UI Components
import TopNavBar from '@/components/blind/TopNavBar';
import CameraView from '@/components/blind/CameraView';
import ModeSwitcher from '@/components/blind/ModeSwitcher';
import ChatHistory from '@/components/blind/ChatHistory';
import ControlBar from '@/components/blind/ControlBar';
import ErrorBoundary from '@/components/ErrorBoundary';

export default function BlindAssistPage() {
    // Mode State
    const [mode, setMode] = useState('assistant'); // 'assistant', 'currency', 'reader'
    const [logs, setLogs] = useState([]);
    
    // Refs
    const hapticRef = useRef(null);
    const cameraContainerRef = useRef(null);

    // Load saved mode on mount
    useEffect(() => {
        if (typeof window !== 'undefined') {
            const savedMode = localStorage.getItem('nyeta_blind_mode');
            if (savedMode && ['assistant', 'currency', 'reader'].includes(savedMode)) {
                setMode(savedMode);
            }
        }
    }, []);

    const addLog = useCallback((msg) => {
        setLogs(prev => [...prev.slice(-4), msg]);
    }, []);

    // 1. Core Services
    const { feedback } = useFeedback(hapticRef);
    const { videoRef, isReady: aiReady, error: cameraError, initCamera, stopCamera } = useCamera();

    useEffect(() => {
        initCamera();
        return () => stopCamera();
    }, [initCamera, stopCamera]);

    // Immediate auditory cue when arriving at blind page
    useEffect(() => {
        const timer = setTimeout(() => {
            const savedMode = typeof window !== 'undefined' ? localStorage.getItem('nyeta_blind_mode') : null;
            const currentMode = savedMode || 'assistant';
            const modeName = currentMode === 'currency' ? 'ดูสกุลเงิน' : currentMode === 'reader' ? 'อ่านเอกสาร' : 'ผู้ช่วยเอไอ';
            speechManager?.speak(`โหมด${modeName} กำลังเปิดกล้องครับ`, {
                priority: Priority.NORMAL,
                owner: 'page-mount',
                rate: 1.1,
            });
        }, 100);
        return () => clearTimeout(timer);
    }, []);

    // Initial camera ready announcement (Auditory cue for blind users on initial entry)
    const hasAnnouncedReadyRef = useRef(false);
    useEffect(() => {
        if (aiReady && !hasAnnouncedReadyRef.current) {
            hasAnnouncedReadyRef.current = true;
            const modeName = mode === 'currency' ? 'ดูสกุลเงิน' : mode === 'reader' ? 'อ่านเอกสาร' : 'ผู้ช่วยเอไอ';
            speechManager?.speak(`กล้องโหมด${modeName}พร้อมใช้งานแล้วครับ`, {
                priority: Priority.HIGH,
                owner: 'camera-ready',
                rate: 1.1,
            });
        }
    }, [aiReady, mode]);

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
    // A. Object Detector (always active in assistant mode)
    const {
        detections: cocoBoxes,
        guidance: objGuidance,
        speakGuidance: speakObjGuidance,
        centerObject
    } = useObjectDetector(videoRef, mode === 'assistant');

    const guidanceText = objGuidance?.message || '';
    const detectedObjects = centerObject ? `เจอ ${centerObject.class}` : '';

    useEffect(() => {
        if (mode === 'assistant' && guidanceText && !guidanceText.includes('ไม่เจอ')) {
            speakObjGuidance(guidanceText);
        }
    }, [guidanceText, mode, speakObjGuidance]);

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
        useCallback((text) => {
            feedback('success');
            askTextOnly(text);
        }, [askTextOnly, feedback]),
        useCallback((type) => {
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
        isBlocked: currencyBlocked,
        replayCurrency,
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
    const switchMode = useCallback((newMode) => {
        if (newMode === mode) return;

        speechManager?.stopAll();
        hapticRef.current?.trigger(1);
        setMode(newMode);
        if (typeof window !== 'undefined') {
            localStorage.setItem('nyeta_blind_mode', newMode);
        }
        const modeName = newMode === 'currency' ? 'ดูสกุลเงิน' : newMode === 'reader' ? 'อ่านเอกสาร' : 'ผู้ช่วยเอไอ';
        speechManager?.speak(`เปลี่ยนเป็นโหมด${modeName}`, {
            priority: Priority.CRITICAL,
            owner: 'mode-switch',
            rate: 1.1,
        });
        
        // Reset state
        if (newMode !== 'reader') resetDocument();
        if (newMode !== 'assistant') setVoiceTranscript('');
    }, [mode, resetDocument, setVoiceTranscript]);

    // NEW: Auto-speak AI responses for blind users
    const prevMessagesLenRef = useRef(0);
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
        <ErrorBoundary>
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

                {/* aria-live disabled — speechManager provides centralized TTS feedback without double-speaking */}
                <div className="sr-only" aria-live="off" aria-atomic="true"></div>

                <ModeSwitcher mode={mode} switchMode={switchMode} />

                {mode === 'assistant' && showCapturedText && (
                    <ChatHistory aiMessages={aiMessages} />
                )}

                {mode === 'reader' && showCapturedText && (
                    <section className="flex-1 overflow-y-auto p-4 bg-zinc-950 min-h-0" aria-label="เนื้อหาเอกสาร" tabIndex={0}>
                        <div className="bg-zinc-900 rounded-2xl p-5 border border-zinc-700">
                            <p className="text-lg leading-relaxed whitespace-pre-wrap text-white">{docText}</p>
                            {isReading && (
                                <p className="text-violet-400 text-sm mt-4 animate-pulse" aria-live="polite">กำลังอ่านออกเสียง...</p>
                            )}
                        </div>
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
                    scannedCount={scannedHistory?.length || 0}
                    isBlocked={currencyBlocked}
                    readerAligned={readerAligned}
                    onClearChat={clearMessages}
                    onCapture={captureAndAsk}
                    onStopSpeaking={stopSpeaking}
                    onStartListening={startListening}
                    onStopListening={stopListening}
                    onReplayCurrency={replayCurrency}
                    onReplayTotal={replayTotal}
                    onClearTotal={clearTotal}
                    onReadDocument={readDocument}
                    onReplayDocument={replayDocument}
                    onStopReading={stopReading}
                />
            </main>
        </div>
        </ErrorBoundary>
    );
}

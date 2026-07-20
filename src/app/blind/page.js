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
    const [modeAnnouncement, setModeAnnouncement] = useState('');
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
    const { videoRef, isReady: aiReady, initCamera, stopCamera } = useCamera();

    useEffect(() => {
        initCamera();
        return () => stopCamera();
    }, [initCamera, stopCamera]);

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
        clearMessages
    } = useAiAssistant(videoRef, aiReady, feedback, addLog);

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
        replayCurrency
    } = useCurrencyScanner(videoRef, mode === 'currency', aiReady, feedback, addLog, setModeAnnouncement);

    // E. Document Reader
    const {
        docText,
        isReading,
        readerGuidance,
        readerAligned,
        pageBounds,
        pageCorners,
        readDocument,
        replayDocument,
        stopReading,
        resetDocument
    } = useDocumentReader(videoRef, mode === 'reader', aiReady, aiStatus, feedback, addLog, setModeAnnouncement);

    // 3. Mode Switcher
    const switchMode = useCallback((newMode) => {
        if (newMode === mode) return;

        speechManager?.stopAll();
        hapticRef.current?.trigger(1);
        setMode(newMode);
        if (typeof window !== 'undefined') {
            localStorage.setItem('nyeta_blind_mode', newMode);
        }
        setModeAnnouncement(`เปลี่ยนเป็นโหมด${newMode === 'currency' ? 'ดูสกุลเงิน' : newMode === 'reader' ? 'อ่านเอกสาร' : 'ผู้ช่วยเอไอ'}`);
        
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
                owner: 'ai-assistant',
                rate: 1.0,
                chunk: true,
            });
        }
    }, [aiMessages, mode]);

    // Derived State
    const statusLabel = !aiReady
        ? 'กำลังเริ่ม...'
        : mode === 'currency'
            ? currencyScanning || currencyMonitoring
                ? 'กำลังสแกนเงิน...'
                : 'พร้อมสแกน'
            : mode === 'reader' && aiStatus === 'thinking'
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
        <div className="flex flex-col h-screen bg-black text-white relative overflow-hidden font-sans">
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
                    guidanceText={guidanceText}
                    voiceTranscript={voiceTranscript}
                    isListening={isListening}
                    aiStatus={aiStatus}
                    readerGuidance={readerGuidance}
                    showCapturedText={showCapturedText}
                    detectedObjects={detectedObjects}
                />

                <div className="sr-only" aria-live="assertive" aria-atomic="true">
                    {modeAnnouncement ||
                        (!aiReady ? "กำลังขออนุญาตใช้กล้อง" :
                            aiStatus === 'capturing' ? "กำลังถ่ายภาพ" :
                                aiStatus === 'thinking' ? "AI กำลังวิเคราะห์ รอสักครู่" :
                                    mode === 'reader' && readerGuidance ? readerGuidance :
                                        mode === 'currency' && currencyResult ? currencyResult.value + " บาท" :
                                            mode === 'reader' && isReading ? "กำลังอ่านเอกสารออกเสียง" :
                                                mode === 'assistant' && aiMessages.length > 0 && aiMessages[aiMessages.length - 1].role === 'ai'
                                                    ? `AI ตอบกลับว่า: ${aiMessages[aiMessages.length - 1].content}`
                                                    : "")}
                </div>

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
                    isListening={isListening}
                    docText={docText}
                    isReading={isReading}
                    currencyResult={currencyResult}
                    currencyScanning={currencyScanning}
                    currencyMonitoring={currencyMonitoring}
                    readerAligned={readerAligned}
                    onClearChat={clearMessages}
                    onCapture={captureAndAsk}
                    onStartListening={startListening}
                    onStopListening={stopListening}
                    onReplayCurrency={replayCurrency}
                    onReadDocument={readDocument}
                    onReplayDocument={replayDocument}
                    onStopReading={stopReading}
                />
            </main>
        </div>
        </ErrorBoundary>
    );
}

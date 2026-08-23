import React, { RefObject } from 'react';
import DetectionOverlay from './DetectionOverlay';
import { formatCurrencyDisplay, formatCurrencySpeech } from '@/features/blind-assistant/client/currencyUtils';
import { CapturedCurrency } from '@/features/blind-assistant/hooks/useCurrencyScanner';
import { BlindMode, BoundingBox, DetectedObject, QuadCorners, AssistantStatus } from '@/features/blind-assistant/types/assistant';

export interface CameraViewProps {
    videoRef: RefObject<HTMLVideoElement | null>;
    cameraContainerRef: RefObject<HTMLDivElement | null>;
    cameraHeightClass: string;
    cocoBoxes?: DetectedObject[];
    targetObject?: DetectedObject | null;
    pageBounds?: BoundingBox | null;
    pageCorners?: QuadCorners | null;
    readerAligned?: boolean;
    currencyBounds?: BoundingBox | null;
    mode: BlindMode;
    objectDetectorEnabled?: boolean;
    aiReady: boolean;
    currencyResult: CapturedCurrency | null;
    currencyScanning?: boolean;
    currencyHint?: string;
    totalAmount?: number;
    isBlocked?: boolean;
    guidanceText?: string;
    voiceTranscript?: string;
    isListening?: boolean;
    aiStatus?: AssistantStatus;
    readerGuidance?: string;
    showCapturedText?: boolean;
    detectedObjects?: string;
}

export default function CameraView({
    videoRef,
    cameraContainerRef,
    cameraHeightClass,
    cocoBoxes = [],
    targetObject = null,
    pageBounds = null,
    pageCorners = null,
    readerAligned = false,
    currencyBounds = null,
    mode,
    objectDetectorEnabled = false,
    aiReady,
    currencyResult,
    currencyScanning = false,
    currencyHint = '',
    isBlocked = false,
    guidanceText = '',
    voiceTranscript = '',
    isListening = false,
    aiStatus = 'idle',
    readerGuidance = '',
    showCapturedText = false,
    detectedObjects = '',
}: CameraViewProps) {
    return (
        <div
            ref={cameraContainerRef}
            className={`relative mx-4 w-[calc(100%-2rem)] overflow-hidden rounded-[1.75rem] border border-[#D7E4F3] bg-black shadow-[0_16px_36px_rgba(15,23,42,0.14)] transition-[height] duration-300 motion-reduce:transition-none ${cameraHeightClass}`}
            aria-hidden="true"
        >
            <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                className="absolute inset-0 h-full w-full object-cover"
            />
            <DetectionOverlay
                videoRef={videoRef}
                containerRef={cameraContainerRef}
                cocoBoxes={cocoBoxes}
                targetObject={targetObject}
                pageBounds={pageBounds}
                pageCorners={pageCorners}
                pageAligned={readerAligned}
                currencyBounds={currencyBounds}
                mode={mode}
                showCoco={mode === 'assistant' && objectDetectorEnabled && aiReady}
                showPage={mode === 'reader'}
                showCurrency={mode === 'currency'}
                currencyDetected={!!currencyResult}
                currencyBlocked={isBlocked}
            />
            <div className="pointer-events-none absolute inset-0 z-[5] bg-gradient-to-b from-black/30 via-transparent to-black/35" />

            {mode === 'assistant' && objectDetectorEnabled && guidanceText && !voiceTranscript && (
                <div className={`absolute bottom-3 left-3 right-3 z-20 rounded-2xl border px-4 py-3 text-center shadow-lg backdrop-blur-md ${guidanceText.includes('✅')
                    ? 'border-green-200 bg-white/[0.94]'
                    : guidanceText.includes('ไม่เจอ')
                        ? 'border-slate-200 bg-white/[0.94]'
                        : 'border-blue-200 bg-white/[0.94]'}`}>
                    <p className={`text-base font-bold ${guidanceText.includes('✅') ? 'text-[#15803D]' : guidanceText.includes('ไม่เจอ') ? 'text-[#475569]' : 'text-[#1D4ED8]'}`}>
                        {guidanceText}
                    </p>
                    {detectedObjects && (
                        <p className="mt-1 text-sm font-medium text-[#64748B]">
                            {detectedObjects}
                        </p>
                    )}
                </div>
            )}

            {mode === 'reader' && readerGuidance && !voiceTranscript && aiStatus !== 'thinking' && (
                <div className={`absolute bottom-3 left-3 right-3 z-20 rounded-2xl border px-4 py-3 text-center shadow-lg backdrop-blur-md ${readerAligned
                    ? 'border-green-200 bg-white/[0.94]'
                    : readerGuidance.includes('ยังไม่เจอ')
                        ? 'border-slate-200 bg-white/[0.94]'
                        : 'border-blue-200 bg-white/[0.94]'}`}>
                    <p className={`text-base font-bold ${readerAligned ? 'text-[#15803D]' : readerGuidance.includes('ยังไม่เจอ') ? 'text-[#475569]' : 'text-[#1D4ED8]'}`}>
                        {readerGuidance}
                    </p>
                </div>
            )}

            {mode === 'currency' && (
                <div
                    className={`absolute inset-0 z-20 flex flex-col items-center justify-center p-6 pointer-events-none ${isBlocked ? 'bg-red-950/35' : currencyResult ? 'bg-[#2563EB]/[0.08]' : ''}`}
                >
                    {isBlocked ? (
                        <div className="rounded-3xl border border-red-200 bg-white/95 p-5 text-center shadow-xl backdrop-blur-md">
                            <p className="text-2xl font-bold text-[#B91C1C]">กล้องโดนบัง</p>
                            <p className="mt-2 text-base font-semibold text-[#7F1D1D]">
                                กรุณาเปิดหน้ากล้องหรือขยับมือ
                            </p>
                        </div>
                    ) : (
                        <div className="rounded-3xl bg-white/[0.92] px-5 py-4 text-center shadow-xl backdrop-blur-md">
                            <p className={`text-center font-bold ${currencyResult
                                ? 'text-5xl text-[#1D4ED8]'
                                : currencyScanning
                                    ? 'text-xl text-[#2563EB]'
                                    : 'text-lg text-[#475569]'
                                }`}>
                                {currencyResult
                                    ? formatCurrencyDisplay(currencyResult)
                                    : currencyScanning
                                        ? 'กำลังตรวจเงิน...'
                                        : currencyHint || 'กำลังค้นหาเงินอัตโนมัติ'}
                            </p>
                            {currencyResult && (
                                <p className="mt-3 text-sm font-semibold text-[#475569]">
                                    {formatCurrencySpeech(currencyResult)}
                                </p>
                            )}
                        </div>
                    )}
                </div>
            )}

            {mode === 'assistant' && !showCapturedText && objectDetectorEnabled && !guidanceText && !voiceTranscript && (
                <div className="pointer-events-none absolute bottom-3 left-3 right-3 z-20 rounded-2xl border border-white/50 bg-white/[0.92] p-3 text-center shadow-lg backdrop-blur-md">
                    <p className="text-sm font-semibold text-[#475569]">บรรยายสิ่งที่เห็น หรือกดถามด้วยเสียง</p>
                </div>
            )}

            {voiceTranscript && (
                <div className="absolute bottom-3 left-3 right-3 z-20 rounded-2xl border border-blue-100 bg-white/95 p-3 text-center shadow-lg backdrop-blur-md">
                    <p className={`text-base font-bold ${isListening ? 'text-[#DC2626]' : 'text-[#0F172A]'}`}>
                        {voiceTranscript}
                    </p>
                </div>
            )}
        </div>
    );
}

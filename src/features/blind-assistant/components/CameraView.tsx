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
        <div ref={cameraContainerRef} className={`relative w-full overflow-hidden bg-black transition-[height] duration-300 motion-reduce:transition-none ${cameraHeightClass}`} aria-hidden="true">
            <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                className="absolute inset-0 w-full h-full object-cover"
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
            <div className="pointer-events-none absolute inset-0 z-[5] bg-gradient-to-b from-black/45 via-transparent to-black/50" />

            {/* Guidance overlay: assistant uses COCO, reader uses page alignment */}
            {mode === 'assistant' && objectDetectorEnabled && guidanceText && !voiceTranscript && (
                <div className={`absolute bottom-3 left-3 right-3 z-20 rounded-xl border px-4 py-3 text-center ${guidanceText.includes('✅')
                    ? 'border-green-300 bg-green-700/85'
                    : guidanceText.includes('ไม่เจอ')
                        ? 'border-[#26364D] bg-[#0F1B2D]/90'
                        : 'border-[#6FE8FF]/60 bg-[#143A59]/90'}`}>
                    <p className="text-base font-semibold text-white">
                        {guidanceText}
                    </p>
                    {detectedObjects && (
                        <p className="mt-1 text-sm text-white/80">
                            {detectedObjects}
                        </p>
                    )}
                </div>
            )}

            {mode === 'reader' && readerGuidance && !voiceTranscript && aiStatus !== 'thinking' && (
                <div className={`absolute bottom-3 left-3 right-3 z-20 rounded-xl border px-4 py-3 text-center ${readerAligned
                    ? 'border-green-300 bg-green-700/85'
                    : readerGuidance.includes('ยังไม่เจอ')
                        ? 'border-[#26364D] bg-[#0F1B2D]/90'
                        : 'border-[#6FE8FF]/60 bg-[#143A59]/90'}`}>
                    <p className="text-base font-semibold text-white">
                        {readerGuidance}
                    </p>
                </div>
            )}

            {/* Currency Result / Blocked Overlay */}
            {mode === 'currency' && (
                <div
                    className={`absolute inset-0 z-20 flex flex-col items-center justify-center p-6 pointer-events-none ${isBlocked ? 'bg-red-950/60' : currencyResult ? 'bg-[#3BA7FF]/10' : ''}`}
                >
                    {isBlocked ? (
                        <div className="rounded-2xl border border-[#FF5D6C] bg-red-950/85 p-5 text-center shadow-[0_16px_32px_rgba(0,0,0,0.3)]">
                            <p className="text-2xl font-bold text-white">กล้องโดนบัง</p>
                            <p className="text-lg text-red-200 mt-2 font-medium">
                                กรุณาเปิดหน้ากล้องหรือขยับมือ
                            </p>
                        </div>
                    ) : (
                        <>
                            <p className={`px-4 text-center font-bold ${currencyResult
                                ? 'text-6xl text-[#6FE8FF]'
                                : currencyScanning
                                    ? 'text-xl text-[#6FE8FF]'
                                    : currencyHint
                                        ? 'text-xl text-[#A8B3C5]'
                                        : 'text-xl text-[#A8B3C5]'
                                }`}>
                                {currencyResult
                                    ? formatCurrencyDisplay(currencyResult)
                                    : currencyScanning
                                        ? 'กำลังตรวจเงิน...'
                                        : currencyHint || 'กำลังค้นหาเงินอัตโนมัติ'}
                            </p>
                            {currencyResult && (
                                <p className="mt-3 text-base font-medium text-[#F8FAFC]/85">
                                    {formatCurrencySpeech(currencyResult)}
                                </p>
                            )}
                        </>
                    )}
                </div>
            )}

            {mode === 'assistant' && !showCapturedText && objectDetectorEnabled && !guidanceText && !voiceTranscript && (
                <div className="pointer-events-none absolute bottom-3 left-3 right-3 z-20 rounded-xl border border-[#26364D] bg-[#0F1B2D]/85 p-3 text-center">
                    <p className="text-sm text-[#A8B3C5]">บรรยายสิ่งที่เห็น หรือกดถามด้วยเสียง</p>
                </div>
            )}

            {/* Voice Transcript Overlay */}
            {voiceTranscript && (
                <div className="absolute bottom-3 left-3 right-3 z-20 rounded-xl border border-[#26364D] bg-[#0F1B2D]/90 p-3 text-center">
                    <p className={`text-base font-semibold ${isListening ? 'text-[#FFB2BA]' : 'text-white'}`}>
                        {voiceTranscript}
                    </p>
                </div>
            )}
        </div>
    );
}

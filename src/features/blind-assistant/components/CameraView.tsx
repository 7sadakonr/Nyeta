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
    totalAmount = 0,
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
        <div ref={cameraContainerRef} className={`relative bg-black flex-shrink-0 transition-all duration-300 ${cameraHeightClass}`} aria-hidden="true">
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
            <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-black/30 pointer-events-none z-[5]"></div>

            {/* Currency Running Total Badge (Top Center) */}
            {mode === 'currency' && totalAmount > 0 && (
                <div className="absolute top-4 left-4 right-4 flex justify-center z-20 pointer-events-none">
                    <div className="bg-amber-950/85 border-2 border-amber-400/80 rounded-2xl px-5 py-2.5 backdrop-blur-md shadow-2xl flex items-center gap-3">
                        <span className="text-sm font-semibold text-amber-200">ยอดรวมสะสม:</span>
                        <span className="text-3xl font-black text-amber-300 tracking-wide">฿{totalAmount.toLocaleString()}</span>
                    </div>
                </div>
            )}

            {/* Guidance overlay: assistant uses COCO, reader uses page alignment */}
            {mode === 'assistant' && objectDetectorEnabled && guidanceText && !voiceTranscript && (
                <div
                    className={`absolute bottom-4 left-4 right-4 p-4 rounded-2xl text-center border-2 backdrop-blur-md transition-all duration-300 z-20 ${guidanceText.includes('✅')
                        ? 'bg-green-500/80 border-green-300 animate-pulse'
                        : guidanceText.includes('ไม่เจอ')
                            ? 'bg-zinc-800/80 border-zinc-600'
                            : 'bg-amber-500/80 border-amber-300'}`}
                    role="status"
                    aria-live="assertive"
                >
                    <p className="text-xl font-bold text-white drop-shadow-lg">
                        {guidanceText}
                    </p>
                    {detectedObjects && (
                        <p className="text-base text-white/80 mt-1">
                            {detectedObjects}
                        </p>
                    )}
                </div>
            )}

            {mode === 'reader' && readerGuidance && !voiceTranscript && aiStatus !== 'thinking' && (
                <div
                    className={`absolute bottom-4 left-4 right-4 p-4 rounded-2xl text-center border-2 backdrop-blur-md transition-all duration-300 z-20 ${readerAligned
                        ? 'bg-green-500/80 border-green-300 animate-pulse'
                        : readerGuidance.includes('ยังไม่เจอ')
                            ? 'bg-zinc-800/80 border-zinc-600'
                            : 'bg-violet-500/80 border-violet-300'}`}
                    role="status"
                    aria-live="assertive"
                >
                    <p className="text-xl font-bold text-white drop-shadow-lg">
                        {readerGuidance}
                    </p>
                </div>
            )}

            {/* Currency Result / Blocked Overlay */}
            {mode === 'currency' && (
                <div
                    className={`absolute inset-0 flex flex-col items-center justify-center p-6 z-20 pointer-events-none ${isBlocked ? 'bg-red-950/60' : currencyResult ? 'bg-amber-500/10' : ''}`}
                    role="status"
                    aria-live="assertive"
                >
                    {isBlocked ? (
                        <div className="text-center p-6 rounded-3xl bg-red-900/80 border-4 border-red-500 animate-pulse shadow-2xl">
                            <p className="text-4xl md:text-5xl font-black text-white drop-shadow-lg">
                                ⚠️ กล้องโดนบัง
                            </p>
                            <p className="text-lg text-red-200 mt-2 font-medium">
                                กรุณาเปิดหน้ากล้องหรือขยับมือ
                            </p>
                        </div>
                    ) : (
                        <>
                            <p className={`font-black text-center drop-shadow-lg px-4 ${currencyResult
                                ? 'text-6xl text-amber-300'
                                : currencyScanning
                                    ? 'text-2xl text-amber-200 animate-pulse'
                                    : currencyHint
                                        ? 'text-xl text-amber-200'
                                        : 'text-2xl text-zinc-400'
                                }`}>
                                {currencyResult
                                    ? formatCurrencyDisplay(currencyResult)
                                    : currencyScanning
                                        ? 'กำลังตรวจเงิน...'
                                        : currencyHint || 'กดปุ่มถ่ายเพื่อตรวจธนบัตรหรือเหรียญ'}
                            </p>
                            {currencyResult && (
                                <p className="text-lg text-amber-100/80 mt-3 font-medium">
                                    {formatCurrencySpeech(currencyResult)}
                                </p>
                            )}
                        </>
                    )}
                </div>
            )}

            {mode === 'assistant' && !showCapturedText && objectDetectorEnabled && !guidanceText && !voiceTranscript && (
                <div className="absolute bottom-24 left-4 right-4 p-3 rounded-xl text-center bg-black/50 backdrop-blur-sm border border-white/10 z-20 pointer-events-none">
                    <p className="text-sm text-zinc-300">กดปุ่มถ่ายภาพหรือกดค้างไมค์เพื่อถาม</p>
                </div>
            )}

            {/* Voice Transcript Overlay */}
            {voiceTranscript && (
                <div className="absolute bottom-4 left-4 right-4 bg-black/80 backdrop-blur-md p-4 rounded-2xl text-center border-2 border-white/20 z-20">
                    <p className={`text-xl font-bold ${isListening ? 'text-red-400 animate-pulse' : 'text-white'}`}>
                        {voiceTranscript}
                    </p>
                </div>
            )}
        </div>
    );
}

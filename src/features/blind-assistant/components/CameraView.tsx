import React, { RefObject } from 'react';
import DetectionOverlay from './DetectionOverlay';
import { formatCurrencyDisplay } from '@/features/blind-assistant/client/currencyUtils';
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
            className={`relative w-full overflow-hidden bg-[#1C1C1E] transition-[height] duration-300 motion-reduce:transition-none ${cameraHeightClass}`}
        >
            <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                className="absolute inset-0 h-full w-full object-cover"
                aria-hidden="true"
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
                <div aria-hidden="true" className={`absolute bottom-4 left-4 right-4 z-20 rounded-xl px-4 py-3 text-center backdrop-blur-2xl ${guidanceText.includes('✅')
                    ? 'bg-[#34C759]/20'
                    : guidanceText.includes('ไม่เจอ')
                        ? 'bg-black/60'
                        : 'bg-[#0A84FF]/20'}`}>
                    <p className={`text-[15px] font-semibold ${guidanceText.includes('✅') ? 'text-[#34C759]' : guidanceText.includes('ไม่เจอ') ? 'text-[#8E8E93]' : 'text-[#0A84FF]'}`}>
                        {guidanceText}
                    </p>
                    {detectedObjects && (
                        <p className="mt-1 text-[13px] font-medium text-[#EBEBF5]/60">
                            {detectedObjects}
                        </p>
                    )}
                </div>
            )}

            {mode === 'reader' && readerGuidance && !voiceTranscript && aiStatus !== 'thinking' && (
                <div aria-hidden="true" className={`absolute bottom-4 left-4 right-4 z-20 rounded-xl px-4 py-3 text-center backdrop-blur-2xl ${readerAligned
                    ? 'bg-[#34C759]/20'
                    : readerGuidance.includes('ยังไม่เจอ')
                        ? 'bg-black/60'
                        : 'bg-[#0A84FF]/20'}`}>
                    <p className={`text-[15px] font-semibold ${readerAligned ? 'text-[#34C759]' : readerGuidance.includes('ยังไม่เจอ') ? 'text-[#8E8E93]' : 'text-[#0A84FF]'}`}>
                        {readerGuidance}
                    </p>
                </div>
            )}

            {mode === 'currency' && (
                <>
                    {(isBlocked || !currencyResult) && (
                        <div
                            aria-hidden="true"
                            className={`pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center p-6 ${isBlocked ? 'bg-black/80' : ''}`}
                        >
                            {isBlocked ? (
                                <div className="rounded-xl bg-[#3A1418] p-5 text-center shadow-xl">
                                    <p className="text-[22px] font-bold text-[#FF453A]">กล้องโดนบัง</p>
                                    <p className="mt-2 text-[15px] font-medium text-[#FF453A]/80">
                                        กรุณาเปิดหน้ากล้องหรือขยับมือ
                                    </p>
                                </div>
                            ) : (
                                <div className="rounded-xl bg-black/60 px-5 py-4 text-center shadow-xl backdrop-blur-2xl">
                                    <p className={`text-center font-semibold ${currencyScanning ? 'text-[17px] text-[#0A84FF]' : 'text-[15px] text-[#EBEBF5]/80'}`}>
                                        {currencyScanning ? 'กำลังตรวจเงิน...' : currencyHint || 'กำลังค้นหาเงินอัตโนมัติ'}
                                    </p>
                                </div>
                            )}
                        </div>
                    )}

                    <section
                        className="pointer-events-none absolute bottom-4 left-4 right-4 z-30 grid grid-cols-2 gap-3"
                        aria-label="สรุปการตรวจเงิน"
                    >
                        <div className="rounded-xl bg-black/60 px-3 py-3 text-center backdrop-blur-2xl">
                            <p className="text-[13px] font-semibold text-[#EBEBF5]/60">ตรวจพบล่าสุด</p>
                            <p className="mt-1 text-[22px] font-semibold tracking-tight text-white">
                                {currencyResult ? `฿${currencyResult.total.toLocaleString()}` : '—'}
                            </p>
                        </div>
                        <div className="rounded-xl bg-black/60 px-3 py-3 text-center backdrop-blur-2xl">
                            <p className="text-[13px] font-semibold text-[#EBEBF5]/60">ที่ตรวจจับได้</p>
                            <p className="mt-1 text-[15px] font-semibold leading-5 text-white">
                                {currencyResult ? formatCurrencyDisplay(currencyResult) : '—'}
                            </p>
                        </div>
                    </section>
                </>
            )}

            {mode === 'assistant' && !showCapturedText && objectDetectorEnabled && !guidanceText && !voiceTranscript && (
                <div aria-hidden="true" className="pointer-events-none absolute bottom-4 left-4 right-4 z-20 rounded-xl bg-black/60 p-3 text-center backdrop-blur-2xl">
                    <p className="text-[13px] font-semibold text-[#EBEBF5]/80">บรรยายสิ่งที่เห็น หรือกดถามด้วยเสียง</p>
                </div>
            )}

            {voiceTranscript && (
                <div className="absolute bottom-4 left-4 right-4 z-20 rounded-xl bg-[#0A84FF]/20 p-3 text-center backdrop-blur-2xl">
                    <p className={`text-[15px] font-semibold ${isListening ? 'text-[#FF453A]' : 'text-white'}`}>
                        {voiceTranscript}
                    </p>
                </div>
            )}
        </div>
    );
}

'use client';

import React, { useState, useEffect } from 'react';
import { CaptureState } from '@/features/calling/hooks/useCaptureHandler';

export interface CaptureControlsProps {
    onCapture: (options: { flash: boolean }) => void;
    onToggleFlash?: (enabled: boolean) => void;
    onEndCall?: () => void;
    captureState: CaptureState;
}

export default function CaptureControls({ onCapture, onToggleFlash, onEndCall, captureState }: CaptureControlsProps) {
    const [useFlash, setUseFlash] = useState<boolean>(false);
    const [cooldown, setCooldown] = useState<boolean>(false);

    // Cooldown prevents spamming the capture button
    useEffect(() => {
        if (cooldown) {
            const timer = setTimeout(() => setCooldown(false), 2000);
            return () => clearTimeout(timer);
        }
    }, [cooldown]);

    const handleCapture = () => {
        if (captureState !== 'idle' || cooldown) return;
        setCooldown(true);
        onCapture({ flash: useFlash });
    };

    const handleToggleFlash = () => {
        if (isBusy) return;
        const next = !useFlash;
        setUseFlash(next);
        if (onToggleFlash) onToggleFlash(next);
    };

    const isBusy = captureState !== 'idle';

    return (
        <div className="inline-flex items-center gap-2 sm:gap-2.5 p-1.5 sm:p-2 rounded-full bg-[#141414]/95 backdrop-blur-md border border-white/10 shadow-2xl">
            {/* 1. Freeze / Capture Still Frame Button */}
            <button
                type="button"
                onClick={handleCapture}
                disabled={isBusy || cooldown}
                className={`flex items-center gap-2 px-4 py-2 sm:py-2.5 rounded-full text-xs sm:text-sm font-bold transition-all ${
                    isBusy
                        ? 'bg-zinc-800 text-zinc-400 cursor-not-allowed border border-white/5'
                        : 'bg-vol-accent hover:bg-vol-accent-hover active:scale-95 text-[#090909] shadow-sm'
                }`}
                aria-label="หยุดภาพดู หรือถ่ายภาพความละเอียดสูง"
            >
                {isBusy ? (
                    <>
                        <svg className="animate-spin w-4 h-4 text-vol-accent" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        <span>
                            {captureState === 'flash-on' && 'เปิดแฟลช...'}
                            {captureState === 'capturing' && 'กำลังถ่าย...'}
                            {captureState === 'sending' && 'กำลังส่ง...'}
                        </span>
                    </>
                ) : (
                    <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        <span>หยุดภาพดู</span>
                    </>
                )}
            </button>

            {/* 2. Flashlight Toggle Button */}
            <button
                type="button"
                onClick={handleToggleFlash}
                disabled={isBusy}
                className={`flex items-center gap-1.5 px-3.5 py-2 sm:py-2.5 rounded-full text-xs sm:text-sm font-semibold transition-all border ${
                    useFlash
                        ? 'bg-amber-400/20 text-amber-300 border-amber-400/40 shadow-[0_0_12px_rgba(251,191,36,0.3)]'
                        : 'bg-white/[0.06] hover:bg-white/10 active:scale-95 text-zinc-300 border-white/10'
                }`}
                aria-label={useFlash ? 'ปิดแฟลช' : 'เปิดแฟลช'}
            >
                <svg className={`w-4 h-4 ${useFlash ? 'text-amber-300' : 'text-zinc-400'}`} fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.381z" clipRule="evenodd" />
                </svg>
                <span>{useFlash ? 'แฟลช: เปิด' : 'แฟลช'}</span>
            </button>

            {/* 3. End Call Button (Integrated in dock) */}
            {onEndCall && (
                <button
                    type="button"
                    onClick={onEndCall}
                    className="flex items-center gap-1.5 px-4 py-2 sm:py-2.5 rounded-full text-xs sm:text-sm font-bold bg-red-600 hover:bg-red-500 active:scale-95 text-white transition-all shadow-md focus:outline-none focus:ring-2 focus:ring-red-500/50"
                    aria-label="วางสาย"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.257-1.128a1 1 0 00.502-1.21L9.228 3.684A1 1 0 008.279 3H5z" />
                    </svg>
                    <span>วางสาย</span>
                </button>
            )}
        </div>
    );
}

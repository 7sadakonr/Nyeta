'use client';

import React, { useState, useEffect } from 'react';

export default function CaptureControls({ onCapture, captureState }) {
    const [useFlash, setUseFlash] = useState(false);
    const [cooldown, setCooldown] = useState(false);

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

    const isBusy = captureState !== 'idle';

    return (
        <div className="flex flex-col items-center gap-4">
            {/* Capture Button */}
            <button
                onClick={handleCapture}
                disabled={isBusy || cooldown}
                className={`relative group flex items-center justify-center w-20 h-20 rounded-full transition-all duration-300 ${
                    isBusy 
                        ? 'bg-gray-700 cursor-not-allowed' 
                        : 'bg-white hover:bg-gray-200 active:scale-95 shadow-xl shadow-sky-900/50'
                }`}
                aria-label="ถ่ายภาพจากกล้องผู้ใช้งาน"
            >
                {/* Outer ring */}
                <div className={`absolute inset-1 border-2 rounded-full transition-colors ${
                    isBusy ? 'border-gray-600' : 'border-sky-500'
                }`} />
                
                {isBusy ? (
                    <div className="flex flex-col items-center">
                        <svg className="animate-spin w-8 h-8 text-sky-400 mb-1" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        <span className="text-[10px] text-gray-300 font-medium">
                            {captureState === 'flash-on' && 'เปิดแฟลช...'}
                            {captureState === 'capturing' && 'กำลังถ่าย...'}
                            {captureState === 'sending' && 'กำลังส่ง...'}
                        </span>
                    </div>
                ) : (
                    <svg className="w-10 h-10 text-gray-900 ml-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                )}
            </button>

            {/* Flash Toggle */}
            <label className="flex items-center gap-2 cursor-pointer bg-gray-800/80 backdrop-blur px-4 py-2 rounded-full border border-gray-700 hover:bg-gray-700/80 transition-colors">
                <div className="relative">
                    <input 
                        type="checkbox" 
                        className="sr-only" 
                        checked={useFlash}
                        onChange={(e) => setUseFlash(e.target.checked)}
                        disabled={isBusy}
                    />
                    <div className={`block w-10 h-6 rounded-full transition-colors ${useFlash ? 'bg-yellow-500' : 'bg-gray-600'}`}></div>
                    <div className={`absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform transform ${useFlash ? 'translate-x-4' : 'translate-x-0'}`}></div>
                </div>
                <div className="flex items-center gap-1.5 text-sm font-medium text-gray-200">
                    <svg className={`w-4 h-4 ${useFlash ? 'text-yellow-400' : 'text-gray-400'}`} fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.381z" clipRule="evenodd" />
                    </svg>
                    แฟลช (ถ้ามี)
                </div>
            </label>
        </div>
    );
}

'use client';

import { useState } from 'react';
import EyeIcon from '@/shared/ui/icons/EyeIcon';
import { speechController } from '@/shared/accessibility/speechController';
import { playEarcon } from '@/shared/accessibility/audio';

interface WelcomeScreenProps {
    onStart: () => void;
}

const FEATURES = [
    {
        title: 'บรรยายภาพ AI',
        desc: 'วิเคราะห์สิ่งรอบตัว',
        iconBg: 'bg-sky-500/15 text-sky-400',
        icon: (
            <svg className="size-4.5 sm:size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                <circle cx="12" cy="12" r="3" />
            </svg>
        ),
    },
    {
        title: 'สแกนธนบัตร',
        desc: 'นับยอดเงินอัตโนมัติ',
        iconBg: 'bg-emerald-500/15 text-emerald-400',
        icon: (
            <svg className="size-4.5 sm:size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect width="20" height="12" x="2" y="6" rx="2" />
                <circle cx="12" cy="12" r="2" />
                <path d="M6 12h.01M18 12h.01" />
            </svg>
        ),
    },
    {
        title: 'อ่านเอกสาร',
        desc: 'สแกนข้อความชัดเจน',
        iconBg: 'bg-amber-500/15 text-amber-400',
        icon: (
            <svg className="size-4.5 sm:size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
            </svg>
        ),
    },
    {
        title: 'โทรหาอาสา',
        desc: 'วิดีโอคอลช่วยเหลือสด',
        iconBg: 'bg-purple-500/15 text-purple-400',
        icon: (
            <svg className="size-4.5 sm:size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
        ),
    },
];

export default function WelcomeScreen({ onStart }: WelcomeScreenProps) {
    const [isRequesting, setIsRequesting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleStart = async () => {
        if (isRequesting) return;
        setIsRequesting(true);
        setError(null);
        
        playEarcon('button');
        speechController.unlockAudio();
        speechController.speak('นัยตา', { channel: 'status' });

        try {
            // Request camera and microphone permissions upfront
            const stream = await navigator.mediaDevices.getUserMedia({ 
                video: { facingMode: 'environment' }, 
                audio: true 
            });
            
            // Release the devices immediately so the actual app hooks can claim them
            stream.getTracks().forEach(track => track.stop());
            
            onStart();
        } catch (err) {
            console.error('Permission denied:', err);
            const msg = 'ไม่สามารถเข้าถึงกล้องหรือไมโครโฟนได้ กรุณาอนุญาตในการตั้งค่าเบราว์เซอร์ แล้วลองใหม่อีกครั้งครับ';
            setError(msg);
            speechController.speak(msg, { channel: 'critical' });
            setIsRequesting(false);
        }
    };

    return (
        <main 
            data-testid="welcome-screen"
            className="flex min-h-dvh w-full flex-col items-center justify-center overflow-y-auto bg-[#090909] bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,rgba(14,165,233,0.16),rgba(255,255,255,0))] px-5 py-6 text-white"
            onClick={() => speechController.unlockAudio()}
            onTouchStart={() => speechController.unlockAudio()}
        >
            <div className="flex w-full max-w-sm flex-col items-center text-center">
                {/* Brand Hero */}
                <div className="relative mb-3.5 flex size-16 items-center justify-center rounded-2xl border border-sky-400/30 bg-sky-500/10 shadow-[0_0_35px_rgba(14,165,233,0.25)]">
                    <EyeIcon size={38} className="text-sky-400 drop-shadow-[0_0_10px_rgba(56,189,248,0.5)]" />
                    <span className="absolute -bottom-1 -right-1 flex size-5 items-center justify-center rounded-full bg-sky-500 text-white shadow-md ring-2 ring-[#090909]">
                        <svg className="size-3" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                            <path d="M12 2l2.4 7.4h7.6l-6.2 4.5 2.4 7.4-6.2-4.5-6.2 4.5 2.4-7.4-6.2-4.5h7.6z" />
                        </svg>
                    </span>
                </div>

                <h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl">
                    Nyeta
                </h1>
                <p className="mt-1 text-sm font-medium text-sky-400 sm:text-base">
                    ผู้ช่วย AI เพื่อการมองเห็น
                </p>
                <p className="mx-auto mt-0.5 max-w-xs text-xs text-slate-400">
                    ดวงตา AI และเพื่อนร่วมทางที่พร้อมช่วยเหลือคุณ
                </p>

                {/* 2x2 Feature Cards Grid (Compact & Non-overflowing) */}
                <div className="my-4 grid w-full grid-cols-2 gap-2">
                    {FEATURES.map((item) => (
                        <div
                            key={item.title}
                            className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-2.5 text-left backdrop-blur-sm"
                        >
                            <div className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${item.iconBg}`}>
                                {item.icon}
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="truncate text-xs font-bold text-white sm:text-sm">{item.title}</div>
                                <div className="truncate text-[10px] text-slate-400 sm:text-xs">{item.desc}</div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Primary CTA Button (Elevated, Compact, Fully Visible) */}
                <div className="w-full">
                    <button
                        onClick={handleStart}
                        disabled={isRequesting}
                        className="group flex w-full items-center justify-center gap-2.5 rounded-2xl border border-sky-300/40 bg-sky-500 py-4 px-6 text-xl font-black text-white shadow-[0_0_30px_rgba(14,165,233,0.35)] transition-all hover:bg-sky-400 active:scale-[0.98] active:bg-sky-600 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-sky-300 sm:py-4.5 sm:text-2xl"
                        aria-label="เริ่มใช้งาน และอนุญาตกล้อง"
                    >
                        {isRequesting ? (
                            <>
                                <svg className="size-6 animate-spin text-white" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                                </svg>
                                <span>กำลังเข้าสู่แอป...</span>
                            </>
                        ) : (
                            <>
                                <span>เริ่มใช้งาน</span>
                                <svg
                                    aria-hidden="true"
                                    className="size-6 transition-transform group-hover:translate-x-1"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2.5"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                >
                                    <path d="M5 12h14" />
                                    <path d="m12 5 7 7-7 7" />
                                </svg>
                            </>
                        )}
                    </button>

                    <div className="mt-2.5 flex items-center justify-center gap-1.5 text-xs text-slate-400">
                        <svg className="size-3.5 shrink-0 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                        </svg>
                        <span>ระบบจะขออนุญาตใช้งานกล้องและไมโครโฟน</span>
                    </div>
                </div>

                {/* Error Banner */}
                {error && (
                    <div className="mt-3 w-full rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-center">
                        <p className="text-xs font-semibold leading-relaxed text-red-300 sm:text-sm">
                            {error}
                        </p>
                    </div>
                )}
            </div>
        </main>
    );
}

'use client';

import Link from 'next/link';
import { useRef } from 'react';
import HapticFeedback, { HapticFeedbackHandle } from '@/shared/accessibility/HapticFeedback';
import speechManager, { Priority } from '@/shared/accessibility/speechManager';
import { SpeechCategory } from '@/shared/types/speech';

export default function BlindModeSelectPage() {
  const hapticRef = useRef<HapticFeedbackHandle | null>(null);

  const handleAiStart = () => {
    speechManager?.activateFromUserGesture('ผู้ช่วยพร้อม', {
      priority: Priority.ACTION,
      category: SpeechCategory.TASK,
      owner: 'blind-entry',
      scope: 'blind:shared',
      rate: 1.1,
      dedupe: 'blind-entry',
    });
    localStorage.setItem('nyeta_blind_mode', 'assistant');
    void hapticRef.current?.trigger(5, 100);
  };

  return (
    <main className="nyeta-surface min-h-dvh bg-[#A8FF00] text-white">
      <HapticFeedback ref={hapticRef} />

      <nav className="grid min-h-dvh grid-rows-[45fr_55fr]" aria-label="เลือกโหมดช่วยเหลือ">
        <section className="flex min-h-0 flex-col bg-[linear-gradient(180deg,#075697_0%,#0988F8_42%,#0988F8_100%)]">
          <h1 className="pt-[max(1rem,env(safe-area-inset-top))] text-center text-2xl font-bold tracking-[-0.05em]">Nyeta</h1>
          <Link
            href="/blind"
            onClick={handleAiStart}
            className="group flex min-h-0 flex-1 items-center justify-center px-6 text-center focus-visible:outline-white"
            aria-label="AI, เปิดโหมดผู้ช่วยปัญญาประดิษฐ์"
          >
            <span className="font-mono text-[clamp(3.25rem,12vw,7rem)] font-bold leading-none tracking-[-0.06em] transition-transform duration-150 group-hover:scale-105 group-active:scale-95">
              AI
            </span>
          </Link>
        </section>

        <Link
          href="/call"
          className="group flex min-h-0 items-center justify-center bg-[#A8FF00] px-6 text-center text-black focus-visible:outline-black"
          aria-label="Volunteer Call, โทรหาอาสาสมัคร"
        >
          <span className="font-mono text-[clamp(2.8rem,10vw,6.5rem)] font-bold leading-none tracking-[-0.06em] transition-transform duration-150 group-hover:scale-105 group-active:scale-95">
            Volunteer Call
          </span>
        </Link>
      </nav>
    </main>
  );
}

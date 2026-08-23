'use client';

import { useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import HapticFeedback, { HapticFeedbackHandle } from '@/shared/accessibility/HapticFeedback';

import speechManager, { Priority } from '@/shared/accessibility/speechManager';
import { SpeechCategory } from '@/shared/types/speech';

export default function Home() {
  const router = useRouter();
  const hapticRef = useRef<HapticFeedbackHandle | null>(null);

  const handleStart = () => {
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
    router.push('/blind');
  };

  return (
    <main
      onContextMenu={(event) => event.preventDefault()}
      className="nyeta-surface min-h-dvh bg-[#08111F] px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))] text-[#F8FAFC]"
    >
      <HapticFeedback ref={hapticRef} />

      <div className="mx-auto flex min-h-[calc(100dvh-3rem)] w-full max-w-md flex-col py-3 sm:min-h-[calc(100dvh-4rem)]">
        <header className="flex min-h-16 items-center justify-between px-2">
          <h1 className="text-2xl font-semibold tracking-[-0.03em]">Nyeta</h1>
          <p className="text-sm font-medium text-[#A8B3C5]">ผู้ช่วยการมองเห็น</p>
        </header>

        <nav className="grid flex-1 grid-rows-2 gap-3" aria-label="เลือกโหมดการใช้งาน">
          <button onClick={handleStart} className="group flex min-h-0 flex-col justify-between bg-[#0F1B2D] p-6 text-left transition-colors hover:bg-[#143A59]" aria-label="ผู้ช่วย AI">
            <span aria-hidden="true" className="flex size-12 items-center justify-center rounded-xl bg-[#143A59] text-[#6FE8FF]">
              <svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3.8-7 10-7 10 7 10 7-3.8 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="2.5" /></svg>
            </span>
            <span>
              <span className="block text-3xl font-semibold tracking-[-0.03em] text-[#F8FAFC]">ผู้ช่วย AI</span>
              <span className="mt-2 block text-base leading-6 text-[#A8B3C5]">บรรยายสิ่งที่อยู่ตรงหน้า</span>
            </span>
            <span aria-hidden="true" className="text-xl font-medium text-[#6FE8FF]">เริ่มใช้งาน&nbsp; →</span>
          </button>

          <Link href="/volunteer" className="group flex min-h-0 flex-col justify-between bg-[#111827] p-6 text-left transition-colors hover:bg-[#242113]" aria-label="โหมดอาสาสมัคร">
            <span aria-hidden="true" className="flex size-12 items-center justify-center rounded-xl bg-[#3D3518] text-[#FFD76A]">
              <svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h4l2 5-2.5 1.5a16 16 0 0 0 6 6L15 14l5 2v4c0 1.1-.9 2-2 2C10.3 22 2 13.7 2 6c0-1.1.9-2 2-2Z" /></svg>
            </span>
            <span>
              <span className="block text-3xl font-semibold tracking-[-0.03em] text-[#F8FAFC]">โหมดอาสาสมัคร</span>
              <span className="mt-2 block text-base leading-6 text-[#A8B3C5]">รับสายเพื่อช่วยผู้ใช้งาน</span>
            </span>
            <span aria-hidden="true" className="text-xl font-medium text-[#FFD76A]">เข้าสู่โหมด&nbsp; →</span>
          </Link>
        </nav>
      </div>
    </main>
  );
}

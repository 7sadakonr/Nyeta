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
      className="nyeta-surface min-h-dvh bg-[#F4F8FF] px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] text-[#0F172A]"
    >
      <HapticFeedback ref={hapticRef} />

      <div className="mx-auto flex min-h-[calc(100dvh-2rem)] w-full max-w-md flex-col">
        <header className="flex min-h-16 items-center justify-between px-1">
          <div className="flex items-center gap-3">
            <span aria-hidden="true" className="flex size-10 items-center justify-center rounded-2xl bg-[#2563EB] text-lg font-bold text-white shadow-[0_8px_22px_rgba(37,99,235,0.24)]">N</span>
            <div>
              <h1 className="text-xl font-bold tracking-[-0.03em]">Nyeta</h1>
              <p className="text-xs font-medium text-[#64748B]">ผู้ช่วยการมองเห็น</p>
            </div>
          </div>
          <span aria-hidden="true" className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-[#2563EB] shadow-sm ring-1 ring-[#DBE7F5]">พร้อมใช้งาน</span>
        </header>

        <section className="pb-5 pt-5">
          <p className="text-sm font-semibold text-[#2563EB]">เริ่มต้นใช้งาน</p>
          <h2 className="mt-1 text-[2rem] font-bold leading-tight tracking-[-0.04em]">วันนี้ให้ Nyeta ช่วยอะไร?</h2>
          <p className="mt-2 max-w-sm text-base leading-6 text-[#64748B]">เลือกโหมดที่ต้องการ แล้วเริ่มใช้งานได้ทันที</p>
        </section>

        <nav className="flex flex-1 flex-col gap-4 pb-4" aria-label="เลือกโหมดการใช้งาน">
          <button
            onClick={handleStart}
            className="group flex min-h-[13rem] flex-1 flex-col justify-between rounded-[1.75rem] border border-[#CFE2FF] bg-[#EAF4FF] p-6 text-left shadow-[0_16px_40px_rgba(37,99,235,0.10)] transition-transform active:scale-[0.99]"
            aria-label="ผู้ช่วย AI"
          >
            <span aria-hidden="true" className="flex size-14 items-center justify-center rounded-2xl bg-[#2563EB] text-white shadow-[0_10px_24px_rgba(37,99,235,0.22)]">
              <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3.8-7 10-7 10 7 10 7-3.8 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="2.5" /></svg>
            </span>
            <span className="mt-6">
              <span className="block text-3xl font-bold tracking-[-0.04em] text-[#0F172A]">ผู้ช่วย AI</span>
              <span className="mt-2 block text-base leading-6 text-[#475569]">ใช้กล้องเพื่อบรรยายสิ่งรอบตัว ตรวจเงิน และอ่านเอกสาร</span>
            </span>
            <span aria-hidden="true" className="mt-5 flex items-center gap-2 text-base font-bold text-[#2563EB]">เริ่มใช้งาน <span className="text-xl">→</span></span>
          </button>

          <Link
            href="/volunteer"
            className="group flex min-h-[10.5rem] flex-col justify-between rounded-[1.75rem] border border-[#F6DF9C] bg-[#FFF8E1] p-6 text-left shadow-[0_12px_34px_rgba(245,158,11,0.08)] transition-transform active:scale-[0.99]"
            aria-label="โหมดอาสาสมัคร"
          >
            <div className="flex items-start justify-between gap-4">
              <span aria-hidden="true" className="flex size-12 items-center justify-center rounded-2xl bg-[#F59E0B] text-white">
                <svg xmlns="http://www.w3.org/2000/svg" width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h4l2 5-2.5 1.5a16 16 0 0 0 6 6L15 14l5 2v4c0 1.1-.9 2-2 2C10.3 22 2 13.7 2 6c0-1.1.9-2 2-2Z" /></svg>
              </span>
              <span aria-hidden="true" className="text-xl font-bold text-[#B45309]">→</span>
            </div>
            <span className="mt-5">
              <span className="block text-2xl font-bold tracking-[-0.03em] text-[#0F172A]">โหมดอาสาสมัคร</span>
              <span className="mt-1 block text-sm leading-5 text-[#64748B]">รับสายเพื่อช่วยผู้ใช้งานจากระยะไกล</span>
            </span>
          </Link>
        </nav>
      </div>
    </main>
  );
}

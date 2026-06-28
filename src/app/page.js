'use client';

import { useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import HapticFeedback from '@/components/HapticFeedback';

export default function Home() {
  const router = useRouter();
  const hapticRef = useRef(null);

  const handleStart = async () => {
    await hapticRef.current?.trigger(5, 100);
    router.push('/blind');
  };

  const handleCall = async () => {
    await hapticRef.current?.trigger(3, 100);
    router.push('/call');
  };

  return (
    <main className="flex flex-col items-center justify-center min-h-screen bg-slate-900 text-white p-8 overflow-hidden">
      <HapticFeedback ref={hapticRef} />

      <h1 className="sr-only">Nyeta — ผู้ช่วย AI สำหรับผู้พิการทางสายตา</h1>

      <div className="flex flex-col items-center text-center max-w-lg">
        <div className="w-24 h-24 rounded-full bg-sky-500/20 border-2 border-sky-500/40 flex items-center justify-center mb-8">
          <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-sky-400">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </div>

        <h2 className="text-4xl md:text-5xl font-black uppercase tracking-wide mb-4">
          Nyeta
        </h2>
        <p className="text-lg text-slate-400 mb-10 leading-relaxed">
          ผู้ช่วย AI บรรยายภาพ และโทรหาอาสาสมัครด้วยเสียง
        </p>

        <div className="w-full max-w-sm flex flex-col gap-4">
          <button
            onClick={handleStart}
            className="w-full px-8 py-5 rounded-full text-xl font-bold bg-sky-500 hover:bg-sky-400 active:scale-95 transition-all shadow-xl focus:outline-none focus:ring-4 focus:ring-sky-300"
            aria-label="เริ่มใช้งานผู้ช่วย AI"
          >
            ผู้ช่วย AI
          </button>

          <button
            onClick={handleCall}
            className="w-full px-8 py-5 rounded-full text-xl font-bold bg-emerald-500 hover:bg-emerald-400 active:scale-95 transition-all shadow-xl focus:outline-none focus:ring-4 focus:ring-emerald-300"
            aria-label="โทรหาอาสาสมัครเพื่อขอความช่วยเหลือ"
          >
            โทรหาอาสาสมัคร
          </button>
        </div>
      </div>

      <footer className="absolute bottom-4 inset-x-0 flex flex-col items-center gap-1 text-slate-500 text-sm font-medium">
        <Link href="/volunteer" className="pointer-events-auto underline hover:text-slate-300">
          เป็นอาสาสมัคร
        </Link>
        <span className="pointer-events-none">Nyeta</span>
      </footer>
    </main>
  );
}

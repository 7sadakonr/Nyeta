'use client';

import { useRef } from 'react';
import { useRouter } from 'next/navigation';
import HapticFeedback from '@/components/HapticFeedback';

export default function Home() {
  const router = useRouter();
  const hapticRef = useRef(null);

  // Handler สำหรับปุ่ม Blind - สั่น 3 ครั้ง
  const handleBlindClick = async () => {
    // กระตุ้นการสั่น 3 ครั้ง
    await hapticRef.current?.trigger(5, 100);
    // Navigate ไปหน้า Blind
    router.push('/blind');
  };

  // Handler สำหรับปุ่ม Volunteer - สั่น 1 ครั้ง
  const handleVolunteerClick = async () => {
    // กระตุ้นการสั่น 1 ครั้ง
    await hapticRef.current?.trigger(1);
    // Navigate ไปหน้า Volunteer
    router.push('/volunteer');
  };

  return (
    <main className="flex flex-col items-center justify-center min-h-screen bg-slate-900 text-white p-0 overflow-hidden">
      {/* Hidden Haptic Feedback Component */}
      <HapticFeedback ref={hapticRef} />

      {/* Hidden Heading for Screen Readers */}
      <h1 className="sr-only">Blind Assistance Application</h1>

      <div className="flex flex-col md:flex-row w-full h-screen">
        {/* Blind User Button */}
        <button
          onClick={handleBlindClick}
          className="flex-1 group relative overflow-hidden bg-yellow-400 p-8 transition-all hover:bg-yellow-500 text-center flex flex-col items-center justify-center cursor-pointer focus:outline-none focus:ring-8 focus:ring-inset focus:ring-black/20"
          aria-label="I am blind. I need help."
        >
          <div className="absolute inset-0 bg-black/5 group-hover:bg-transparent transition-colors" />
          <h2 className="text-5xl md:text-6xl font-black text-slate-900 uppercase tracking-wide" aria-hidden="true">
            I Need Help
          </h2>
          <p className="mt-4 text-slate-900 font-bold text-xl md:text-2xl" aria-hidden="true">
            Connect with a sighted volunteer
          </p>
        </button>

        {/* Volunteer Button */}
        <button
          onClick={handleVolunteerClick}
          className="flex-1 group relative overflow-hidden bg-blue-600 p-8 transition-all hover:bg-blue-700 text-center flex flex-col items-center justify-center cursor-pointer focus:outline-none focus:ring-8 focus:ring-inset focus:ring-white/20"
          aria-label="I am a volunteer. I want to help."
        >
          <h2 className="text-5xl md:text-6xl font-black text-white uppercase tracking-wide" aria-hidden="true">
            Volunteer
          </h2>
          <p className="mt-4 text-blue-100 font-bold text-xl md:text-2xl" aria-hidden="true">
            Help someone see
          </p>
        </button>
      </div>

      <footer className="absolute bottom-4 left-0 right-0 text-center text-slate-900/40 md:text-slate-500/60 text-sm font-medium pointer-events-none mix-blend-multiply md:mix-blend-normal">
        Nyeta
      </footer>
    </main>
  );
}

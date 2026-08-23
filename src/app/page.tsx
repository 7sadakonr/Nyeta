import Link from 'next/link';

export default function Home() {
  return (
    <main className="nyeta-surface min-h-dvh bg-[#A8FF00] text-white">
      <nav className="grid min-h-dvh grid-rows-[45fr_55fr]" aria-label="เลือกบทบาทการใช้งาน">
        <section className="flex min-h-0 flex-col bg-[linear-gradient(180deg,#075697_0%,#0988F8_42%,#0988F8_100%)]">
          <h1 className="pt-[max(1rem,env(safe-area-inset-top))] text-center text-2xl font-bold tracking-[-0.05em]">Nyeta</h1>
          <Link
            href="/blind/select"
            className="group flex min-h-0 flex-1 items-center justify-center px-6 text-center focus-visible:outline-white"
            aria-label="Blind, เลือกโหมดสำหรับผู้พิการทางสายตา"
          >
            <span className="font-mono text-[clamp(3.25rem,12vw,7rem)] font-bold leading-none tracking-[-0.06em] transition-transform duration-150 group-hover:scale-105 group-active:scale-95">
              Blind
            </span>
          </Link>
        </section>

        <Link
          href="/volunteer"
          className="group flex min-h-0 items-center justify-center bg-[#A8FF00] px-6 text-center text-black focus-visible:outline-black"
          aria-label="Volunteer, เข้าสู่แดชบอร์ดอาสาสมัคร"
        >
          <span className="font-mono text-[clamp(3.25rem,12vw,7rem)] font-bold leading-none tracking-[-0.06em] transition-transform duration-150 group-hover:scale-105 group-active:scale-95">
            Volunteer
          </span>
        </Link>
      </nav>
    </main>
  );
}

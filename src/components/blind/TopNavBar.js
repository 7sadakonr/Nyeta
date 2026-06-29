import Link from 'next/link';

export default function TopNavBar({ aiReady, aiStatus, mode, currencyScanning, currencyMonitoring, statusLabel }) {
    return (
        <div className="absolute top-0 inset-x-0 z-50 p-4 flex justify-between items-center pointer-events-none">
            {/* Back Button */}
            <Link href="/" className="pointer-events-auto flex items-center gap-2 bg-black/60 hover:bg-black/80 text-white px-5 py-3 rounded-full backdrop-blur-md transition-all border border-white/20 shadow-lg" aria-label="กลับหน้าหลัก">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
            </Link>

            {/* Status Indicator */}
            <div className="pointer-events-none" aria-hidden="true">
                <span className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold backdrop-blur-md shadow-lg border transition-colors ${!aiReady ? 'bg-zinc-800/80 text-zinc-400 border-zinc-700' :
                    aiStatus === 'thinking' || (mode === 'currency' && (currencyScanning || currencyMonitoring)) ? 'bg-amber-500/90 text-black border-amber-400 animate-pulse' :
                        'bg-emerald-500/90 text-black border-emerald-400'
                    }`}>
                    <span className={`w-2 h-2 rounded-full ${!aiReady ? 'bg-zinc-500' :
                        aiStatus === 'thinking' || (mode === 'currency' && (currencyScanning || currencyMonitoring)) ? 'bg-black animate-ping' :
                            'bg-black'
                        }`}></span>
                    {statusLabel}
                </span>
            </div>
        </div>
    );
}

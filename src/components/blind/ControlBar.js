export default function ControlBar({
    mode,
    aiReady,
    aiStatus,
    isListening,
    docText,
    isReading,
    currencyResult,
    currencyScanning,
    currencyMonitoring,
    readerAligned,
    onClearChat,
    onCapture,
    onStartListening,
    onStopListening,
    onReplayCurrency,
    onReadDocument,
    onReplayDocument,
    onStopReading
}) {
    return (
        <div className="bg-black border-t-2 border-zinc-800 px-6 py-5 pb-10" role="group" aria-label="ปุ่มควบคุม">
            {mode === 'assistant' && (
                <div className="flex items-center justify-center gap-6">
                    <button
                        type="button"
                        onClick={onClearChat}
                        className="w-14 h-14 rounded-full bg-zinc-900 text-zinc-500 border border-zinc-800 active:bg-zinc-700 focus:ring-2 focus:ring-white focus:outline-none flex items-center justify-center"
                        aria-label="ล้างแชทเก่า"
                    >
                        <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /></svg>
                    </button>

                    <button
                        type="button"
                        disabled={!aiReady || aiStatus === 'thinking' || isListening}
                        onClick={onCapture}
                        className={`
                            relative w-[88px] h-[88px] rounded-full flex items-center justify-center transition-all duration-200
                            shadow-[0_0_25px_rgba(56,189,248,0.3)] border-4
                            focus:ring-4 focus:ring-sky-300 focus:outline-none
                            ${(!aiReady || aiStatus === 'thinking')
                                ? 'bg-zinc-800 opacity-50 cursor-not-allowed border-zinc-700'
                                : 'bg-sky-500 hover:bg-sky-400 active:scale-90 active:bg-sky-600 border-sky-300'}
                        `}
                        aria-label={aiStatus === 'thinking' ? "AI กำลังคิด รอสักครู่" : "ถ่ายภาพเพื่อให้ AI บรรยาย"}
                        aria-busy={aiStatus === 'thinking'}
                    >
                        {aiStatus === 'thinking' ? (
                            <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-white animate-spin"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
                        ) : (
                            <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" /><circle cx="12" cy="13" r="3" /></svg>
                        )}
                    </button>

                    <button
                        type="button"
                        onMouseDown={onStartListening}
                        onMouseUp={onStopListening}
                        onMouseLeave={onStopListening}
                        onTouchStart={onStartListening}
                        onTouchEnd={onStopListening}
                        className={`w-16 h-16 rounded-full border-2 flex items-center justify-center focus:ring-2 focus:ring-white focus:outline-none transition-all duration-150 ${isListening
                            ? 'bg-red-600 text-white border-red-400 scale-110 shadow-[0_0_20px_rgba(220,38,38,0.7)]'
                            : 'bg-zinc-900 text-zinc-400 border-zinc-700 active:bg-zinc-700'
                            }`}
                        aria-label="กดค้างเพื่อพูดคำถาม ปล่อยเพื่อส่ง"
                        aria-pressed={isListening}
                    >
                        {isListening ? (
                            <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-pulse"><line x1="1" y1="1" x2="23" y2="23"></line><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"></path><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>
                        ) : (
                            <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>
                        )}
                    </button>
                </div>
            )}

            {mode === 'currency' && (
                <div className="flex items-center justify-center gap-6">
                    <div className="flex-1 text-center" aria-live="polite">
                        <p className="text-amber-400 font-bold text-lg">
                            {currencyScanning || currencyMonitoring ? 'กำลังสแกนอัตโนมัติ...' : 'พร้อมสแกน'}
                        </p>
                        <p className="text-zinc-500 text-sm mt-1">
                            Groq AI บอกมูลค่าแบงค์และเหรียญ (ต้องมีเน็ต)
                        </p>
                    </div>
                    <button
                        type="button"
                        disabled={!currencyResult}
                        onClick={onReplayCurrency}
                        className={`w-16 h-16 rounded-full border-2 flex items-center justify-center focus:ring-2 focus:ring-white focus:outline-none transition-all ${currencyResult
                            ? 'bg-amber-500 text-black border-amber-300 active:scale-95'
                            : 'bg-zinc-900 text-zinc-600 border-zinc-800 cursor-not-allowed'
                            }`}
                        aria-label="พูดซ้ำมูลค่าล่าสุด"
                    >
                        <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M15.54 8.46a5 5 0 0 1 0 7.07" /></svg>
                    </button>
                </div>
            )}

            {mode === 'reader' && (
                <div className="flex items-center justify-center gap-4">
                    <button
                        type="button"
                        disabled={!docText || isReading}
                        onClick={onReplayDocument}
                        className={`w-14 h-14 rounded-full border-2 flex items-center justify-center focus:ring-2 focus:ring-white focus:outline-none ${docText && !isReading
                            ? 'bg-zinc-900 text-violet-400 border-violet-700 active:bg-zinc-700'
                            : 'bg-zinc-900 text-zinc-600 border-zinc-800 cursor-not-allowed'
                            }`}
                        aria-label="อ่านซ้ำเอกสาร"
                    >
                        <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M15.54 8.46a5 5 0 0 1 0 7.07" /></svg>
                    </button>

                    <button
                        type="button"
                        disabled={!aiReady || aiStatus === 'thinking'}
                        onClick={onReadDocument}
                        className={`
                            relative w-[88px] h-[88px] rounded-full flex items-center justify-center transition-all duration-200
                            shadow-[0_0_25px_rgba(139,92,246,0.3)] border-4
                            focus:ring-4 focus:ring-violet-300 focus:outline-none
                            ${(!aiReady || aiStatus === 'thinking')
                                ? 'bg-zinc-800 opacity-50 cursor-not-allowed border-zinc-700'
                                : 'bg-violet-500 hover:bg-violet-400 active:scale-90 active:bg-violet-600 border-violet-300'}
                        `}
                        aria-label={
                            aiStatus === 'thinking'
                                ? 'กำลังอ่านเอกสาร รอสักครู่'
                                : readerAligned
                                    ? 'ตรงแล้ว พร้อมถ่ายหรือกดเพื่อถ่ายใหม่'
                                    : 'ถ่ายหน้าเอกสารเพื่ออ่านออกเสียง'
                        }
                        aria-busy={aiStatus === 'thinking'}
                    >
                        {aiStatus === 'thinking' ? (
                            <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-white animate-spin"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
                        ) : (
                            <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" /></svg>
                        )}
                    </button>

                    <button
                        type="button"
                        disabled={!isReading}
                        onClick={onStopReading}
                        className={`w-14 h-14 rounded-full border-2 flex items-center justify-center focus:ring-2 focus:ring-white focus:outline-none ${isReading
                            ? 'bg-red-600 text-white border-red-400 active:scale-95'
                            : 'bg-zinc-900 text-zinc-600 border-zinc-800 cursor-not-allowed'
                            }`}
                        aria-label="หยุดอ่านออกเสียง"
                    >
                        <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="6" width="12" height="12" rx="1" /></svg>
                    </button>
                </div>
            )}
        </div>
    );
}

export default function ModeSwitcher({ mode, switchMode }) {
    return (
        <div
            className="flex-shrink-0 px-3 py-2 bg-black border-b border-zinc-800 flex gap-2"
            role="tablist"
            aria-label="เลือกโหมดการใช้งาน"
        >
            {[
                { id: 'assistant', label: 'ผู้ช่วย AI' },
                { id: 'currency', label: 'ดูสกุลเงิน' },
                { id: 'reader', label: 'อ่านเอกสาร' },
            ].map((item) => (
                <button
                    key={item.id}
                    type="button"
                    role="tab"
                    aria-selected={mode === item.id}
                    aria-pressed={mode === item.id}
                    onClick={() => switchMode(item.id)}
                    className={`flex-1 py-3 px-2 rounded-xl text-sm font-bold border-2 transition-all focus:outline-none focus:ring-2 focus:ring-white ${mode === item.id
                        ? item.id === 'currency'
                            ? 'bg-amber-500 text-black border-amber-300'
                            : item.id === 'reader'
                                ? 'bg-violet-500 text-white border-violet-300'
                                : 'bg-sky-500 text-black border-sky-300'
                        : 'bg-zinc-900 text-zinc-400 border-zinc-700 active:bg-zinc-800'
                        }`}
                    aria-label={`โหมด${item.label}`}
                >
                    {item.label}
                </button>
            ))}
        </div>
    );
}

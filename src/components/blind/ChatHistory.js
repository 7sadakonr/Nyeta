export default function ChatHistory({ aiMessages }) {
    return (
        <section
            className="flex-1 overflow-y-auto p-4 space-y-4 bg-zinc-950 min-h-0"
            aria-label="ประวัติการสนทนา"
            tabIndex={0}
            ref={(el) => {
                if (el && aiMessages.length > 0) {
                    el.scrollTop = el.scrollHeight;
                }
            }}
        >
            <ul className="space-y-4">
                {aiMessages.map((msg, i) => (
                    <li key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                        {msg.role === 'user' && msg.image && (
                            <div className="bg-zinc-800 rounded-2xl rounded-br-sm p-1 max-w-[80%] border border-zinc-700">
                                <img
                                    src={msg.image}
                                    alt={`ภาพที่ถ่ายครั้งที่ ${Math.floor(i / 2) + 1}`}
                                    className="rounded-xl max-h-40 w-auto object-contain bg-black"
                                />
                                <p className="sr-only">คุณส่งภาพถ่าย</p>
                            </div>
                        )}
                        {msg.role === 'user' && !msg.image && (
                            <div className="bg-sky-900/50 rounded-2xl rounded-br-sm px-5 py-3 max-w-[85%] border border-sky-700/50">
                                <p className="text-base text-sky-100">{msg.content}</p>
                            </div>
                        )}
                        {msg.role === 'ai' && (
                            <div
                                className={`mt-2 rounded-2xl rounded-bl-sm p-5 max-w-[95%] shadow-lg ${msg.content.startsWith('Error') || msg.content.startsWith('ขอโทษ') || msg.content.startsWith('เกิดข้อผิดพลาด')
                                    ? 'bg-red-900/60 text-white border border-red-700/50'
                                    : 'bg-zinc-800 text-white border border-zinc-700'
                                    }`}
                            >
                                <p className="text-lg leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                                <p className="sr-only">จบคำตอบ</p>
                            </div>
                        )}
                    </li>
                ))}
            </ul>
        </section>
    );
}

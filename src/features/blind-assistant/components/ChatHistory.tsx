'use client';

'use client';

import { AssistantMessage } from '@/features/blind-assistant/types/assistant';

export interface ChatHistoryProps {
    aiMessages: AssistantMessage[];
}

function MessageContent({ message }: { message: AssistantMessage }) {
    const isError = message.content.startsWith('Error') || message.content.startsWith('ขอโทษ') || message.content.startsWith('เกิดข้อผิดพลาด');

    if (message.role === 'user' && message.image) {
        return <p className="text-[15px] font-medium text-[#8E8E93]">คุณส่งภาพเพื่อให้บรรยาย</p>;
    }

    return (
        <p className={`whitespace-pre-wrap text-[17px] leading-relaxed ${isError ? 'text-[#FF453A]' : 'text-[#EBEBF5]'}`}>
            {message.content}
        </p>
    );
}

export default function ChatHistory({ aiMessages }: ChatHistoryProps) {
    const latestMessage = aiMessages[aiMessages.length - 1];
    const previousMessages = aiMessages.slice(0, -1);

    if (!latestMessage) return null;

    return (
        <section className="space-y-4 px-4 pb-3 pt-4" aria-hidden="true">
            <div className="rounded-xl bg-[#1C1C1E] px-5 py-5">
                <div className="flex items-center gap-2">
                    <span className="size-2.5 rounded-full bg-[#0A84FF]" />
                    <h2 className="text-[15px] font-semibold text-[#0A84FF]">คำตอบล่าสุด</h2>
                </div>
                <div className="mt-3">
                    <MessageContent message={latestMessage} />
                </div>
            </div>

            {previousMessages.length > 0 && (
                <details className="rounded-xl bg-[#1C1C1E] px-5 py-4">
                    <summary tabIndex={-1} className="min-h-8 cursor-pointer text-[15px] font-semibold text-[#8E8E93]">ดูประวัติการสนทนา</summary>
                    <ul className="mt-4 space-y-3 border-t border-white/[0.15] pt-4" aria-label="ประวัติการสนทนา">
                        {previousMessages.map((message, index) => (
                            <li key={`${message.role}-${index}`} className="pb-3 last:pb-0">
                                <MessageContent message={message} />
                            </li>
                        ))}
                    </ul>
                </details>
            )}
        </section>
    );
}

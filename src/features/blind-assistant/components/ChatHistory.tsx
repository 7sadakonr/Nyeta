'use client';

import { AssistantMessage } from '@/features/blind-assistant/types/assistant';

export interface ChatHistoryProps {
    aiMessages: AssistantMessage[];
}

function MessageContent({ message }: { message: AssistantMessage }) {
    const isError = message.content.startsWith('Error') || message.content.startsWith('ขอโทษ') || message.content.startsWith('เกิดข้อผิดพลาด');

    if (message.role === 'user' && message.image) {
        return <p className="text-sm font-medium text-[#64748B]">คุณส่งภาพเพื่อให้บรรยาย</p>;
    }

    return (
        <p className={`whitespace-pre-wrap text-base leading-7 ${isError ? 'text-[#B91C1C]' : 'text-[#0F172A]'}`}>
            {message.content}
        </p>
    );
}

export default function ChatHistory({ aiMessages }: ChatHistoryProps) {
    const latestMessage = aiMessages[aiMessages.length - 1];
    const previousMessages = aiMessages.slice(0, -1);

    if (!latestMessage) return null;

    return (
        <section className="space-y-3 px-4 pb-3 pt-4" aria-hidden="true">
            <div className="rounded-3xl border border-[#DBE7F5] bg-white px-5 py-5 shadow-[0_10px_28px_rgba(37,99,235,0.07)]">
                <div className="flex items-center gap-2">
                    <span className="size-2.5 rounded-full bg-[#38BDF8]" />
                    <h2 className="text-base font-bold text-[#1D4ED8]">คำตอบล่าสุด</h2>
                </div>
                <div className="mt-3">
                    <MessageContent message={latestMessage} />
                </div>
            </div>

            {previousMessages.length > 0 && (
                <details className="rounded-3xl border border-[#E2E8F0] bg-white px-5 py-4 shadow-sm">
                    <summary tabIndex={-1} className="min-h-8 cursor-pointer text-sm font-bold text-[#475569]">ดูประวัติการสนทนา</summary>
                    <ul className="mt-4 space-y-3 border-t border-[#E2E8F0] pt-4" aria-label="ประวัติการสนทนา">
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

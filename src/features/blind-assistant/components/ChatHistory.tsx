'use client';

import { AssistantMessage } from '@/features/blind-assistant/types/assistant';

export interface ChatHistoryProps {
    aiMessages: AssistantMessage[];
}

function MessageContent({ message }: { message: AssistantMessage }) {
    const isError = message.content.startsWith('Error') || message.content.startsWith('ขอโทษ') || message.content.startsWith('เกิดข้อผิดพลาด');

    if (message.role === 'user' && message.image) {
        return <p className="text-sm text-[#A8B3C5]">คุณส่งภาพเพื่อให้บรรยาย</p>;
    }

    return (
        <p className={`whitespace-pre-wrap text-base leading-7 ${isError ? 'text-[#FFB2BA]' : 'text-[#F8FAFC]'}`}>
            {message.content}
        </p>
    );
}

export default function ChatHistory({ aiMessages }: ChatHistoryProps) {
    const latestMessage = aiMessages[aiMessages.length - 1];
    const previousMessages = aiMessages.slice(0, -1);

    if (!latestMessage) return null;

    return (
        <section className="space-y-4" aria-hidden="true">
            <div className="bg-[#0F1B2D] px-5 py-6">
                <h2 className="text-lg font-semibold text-[#6FE8FF]">คำตอบล่าสุด</h2>
                <div className="mt-3">
                    <MessageContent message={latestMessage} />
                </div>
            </div>

            {previousMessages.length > 0 && (
                <details className="bg-[#0F1B2D] px-5 py-4">
                    <summary tabIndex={-1} className="min-h-8 cursor-pointer text-sm font-semibold text-[#A8B3C5]">ดูประวัติการสนทนา</summary>
                    <ul className="mt-4 space-y-3 pt-1" aria-label="ประวัติการสนทนา">
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

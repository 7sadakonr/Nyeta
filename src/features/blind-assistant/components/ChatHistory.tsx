'use client';

import React from 'react';
import { AssistantMessage } from '@/features/blind-assistant/types/assistant';

export interface ChatHistoryProps {
    aiMessages: AssistantMessage[];
    resultRegionProps?: {
        onFocus: (event: React.FocusEvent<HTMLElement>) => void;
        onBlur: (event: React.FocusEvent<HTMLElement>) => void;
    };
    latestResultRef?: React.Ref<HTMLParagraphElement>;
}

function MessageContent({
    message,
    contentRef,
    blockId,
}: {
    message: AssistantMessage;
    contentRef?: React.Ref<HTMLParagraphElement>;
    blockId?: string;
}) {
    const isError = message.content.startsWith('Error') || message.content.startsWith('ขอโทษ') || message.content.startsWith('เกิดข้อผิดพลาด');

    if (message.role === 'user' && message.image) {
        return (
            <p
                id={blockId}
                tabIndex={-1}
                className="text-[15px] font-medium text-[#8E8E93] outline-none"
            >
                คุณส่งภาพเพื่อให้บรรยาย
            </p>
        );
    }

    return (
        <p
            ref={contentRef}
            id={blockId}
            tabIndex={-1}
            className={`whitespace-pre-wrap text-[17px] leading-relaxed outline-none ${isError ? 'text-[#FF453A]' : 'text-[#EBEBF5]'}`}
        >
            {message.content}
        </p>
    );
}

export default function ChatHistory({ aiMessages, resultRegionProps, latestResultRef }: ChatHistoryProps) {
    const latestMessage = aiMessages[aiMessages.length - 1];
    const previousMessages = aiMessages.slice(0, -1);

    if (!latestMessage) return null;

    const latestId = latestMessage.id || `msg-${aiMessages.length - 1}`;

    return (
        <section
            className="space-y-4 px-4 pb-3 pt-4"
            aria-label="คำบรรยาย"
            role="region"
            tabIndex={-1}
            {...resultRegionProps}
        >
            <div className="rounded-xl bg-[#1C1C1E] px-5 py-5">
                <div className="flex items-center gap-2">
                    <span className="size-2.5 rounded-full bg-[#0A84FF]" aria-hidden="true" />
                    <h2 className="text-[15px] font-semibold text-[#0A84FF]">คำบรรยาย</h2>
                </div>
                <div className="mt-3">
                    <MessageContent
                        message={latestMessage}
                        contentRef={latestResultRef}
                        blockId={`${latestId}-block-0`}
                    />
                </div>
            </div>

            {previousMessages.length > 0 && (
                <details className="rounded-xl bg-[#1C1C1E] px-5 py-4">
                    <summary tabIndex={-1} className="min-h-8 cursor-pointer text-[15px] font-semibold text-[#8E8E93]">ดูประวัติการสนทนา</summary>
                    <ul className="mt-4 space-y-3 border-t border-white/[0.15] pt-4" aria-label="ประวัติการสนทนา">
                        {previousMessages.map((message, index) => {
                            const prevId = message.id || `prev-${index}`;
                            return (
                                <li key={prevId} className="pb-3 last:pb-0">
                                    <MessageContent
                                        message={message}
                                        blockId={`${prevId}-block-0`}
                                    />
                                </li>
                            );
                        })}
                    </ul>
                </details>
            )}
        </section>
    );
}

'use client';

import React, { useState, useRef, useEffect, FormEvent } from 'react';

const QUICK_MESSAGES: string[] = [
    "ซ้ายหน่อย",
    "ขวาหน่อย",
    "ยกกล้องขึ้น",
    "เอากล้องลง",
    "เดินหน้า",
    "หยุดตรงนี้",
    "ถือนิ่งๆ นะ",
    "ดีมาก"
];

export interface ChatMessageItem {
    from: 'volunteer' | 'blind';
    text: string;
    timestamp?: number;
}

export type ChatMessage = ChatMessageItem;

export interface ChatPanelProps {
    isOpen: boolean;
    onClose: () => void;
    messages: ChatMessageItem[];
    onSendMessage: (text: string) => void;
    className?: string;
}

export default function ChatPanel({ isOpen, onClose, messages, onSendMessage, className }: ChatPanelProps) {
    const [inputText, setInputText] = useState<string>('');
    const messagesEndRef = useRef<HTMLDivElement | null>(null);

    const scrollToBottom = () => {
        if (typeof messagesEndRef.current?.scrollIntoView === 'function') {
            messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    };

    useEffect(() => {
        if (isOpen) {
            scrollToBottom();
        }
    }, [messages, isOpen]);

    const handleSubmit = (e?: FormEvent) => {
        e?.preventDefault();
        if (inputText.trim()) {
            onSendMessage(inputText.trim());
            setInputText('');
        }
    };

    const handleQuickMessage = (msg: string) => {
        onSendMessage(msg);
    };

    if (!isOpen) return null;

    return (
        <div
            className={`flex flex-col bg-vol-surface border border-vol-border shadow-2xl transition-transform ${
                className || 'fixed inset-0 z-50'
            }`}
        >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 bg-vol-surface border-b border-vol-border shrink-0">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-vol-accent/10 text-vol-accent border border-vol-accent/20">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                        </svg>
                    </span>
                    <span>แชทกับผู้ใช้งาน</span>
                </h3>
                <button 
                    onClick={onClose}
                    className="p-1.5 text-vol-text-muted hover:text-white hover:bg-white/10 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-vol-accent"
                    aria-label="ปิดแชท"
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#0a0a0a]">
                {messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center px-6 py-8 text-zinc-500 gap-2.5">
                        <div className="w-10 h-10 rounded-xl bg-white/[0.04] border border-white/10 flex items-center justify-center text-vol-accent">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                            </svg>
                        </div>
                        <p className="text-xs text-zinc-400 font-medium max-w-[240px] leading-relaxed">
                            ส่งข้อความหรือแตะเลือกคำแนะนำด่วนด้านล่างเพื่อช่วยแนะนำทิศทาง
                        </p>
                    </div>
                ) : (
                    messages.map((msg, idx) => (
                        <div 
                            key={idx} 
                            className={`flex ${msg.from === 'volunteer' ? 'justify-end' : 'justify-start'}`}
                        >
                            <div 
                                className={`max-w-[85%] rounded-2xl px-3.5 py-2 ${
                                    msg.from === 'volunteer' 
                                        ? 'bg-vol-accent text-black font-semibold rounded-tr-sm shadow-sm' 
                                        : 'bg-white/[0.08] text-white rounded-tl-sm border border-white/10'
                                }`}
                            >
                                <p className="text-sm leading-relaxed">{msg.text}</p>
                                <p className={`text-[10px] mt-1 text-right ${msg.from === 'volunteer' ? 'text-black/60 font-semibold' : 'text-zinc-400'}`}>
                                    {msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : ''}
                                </p>
                            </div>
                        </div>
                    ))
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Quick Messages */}
            <div className="p-2.5 bg-vol-surface border-t border-vol-border overflow-x-auto whitespace-nowrap hide-scrollbar shrink-0">
                <div className="flex gap-1.5 px-0.5">
                    {QUICK_MESSAGES.map((msg, idx) => (
                        <button
                            key={idx}
                            onClick={() => handleQuickMessage(msg)}
                            className="px-3 py-1.5 text-xs font-medium bg-white/[0.06] hover:bg-white/[0.12] active:scale-95 text-zinc-200 border border-white/10 rounded-full transition-colors whitespace-nowrap focus:outline-none focus:ring-1 focus:ring-vol-accent"
                        >
                            {msg}
                        </button>
                    ))}
                </div>
            </div>

            {/* Input Area */}
            <div className="p-3 bg-vol-surface border-t border-vol-border pb-[max(0.75rem,env(safe-area-inset-bottom))] shrink-0">
                <form onSubmit={handleSubmit} className="flex gap-2 items-center">
                    <input
                        type="text"
                        value={inputText}
                        onChange={(e) => setInputText(e.target.value)}
                        placeholder="พิมพ์ข้อความแนะนำ..."
                        className="flex-1 bg-black/60 text-white rounded-full px-4 py-2 text-sm border border-vol-border focus:outline-none focus:border-vol-accent focus:ring-1 focus:ring-vol-accent placeholder:text-zinc-500"
                    />
                    <button
                        type="submit"
                        disabled={!inputText.trim()}
                        className="p-2 bg-vol-accent hover:bg-vol-accent-hover active:scale-95 text-black rounded-full transition-all disabled:opacity-40 disabled:cursor-not-allowed shrink-0 focus:outline-none focus:ring-2 focus:ring-vol-accent"
                        aria-label="ส่งข้อความ"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                        </svg>
                    </button>
                </form>
            </div>
        </div>
    );
}

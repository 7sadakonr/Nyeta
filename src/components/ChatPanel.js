'use client';

import React, { useState, useRef, useEffect } from 'react';

const QUICK_MESSAGES = [
    "ซ้ายหน่อย",
    "ขวาหน่อย",
    "ยกกล้องขึ้น",
    "เอากล้องลง",
    "เดินหน้า",
    "หยุดตรงนี้",
    "ถือนิ่งๆ นะ",
    "ดีมาก"
];

export default function ChatPanel({ isOpen, onClose, messages, onSendMessage }) {
    const [inputText, setInputText] = useState('');
    const messagesEndRef = useRef(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        if (isOpen) {
            scrollToBottom();
        }
    }, [messages, isOpen]);

    const handleSubmit = (e) => {
        e?.preventDefault();
        if (inputText.trim()) {
            onSendMessage(inputText.trim());
            setInputText('');
        }
    };

    const handleQuickMessage = (msg) => {
        onSendMessage(msg);
    };

    if (!isOpen) return null;

    return (
        <div className="absolute inset-0 z-40 flex flex-col bg-gray-900 shadow-xl transition-transform transform translate-y-0">
            {/* Header */}
            <div className="flex items-center justify-between p-4 bg-gray-800 border-b border-gray-700">
                <h3 className="text-lg font-medium text-white flex items-center gap-2">
                    <svg className="w-5 h-5 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                    </svg>
                    แชทกับผู้ใช้งาน
                </h3>
                <button 
                    onClick={onClose}
                    className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-full transition-colors"
                    aria-label="ปิดแชท"
                >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-gray-500">
                        ยังไม่มีข้อความ
                    </div>
                ) : (
                    messages.map((msg, idx) => (
                        <div 
                            key={idx} 
                            className={`flex ${msg.from === 'volunteer' ? 'justify-end' : 'justify-start'}`}
                        >
                            <div 
                                className={`max-w-[80%] rounded-2xl px-4 py-2 ${
                                    msg.from === 'volunteer' 
                                        ? 'bg-sky-500 text-white rounded-tr-none' 
                                        : 'bg-gray-700 text-gray-100 rounded-tl-none'
                                }`}
                            >
                                <p className="text-[15px]">{msg.text}</p>
                                <p className="text-[10px] opacity-60 text-right mt-1">
                                    {new Date(msg.timestamp).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
                                </p>
                            </div>
                        </div>
                    ))
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Quick Messages */}
            <div className="p-2 bg-gray-800 border-t border-gray-700 overflow-x-auto whitespace-nowrap hide-scrollbar">
                <div className="flex gap-2 px-2">
                    {QUICK_MESSAGES.map((msg, idx) => (
                        <button
                            key={idx}
                            onClick={() => handleQuickMessage(msg)}
                            className="px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-full transition-colors whitespace-nowrap"
                        >
                            {msg}
                        </button>
                    ))}
                </div>
            </div>

            {/* Input Area */}
            <div className="p-4 bg-gray-800 border-t border-gray-700 pb-safe">
                <form onSubmit={handleSubmit} className="flex gap-2">
                    <input
                        type="text"
                        value={inputText}
                        onChange={(e) => setInputText(e.target.value)}
                        placeholder="พิมพ์ข้อความ..."
                        className="flex-1 bg-gray-700 text-white rounded-full px-4 py-2 focus:outline-none focus:ring-2 focus:ring-sky-500 border border-transparent"
                    />
                    <button
                        type="submit"
                        disabled={!inputText.trim()}
                        className="p-2 bg-sky-500 hover:bg-sky-400 text-white rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                        aria-label="ส่งข้อความ"
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                        </svg>
                    </button>
                </form>
            </div>
        </div>
    );
}

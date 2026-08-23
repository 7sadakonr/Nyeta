import { useState, useCallback, useRef, useEffect, RefObject } from 'react';
import speechManager, { Priority } from '@/shared/accessibility/speechManager';
import { SpeechCategory } from '@/shared/types/speech';
import { captureFrameFromVideo, extractGeminiText } from '@/features/blind-assistant/client/geminiVision';
import { AssistantMessage, AssistantStatus } from '@/features/blind-assistant/types/assistant';
import { EarconType } from '@/shared/accessibility/audio';

export interface UseAiAssistantResult {
    status: AssistantStatus;
    messages: AssistantMessage[];
    captureAndAsk: (customPrompt?: string | null) => Promise<void>;
    askTextOnly: (userText: string) => Promise<void>;
    clearMessages: () => void;
    stopSpeaking: () => void;
}

export function useAiAssistant(
    videoRef: RefObject<HTMLVideoElement | null>,
    isReady: boolean,
    feedback?: (type: EarconType) => void,
    addLog?: (msg: string) => void
): UseAiAssistantResult {
    const [status, setStatus] = useState<AssistantStatus>('idle');
    const [messages, setMessages] = useState<AssistantMessage[]>([]);

    const statusRef = useRef<AssistantStatus>(status);
    const abortControllerRef = useRef<AbortController | null>(null);

    useEffect(() => { statusRef.current = status; }, [status]);

    useEffect(() => {
        return () => {
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
        };
    }, []);

    const captureAndAsk = useCallback(async (customPrompt: string | null = null) => {
        if (statusRef.current === 'thinking') return;
        if (!isReady) {
            addLog?.('Warning: Camera not ready yet');
            speechManager?.speak('กล้องกำลังเริ่มทำงาน กรุณารอสักครู่แล้วกดใหม่ครับ', {
                priority: Priority.CRITICAL,
                category: SpeechCategory.CRITICAL,
                owner: 'ai-system',
                scope: 'blind:assistant',
            });
            feedback?.('error');
            return;
        }

        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        const controller = new AbortController();
        abortControllerRef.current = controller;
        const signal = controller.signal;

        let timedOut = false;
        const timeoutId = setTimeout(() => {
            timedOut = true;
            controller.abort();
        }, 35000);

        try {
            setStatus('capturing');
            feedback?.('capture');
            addLog?.('Capturing image...');

            if (!videoRef.current) {
                addLog?.('Error: No video stream');
                setStatus('idle');
                feedback?.('error');
                return;
            }

            const imageDataUrl = captureFrameFromVideo(videoRef.current, {
                maxDimension: 800,
                quality: 0.70,
            });

            if (!imageDataUrl) {
                addLog?.('Error: Camera frame not ready');
                setStatus('idle');
                feedback?.('error');
                speechManager?.speak('กล้องยังไม่พร้อม กรุณาลองใหม่อีกครั้ง', {
                    priority: Priority.CRITICAL,
                    category: SpeechCategory.CRITICAL,
                    owner: 'ai-system',
                    scope: 'blind:assistant',
                });
                return;
            }

            const base64Data = imageDataUrl.split(',')[1];
            const mimeType = imageDataUrl.split(';')[0].split(':')[1] || 'image/jpeg';

            const userQuestion = customPrompt && typeof customPrompt === 'string'
                ? `(พูด): "${customPrompt}"`
                : 'ช่วยบรรยายภาพนี้อย่างละเอียดให้เห็นภาพชัดเจน ทั้งภาพรวม รายละเอียดสิ่งของ ตำแหน่งทิศทาง สีสัน และสิ่งรอบข้าง';

            const newUserMessage: AssistantMessage = { role: 'user', content: userQuestion, image: imageDataUrl };
            setMessages(prev => [...prev, newUserMessage]);

            setStatus('thinking');
            addLog?.('Sending to Gemini...');

            const contents = [
                {
                    role: 'user',
                    parts: [
                        { text: userQuestion },
                        { inlineData: { mimeType, data: base64Data } },
                    ],
                },
            ];

            const response = await fetch('/api/gemini', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal,
                body: JSON.stringify({
                    mode: 'assistant',
                    contents,
                    maxTokens: 800,
                    temperature: 0.4,
                }),
            });

            if (!response.ok) {
                if (response.status === 429) {
                    const msg = 'ตอนนี้ AI ทำงานหนักเกินโควต้าฟรี กรุณารอสักครู่นะครับ';
                    setMessages(current => [...current, { role: 'ai', content: msg }]);
                    feedback?.('error');
                    setStatus('idle');
                    return;
                }
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            if (data.error) {
                const msg = `ขอโทษครับ เกิดข้อผิดพลาด: ${data.error.message}`;
                setMessages(current => [...current, { role: 'ai', content: msg }]);
                feedback?.('error');
            } else {
                const replyText = extractGeminiText(data);
                if (replyText) {
                    setMessages(current => [...current, { role: 'ai', content: replyText }]);
                    feedback?.('success');
                } else {
                    const msg = 'ขอโทษครับ AI ไม่ตอบกลับ ลองใหม่อีกทีนะครับ';
                    setMessages(current => [...current, { role: 'ai', content: msg }]);
                    feedback?.('error');
                }
            }
        } catch (error: any) {
            if (error.name === 'AbortError') {
                if (timedOut) {
                    const msg = 'การประมวลผลใช้เวลานานเกินไป กรุณาลองใหม่อีกครั้งครับ';
                    setMessages(current => [...current, { role: 'ai', content: msg }]);
                    feedback?.('error');
                }
                return;
            }
            console.error('Capture Error:', error);
            const msg = 'เกิดข้อผิดพลาดในการเชื่อมต่อครับ';
            setMessages(current => [...current, { role: 'ai', content: msg }]);
            feedback?.('error');
        } finally {
            clearTimeout(timeoutId);
            setStatus('idle');
        }
    }, [videoRef, isReady, feedback, addLog]);

    const askTextOnly = useCallback(async (userText: string) => {
        const question = userText.trim();
        if (!question) return;
        await captureAndAsk(question);
    }, [captureAndAsk]);

    const clearMessages = useCallback(() => {
        setMessages([]);
        speechManager?.clearPausedSpeech();
        speechManager?.cancel({ scope: 'blind:assistant' });
        feedback?.('button');
    }, [feedback]);

    const stopSpeaking = useCallback(() => {
        speechManager?.clearPausedSpeech();
        speechManager?.cancel({ scope: 'blind:assistant', categories: [SpeechCategory.TASK, SpeechCategory.REALTIME] });
        feedback?.('button');
    }, [feedback]);

    return { status, messages, captureAndAsk, askTextOnly, clearMessages, stopSpeaking };
}

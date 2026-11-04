import { useState, useCallback, useRef, useEffect, RefObject } from 'react';
import { speechController } from '@/shared/accessibility/speechController';
import { callGeminiVision, captureFrameFromVideo, describeGeminiError, isAbortError } from '@/features/blind-assistant/client/geminiVision';
import { AssistantMessage, AssistantStatus } from '@/features/blind-assistant/types/assistant';
import { EarconType } from '@/shared/accessibility/audio';

export interface UseAiAssistantResult {
    status: AssistantStatus;
    messages: AssistantMessage[];
    captureAndAsk: (customPrompt?: string | null) => Promise<boolean>;
    askTextOnly: (userText: string) => Promise<void>;
    clearMessages: () => void;
    stopSpeaking: () => void;
}

export function useAiAssistant(
    videoRef: RefObject<HTMLVideoElement | null>,
    isReady: boolean,
    feedback?: (type: EarconType) => void,
    addLog?: (msg: string) => void,
    audioReady = false,
    cameraContainerRef?: RefObject<HTMLElement | null>,
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

    const captureAndAsk = useCallback(async (customPrompt: string | null = null): Promise<boolean> => {
        if (!isReady) {
            addLog?.('Warning: Camera not ready yet');
            speechController.speak('กล้องยังไม่พร้อม กรุณารอ 2-3 วินาทีแล้วลองกดใหม่ครับ', { channel: 'critical' });
            feedback?.('error');
            return false;
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
        }, 55000);

        try {
            setStatus('capturing');
            feedback?.('capture');
            addLog?.('Capturing image...');

            if (!videoRef.current) {
                addLog?.('Error: No video stream');
                setStatus('idle');
                feedback?.('error');
                return false;
            }

            const captureOptions: { container?: HTMLElement | null; maxDimension: number; quality: number } = {
                maxDimension: 800,
                quality: 0.70,
            };
            if (cameraContainerRef?.current) {
                captureOptions.container = cameraContainerRef.current;
            }

            const imageDataUrl = captureFrameFromVideo(videoRef.current, captureOptions);

            if (!imageDataUrl) {
                addLog?.('Error: Camera frame not ready');
                setStatus('idle');
                feedback?.('error');
                speechController.speak('จับภาพไม่ได้ ลองถือโทรศัพท์ให้นิ่งแล้วกดใหม่ครับ', { channel: 'critical' });
                return false;
            }

            const base64Data = imageDataUrl.split(',')[1];
            const mimeType = imageDataUrl.split(';')[0].split(':')[1] || 'image/jpeg';

            const trimmedPrompt = typeof customPrompt === 'string' ? customPrompt.trim() : '';
            const userQuestion = trimmedPrompt
                ? `(พูด): "${trimmedPrompt}"`
                : 'ช่วยบรรยายภาพนี้อย่างละเอียดให้เห็นภาพชัดเจน ทั้งภาพรวม รายละเอียดสิ่งของ ตำแหน่งทิศทาง สีสัน และสิ่งรอบข้าง';

            const newUserMessage: AssistantMessage = {
                id: `user-${Date.now()}`,
                role: 'user',
                content: userQuestion,
                image: imageDataUrl,
            };
            setMessages([newUserMessage]);

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

            const replyText = await callGeminiVision({
                mode: 'assistant',
                contents,
                maxTokens: 800,
                temperature: 0.4,
                signal,
            });

            if (replyText) {
                setMessages(current => [...current, { id: `ai-${Date.now()}`, role: 'ai', content: replyText }]);
                feedback?.('success');
            } else {
                setMessages(current => [...current, { id: `ai-${Date.now()}`, role: 'ai', content: 'ไม่ได้รับคำตอบ กรุณาลองถ่ายภาพแล้วถามใหม่ครับ', isError: true }]);
                feedback?.('error');
            }
            return true;
        } catch (error: unknown) {
            if (isAbortError(error)) {
                if (timedOut) {
                    setMessages(current => [...current, { id: `ai-${Date.now()}`, role: 'ai', content: 'ใช้เวลานานเกินไป กรุณาลองใหม่ครับ', isError: true }]);
                    feedback?.('error');
                }
                return true;
            }
            console.error('Capture Error:', error);
            addLog?.(`AI request failed: ${error instanceof Error ? error.message : String(error)}`);
            setMessages(current => [...current, { id: `ai-${Date.now()}`, role: 'ai', content: describeGeminiError(error), isError: true }]);
            feedback?.('error');
            return true;
        } finally {
            clearTimeout(timeoutId);
            setStatus('idle');
        }
    }, [videoRef, isReady, feedback, addLog, cameraContainerRef]);

    const askTextOnly = useCallback(async (userText: string) => {
        const question = userText.trim();
        if (!question) return;
        await captureAndAsk(question);
    }, [captureAndAsk]);

    const clearMessages = useCallback(() => {
        setMessages([]);
        speechController.stop();
        feedback?.('button');
    }, [feedback]);

    const stopSpeaking = useCallback(() => {
        speechController.stop();
        feedback?.('button');
    }, [feedback]);

    return { status, messages, captureAndAsk, askTextOnly, clearMessages, stopSpeaking };
}

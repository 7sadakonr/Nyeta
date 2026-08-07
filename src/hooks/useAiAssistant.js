import { useState, useCallback, useRef, useEffect } from 'react';
import speechManager, { Priority } from '@/lib/speechManager';
import { captureFrameFromVideo, extractGeminiText } from '@/lib/geminiVision';

export function useAiAssistant(videoRef, isReady, feedback, addLog) {
    const [status, setStatus] = useState('idle');
    const [messages, setMessages] = useState([]);

    const messagesRef = useRef(messages);
    const statusRef = useRef(status);
    const abortControllerRef = useRef(null);

    useEffect(() => { messagesRef.current = messages; }, [messages]);
    useEffect(() => { statusRef.current = status; }, [status]);

    useEffect(() => {
        return () => {
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
        };
    }, []);

    const formatMessagesForApi = (history) => {
        return history.slice(-6).map(msg => {
            const role = msg.role === 'ai' ? 'model' : 'user';
            if (msg.image) {
                const base64Data = msg.image.split(',')[1];
                const mimeType = msg.image.split(';')[0].split(':')[1] || 'image/jpeg';
                return {
                    role: role,
                    parts: [
                        { text: msg.content || '' },
                        { inlineData: { mimeType: mimeType, data: base64Data } },
                    ],
                };
            } else {
                return { role: role, parts: [{ text: msg.content }] };
            }
        });
    };

    const captureAndAsk = useCallback(async (customPrompt = null) => {
        if (statusRef.current === 'thinking') return;
        if (!isReady) {
            addLog?.('Warning: Camera not ready yet');
            speechManager?.speak('กล้องกำลังเริ่มทำงาน กรุณารอสักครู่แล้วกดใหม่ครับ', {
                priority: Priority.HIGH,
                owner: 'ai-system',
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
                    priority: Priority.HIGH,
                    owner: 'ai-system',
                });
                return;
            }

            const base64Data = imageDataUrl.split(',')[1];
            const mimeType = imageDataUrl.split(';')[0].split(':')[1] || 'image/jpeg';

            const userQuestion = customPrompt && typeof customPrompt === 'string'
                ? `(พูด): "${customPrompt}"`
                : 'ช่วยบรรยายภาพนี้อย่างละเอียดให้เห็นภาพชัดเจน ทั้งภาพรวม รายละเอียดสิ่งของ ตำแหน่งทิศทาง สีสัน และสิ่งรอบข้าง';

            const newUserMessage = { role: 'user', content: userQuestion, image: imageDataUrl };
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
        } catch (error) {
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

    const askTextOnly = useCallback(async (userText) => {
        if (!isReady || statusRef.current === 'thinking') return;
        if (!userText || userText.trim().length === 0) return;

        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        const controller = new AbortController();
        abortControllerRef.current = controller;
        const signal = controller.signal;
        const newUserMessage = { role: 'user', content: `🎤 ${userText}` };

        setMessages(prev => [...prev, newUserMessage]);

        let timedOut = false;
        const timeoutId = setTimeout(() => {
            timedOut = true;
            controller.abort();
        }, 35000);

        try {
            setStatus('thinking');
            feedback?.('capture');
            addLog?.(`Text Chat: "${userText}"`);

            const apiMessages = formatMessagesForApi([...messagesRef.current, newUserMessage]);

            const response = await fetch('/api/gemini', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal,
                body: JSON.stringify({
                    mode: 'assistant',
                    contents: apiMessages,
                    maxTokens: 800,
                    temperature: 0.5,
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
                    const msg = 'ขอโทษครับ ไม่ได้รับคำตอบ ลองใหม่อีกทีนะครับ';
                    setMessages(current => [...current, { role: 'ai', content: msg }]);
                    feedback?.('error');
                }
            }
        } catch (error) {
            if (error.name === 'AbortError') {
                if (timedOut) {
                    const msg = 'การประมวลผลใช้เวลานานเกินไป กรุณาลองใหม่อีกครั้งครับ';
                    setMessages(current => [...current, { role: 'ai', content: msg }]);
                    feedback?.('error');
                }
                return;
            }
            console.error('Text Chat Error:', error);
            const msg = 'เกิดข้อผิดพลาดในการเชื่อมต่อครับ';
            setMessages(current => [...current, { role: 'ai', content: msg }]);
            feedback?.('error');
        } finally {
            clearTimeout(timeoutId);
            setStatus('idle');
        }
    }, [isReady, feedback, addLog]);

    const clearMessages = useCallback(() => {
        setMessages([]);
        speechManager?.stopAll();
        feedback?.('button');
    }, [feedback]);

    const stopSpeaking = useCallback(() => {
        speechManager?.stopAll();
        feedback?.('button');
    }, [feedback]);

    return { status, messages, captureAndAsk, askTextOnly, clearMessages, stopSpeaking };
}

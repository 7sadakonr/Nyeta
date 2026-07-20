import { useState, useCallback, useRef, useEffect } from 'react';
import speechManager, { Priority } from '@/lib/speechManager';

const ASSISTANT_PROMPT = `
บรรยายภาพนี้เพื่อช่วยเหลือผู้พิการทางสายตาอย่างละเอียดและรอบคอบ

ลำดับความสำคัญในการทำงาน:
1. แจ้งเตือนอุปสรรค: ถ้านิ้วบังเลนส์ หรือภาพมืด/เบลอ ให้บอกวิธีแก้ทันที
2. การอ่านข้อความ: อ่านข้อความที่เห็นให้ถูกต้องครบถ้วน ถ้าเป็นฉลากยา/สินค้าให้อ่านชื่อและวิธีใช้
3. สภาพแวดล้อม: แจ้งเตือนสิ่งกีดขวางหรืออันตราย บอกตำแหน่งและระยะห่างของสิ่งของให้ชัดเจน

กฎการตอบ (สำคัญมาก):
- ห้ามใช้สัญลักษณ์พิเศษทุกชนิด เช่น ดอกจัน (*), ชาร์ป (#), ขีด (-), หรือสัญลักษณ์ Markdown อื่นๆ เด็ดขาด เพราะระบบอ่านออกเสียง (Web Speech/VoiceOver) จะอ่านสัญลักษณ์เหล่านั้นทำให้ผู้ใช้สับสน
- ห้ามใช้อักษรย่อ ให้เขียนคำเต็มเสมอ
- ให้เขียนเป็นข้อความร้อยแก้วธรรมดาที่อ่านออกเสียงได้ไหลลื่น เป็นธรรมชาติ
- ตอบเป็นภาษาไทยด้วยน้ำเสียงสุภาพและเป็นกันเอง
`.trim();

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
                        { text: msg.content || "" },
                        { inlineData: { mimeType: mimeType, data: base64Data } }
                    ]
                };
            } else {
                return { role: role, parts: [{ text: msg.content }] };
            }
        });
    };

    const captureAndAsk = useCallback(async (customPrompt = null) => {
        if (!isReady || statusRef.current === 'thinking') return;
        const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
        if (!apiKey) {
            addLog?.('Error: API Key missing!');
            speechManager?.speak('ไม่พบ API Key', {
                priority: Priority.CRITICAL,
                owner: 'ai-assistant',
            });
            feedback?.('error');
            return;
        }

        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        abortControllerRef.current = new AbortController();
        const signal = abortControllerRef.current.signal;

        try {
            setStatus('capturing');
            feedback?.('capture');
            addLog?.('Capturing image...');

            if (!videoRef.current) {
                addLog?.('Error: No video stream');
                setStatus('idle');
                return;
            }

            const canvas = document.createElement('canvas');
            const video = videoRef.current;
            canvas.width = video.videoWidth || 1280;
            canvas.height = video.videoHeight || 720;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const imageBase64 = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
            const imageDataUrl = `data:image/jpeg;base64,${imageBase64}`;

            const userQuestion = customPrompt && typeof customPrompt === 'string'
                ? `(พูด): "${customPrompt}"`
                : 'ช่วยบรรยายภาพนี้ให้หน่อย';

            const newUserMessage = { role: 'user', content: userQuestion, image: imageDataUrl };
            setMessages(prev => [...prev, newUserMessage]);

            setStatus('thinking');
            addLog?.('Sending to Gemini...');

            const apiMessages = formatMessagesForApi([...messagesRef.current, newUserMessage]);

            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal,
                body: JSON.stringify({
                    systemInstruction: { parts: [{ text: ASSISTANT_PROMPT }] },
                    contents: apiMessages,
                    generationConfig: { maxOutputTokens: 500, temperature: 0.5 }
                })
            });

            if (!response.ok) {
                if (response.status === 429) {
                    setMessages(current => [...current, { role: 'ai', content: 'ตอนนี้ AI ทำงานหนักเกินโควต้าฟรี (15 ครั้ง/นาที) รบกวนรอสักครู่นะครับ' }]);
                    feedback?.('error');
                    setStatus('idle');
                    return;
                }
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            if (data.error) {
                setMessages(current => [...current, { role: 'ai', content: `ขอโทษครับ เกิดข้อผิดพลาด: ${data.error.message}` }]);
                feedback?.('error');
            } else if (data.candidates && data.candidates[0]?.content?.parts?.[0]?.text) {
                setMessages(current => [...current, { role: 'ai', content: data.candidates[0].content.parts[0].text }]);
                feedback?.('success');
            } else {
                setMessages(current => [...current, { role: 'ai', content: 'ขอโทษครับ AI ไม่ตอบกลับ ลองใหม่อีกทีนะครับ' }]);
                feedback?.('error');
            }
        } catch (error) {
            if (error.name === 'AbortError') return;
            console.error('Capture Error:', error);
            setMessages(current => [...current, { role: 'ai', content: 'เกิดข้อผิดพลาดในการเชื่อมต่อครับ' }]);
            feedback?.('error');
        } finally {
            setStatus('idle');
        }
    }, [isReady, feedback, addLog]);

    const askTextOnly = useCallback(async (userText) => {
        if (!isReady || statusRef.current === 'thinking') return;
        if (!userText || userText.trim().length === 0) return;
        
        const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;

        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        abortControllerRef.current = new AbortController();
        const signal = abortControllerRef.current.signal;
        const newUserMessage = { role: 'user', content: `🎤 ${userText}` };
        
        setMessages(prev => [...prev, newUserMessage]);
        
        try {
            setStatus('thinking');
            feedback?.('capture');
            addLog?.(`Text Chat: "${userText}"`);
            
            const apiMessages = formatMessagesForApi([...messagesRef.current, newUserMessage]);
            
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal,
                body: JSON.stringify({
                    systemInstruction: { parts: [{ text: ASSISTANT_PROMPT }] },
                    contents: apiMessages,
                    generationConfig: { maxOutputTokens: 500, temperature: 0.7 }
                })
            });
            
            if (!response.ok) {
                if (response.status === 429) {
                    setMessages(current => [...current, { role: 'ai', content: 'ตอนนี้ AI ทำงานหนักเกินโควต้าฟรี (15 ครั้ง/นาที) รบกวนรอสักครู่นะครับ' }]);
                    feedback?.('error');
                    setStatus('idle');
                    return;
                }
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            if (data.error) {
                setMessages(current => [...current, { role: 'ai', content: `ขอโทษครับ: ${data.error.message}` }]);
                feedback?.('error');
            } else if (data.candidates && data.candidates[0]?.content?.parts?.[0]?.text) {
                setMessages(current => [...current, { role: 'ai', content: data.candidates[0].content.parts[0].text }]);
                feedback?.('success');
            } else {
                setMessages(current => [...current, { role: 'ai', content: 'ขอโทษครับ ไม่ได้รับคำตอบ' }]);
                feedback?.('error');
            }
        } catch (error) {
            if (error.name === 'AbortError') return;
            console.error('Text Chat Error:', error);
            setMessages(current => [...current, { role: 'ai', content: 'เกิดข้อผิดพลาดในการเชื่อมต่อครับ' }]);
            feedback?.('error');
        } finally {
            setStatus('idle');
        }
    }, [isReady, feedback, addLog]);

    const clearMessages = useCallback(() => setMessages([]), []);

    return { status, messages, captureAndAsk, askTextOnly, clearMessages };
}

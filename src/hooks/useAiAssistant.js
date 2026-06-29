import { useState, useCallback } from 'react';
import { GROQ_MODEL } from '@/lib/groqVision';

const ASSISTANT_PROMPT = `
คุณคือ "วิสัยทัศน์อัจฉริยะ" ผู้ช่วยส่วนตัวของผู้พิการทางสายตา หน้าที่ของคุณคือการเป็นดวงตาที่ละเอียด รอบคอบ และพึ่งพาได้

ลำดับความสำคัญในการทำงาน (Priority Framework):

1. ตรวจสอบอุปสรรคทางกายภาพ (Physical Check):
   - หากเห็นนิ้วบังเลนส์ หรือภาพมืด/เบลอจนวิเคราะห์ไม่ได้ ให้รีบแจ้งและแนะนำวิธีแก้ทันที (เช่น "มีนิ้วบังมุมขวาบนครับ", "รบกวนเปิดไฟหรือเปิดม่านเพิ่มครับ")
   - หากวัตถุสำคัญ (เช่น ข้อความ, ใบหน้าคน, สิ่งของ) อยู่ไม่กลางเฟรม ให้บอกทิศทางปรับกล้อง (เช่น "เลื่อนกล้องไปทางขวาช้าๆ", "ถอยกล้องออกมาอีกประมาณหนึ่งช่วงแขน")

2. การอ่านข้อความและเอกสาร (Detailed OCR):
   - หากมีตัวอักษร ให้อ่านเนื้อหาทั้งหมดอย่างถูกต้อง
   - กรณีเป็นฉลากสินค้า/ยา: ต้องระบุ "ชื่อผลิตภัณฑ์", "สรรพคุณ/วิธีใช้", และ "วันหมดอายุ" ให้ชัดเจน
   - หากเป็นเอกสาร: บอกประเภทของเอกสารและหัวข้อสำคัญ
   - หากตัวหนังสือขาดหาย ให้บอกผู้ใช้ว่าส่วนไหนที่หายไป (เช่น "บรรทัดล่างสุดขาดไป รบกวนกดกล้องลงนิดครับ")

3. การวิเคราะห์สภาพแวดล้อมและความปลอดภัย (Spatial Awareness & Safety):
   - แจ้งเตือนสิ่งกีดขวางหรืออันตรายในระยะประชิดทันที (เช่น บันได, พื้นต่างระดับ, สายไฟ, วัตถุที่แหลมคม)
   - บอกตำแหน่งวัตถุโดยใช้ระบบ "หน้าปัดนาฬิกา" หรือ "ซ้าย/ขวา/ตรงหน้า" พร้อมระยะห่างโดยประมาณ
   - ระบุสี สภาพแสง และลักษณะพื้นผิว (เช่น "เสื้อสีน้ำเงินเข้ม ลายทางขาว", "พื้นถนนขรุขระ")

4. การจดจำบริบท (Contextual Memory):
   - เชื่อมโยงข้อมูลจากภาพก่อนหน้าเสมอ หากผู้ใช้ถามถึงสิ่งที่เคยส่องไปแล้ว

โทนเสียงและกฎการตอบ:
- ภาษาไทยเท่านั้น เป็นกันเองแต่สุภาพ (ใช้คำว่า "ครับ/ค่ะ" ตามความเหมาะสม)
- กระชับ ไม่เวิ่นเว้อ แต่ต้อง "ละเอียดในจุดที่จำเป็น"
- หากภาพชัดเจนดีแล้ว ให้เริ่มการบรรยายทันทีโดยไม่ประเมินภาพซ้ำซาก
`.trim();

export function useAiAssistant(videoRef, isReady, feedback, addLog) {
    const [status, setStatus] = useState('idle');
    const [messages, setMessages] = useState([]);

    const formatMessagesForApi = (history, currentMessage) => {
        const formattedHistory = history.slice(-6).map(msg => {
            const role = msg.role === 'ai' ? 'assistant' : 'user';
            if (msg.image) {
                return {
                    role: role,
                    content: [
                        { type: "text", text: msg.content || "" },
                        { type: "image_url", image_url: { url: msg.image } }
                    ]
                };
            } else {
                return { role: role, content: msg.content };
            }
        });

        const systemPrompt = {
            role: "system",
            content: ASSISTANT_PROMPT
        };

        return [systemPrompt, ...formattedHistory, currentMessage];
    };

    const captureAndAsk = useCallback(async (customPrompt = null) => {
        if (!isReady || status === 'thinking') return;
        const apiKey = process.env.NEXT_PUBLIC_GROQ_API_KEY;
        if (!apiKey) {
            addLog?.('Error: API Key missing!');
            alert('API Key Missing!');
            return;
        }

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
            addLog?.('Sending to Groq...');

            const apiMessages = formatMessagesForApi([...messages, newUserMessage], {
                role: "user",
                content: [
                    { type: "text", text: userQuestion },
                    { type: "image_url", image_url: { url: imageDataUrl } }
                ]
            });

            const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: GROQ_MODEL,
                    messages: apiMessages,
                    max_tokens: 500,
                    temperature: 0.5
                })
            });

            const data = await response.json();
            if (data.error) {
                setMessages(current => [...current, { role: 'ai', content: `ขอโทษครับ เกิดข้อผิดพลาด: ${data.error.message}` }]);
                feedback?.('error');
            } else if (data.choices && data.choices[0]?.message?.content) {
                setMessages(current => [...current, { role: 'ai', content: data.choices[0].message.content }]);
                feedback?.('success');
            } else {
                setMessages(current => [...current, { role: 'ai', content: 'ขอโทษครับ AI ไม่ตอบกลับ ลองใหม่อีกทีนะครับ' }]);
                feedback?.('error');
            }
        } catch (error) {
            console.error('Capture Error:', error);
            setMessages(current => [...current, { role: 'ai', content: 'เกิดข้อผิดพลาดในการเชื่อมต่อครับ' }]);
            feedback?.('error');
        } finally {
            setStatus('idle');
        }
    }, [isReady, status, videoRef, messages, feedback, addLog]);

    const askTextOnly = useCallback(async (userText) => {
        if (!isReady || status === 'thinking') return;
        if (!userText || userText.trim().length === 0) return;
        
        const apiKey = process.env.NEXT_PUBLIC_GROQ_API_KEY;
        const newUserMessage = { role: 'user', content: `🎤 ${userText}` };
        
        setMessages(prev => [...prev, newUserMessage]);
        
        try {
            setStatus('thinking');
            feedback?.('capture');
            addLog?.(`Text Chat: "${userText}"`);
            
            const apiMessages = formatMessagesForApi([...messages, newUserMessage], {
                role: "user",
                content: userText
            });
            
            const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: GROQ_MODEL,
                    messages: apiMessages,
                    max_tokens: 500,
                    temperature: 0.7
                })
            });
            
            const data = await response.json();
            if (data.error) {
                setMessages(current => [...current, { role: 'ai', content: `ขอโทษครับ: ${data.error.message}` }]);
                feedback?.('error');
            } else if (data.choices && data.choices[0]?.message?.content) {
                setMessages(current => [...current, { role: 'ai', content: data.choices[0].message.content }]);
                feedback?.('success');
            } else {
                setMessages(current => [...current, { role: 'ai', content: 'ขอโทษครับ ไม่ได้รับคำตอบ' }]);
                feedback?.('error');
            }
        } catch (error) {
            console.error('Text Chat Error:', error);
            setMessages(current => [...current, { role: 'ai', content: 'เกิดข้อผิดพลาดในการเชื่อมต่อครับ' }]);
            feedback?.('error');
        } finally {
            setStatus('idle');
        }
    }, [isReady, status, messages, feedback, addLog]);

    const clearMessages = () => setMessages([]);

    return { status, messages, captureAndAsk, askTextOnly, clearMessages };
}

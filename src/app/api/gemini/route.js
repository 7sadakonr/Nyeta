import { NextResponse } from 'next/server';

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';

export async function POST(request) {
    try {
        const apiKey = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY;
        if (!apiKey) {
            console.error('[API /api/gemini] Missing GEMINI_API_KEY in environment');
            return NextResponse.json(
                { error: { message: 'Gemini API Key missing on server' } },
                { status: 500 }
            );
        }

        const body = await request.json();
        const {
            systemPrompt,
            userPrompt,
            imageBase64,
            mimeType = 'image/jpeg',
            maxTokens = 800,
            temperature = 0.4,
            contents
        } = body;

        console.log(`[API /api/gemini] Received request for model ${GEMINI_MODEL}`);

        let payloadContents = contents;
        if (!payloadContents) {
            const parts = [];
            if (userPrompt) {
                parts.push({ text: userPrompt });
            } else {
                parts.push({ text: 'ช่วยบรรยายภาพนี้ให้หน่อย' });
            }

            if (imageBase64) {
                parts.push({
                    inlineData: {
                        mimeType: mimeType,
                        data: imageBase64
                    }
                });
            }

            payloadContents = [{ role: 'user', parts }];
        }

        const payload = {
            contents: payloadContents,
            generationConfig: {
                maxOutputTokens: maxTokens,
                temperature: temperature
            }
        };

        if (systemPrompt) {
            payload.systemInstruction = {
                parts: [{ text: systemPrompt }]
            };
        }

        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            }
        );

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            console.error(`[API /api/gemini] Upstream error HTTP ${response.status}:`, data);
            return NextResponse.json(data, { status: response.status });
        }

        console.log(`[API /api/gemini] Success HTTP ${response.status}`);
        return NextResponse.json(data, { status: 200 });
    } catch (error) {
        console.error('[API /api/gemini] Internal Error:', error);
        return NextResponse.json(
            { error: { message: error.message || 'Internal Server Error' } },
            { status: 500 }
        );
    }
}

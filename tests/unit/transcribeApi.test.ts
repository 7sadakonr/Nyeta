import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/transcribe/route';

describe('/api/transcribe route', () => {
    const originalFetch = global.fetch;

    beforeEach(() => {
        process.env.GEMINI_API_KEY = 'test-api-key';
    });

    afterEach(() => {
        global.fetch = originalFetch;
        vi.clearAllMocks();
    });

    it('returns 400 if audio file is missing in form data', async () => {
        const formData = new FormData();
        const request = new NextRequest('http://localhost:3000/api/transcribe', {
            method: 'POST',
            body: formData,
        });

        const response = await POST(request);
        expect(response.status).toBe(400);
        const data = await response.json();
        expect(data.error.message).toContain('Missing audio file');
    });

    it('returns 400 if audio MIME type is unsupported', async () => {
        const formData = new FormData();
        const invalidBlob = new Blob(['dummy content'], { type: 'text/plain' });
        formData.append('audio', invalidBlob, 'test.txt');

        const request = new NextRequest('http://localhost:3000/api/transcribe', {
            method: 'POST',
            body: formData,
        });

        const response = await POST(request);
        expect(response.status).toBe(400);
        const data = await response.json();
        expect(data.error.message).toContain('Unsupported audio type');
    });

    it('returns 200 with transcribed text from Gemini API for valid audio', async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({
                candidates: [
                    {
                        content: {
                            parts: [{ text: 'นี่คือแก้วน้ำ' }],
                        },
                    },
                ],
            }),
        });

        const formData = new FormData();
        const audioBlob = new Blob(['mock audio byte stream'], { type: 'audio/webm' });
        formData.append('audio', audioBlob, 'recording.webm');

        const request = new NextRequest('http://localhost:3000/api/transcribe', {
            method: 'POST',
            body: formData,
        });

        const response = await POST(request);
        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.text).toBe('นี่คือแก้วน้ำ');
    });
});

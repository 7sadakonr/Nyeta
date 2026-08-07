import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { generateSessionToken, verifySessionToken, CALL_TOKEN_TTL_MS } from '@/lib/server/sessionAuth';
import { createCallState } from '@/lib/server/callStore';
import { checkRateLimit } from '@/lib/server/rateLimit';

export async function POST(request) {
    try {
        const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
                         request.headers.get('x-real-ip') ||
                         'anonymous';

        // 1. Rate limiting
        const rateLimitResult = await checkRateLimit(clientIp, 'session');
        if (!rateLimitResult.success) {
            return NextResponse.json(
                { error: 'Rate limit exceeded. Please try again shortly.' },
                {
                    status: 429,
                    headers: {
                        'Retry-After': String(Math.ceil((rateLimitResult.reset - Date.now()) / 1000)),
                        'X-RateLimit-Limit': String(rateLimitResult.limit),
                        'X-RateLimit-Remaining': String(rateLimitResult.remaining),
                    },
                }
            );
        }

        // 2. Identity resolution: Check if valid blind session token already exists
        const authHeader = request.headers.get('authorization');
        let blindUserId = null;

        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.slice(7).trim();
            const verification = verifySessionToken(token);
            if (verification.valid && verification.payload.role === 'blind') {
                blindUserId = verification.payload.userId;
            }
        }

        // If no verified blind identity exists, generate server-authoritative ID
        if (!blindUserId) {
            blindUserId = `blind_${crypto.randomBytes(8).toString('hex')}`;
        }

        // 3. Create server-authoritative call state in Redis / Memory store
        const callRecord = await createCallState({
            blindUserId,
            ttlSeconds: 600, // 10 minutes
        });

        // 4. Issue call-scoped token bound to the server-generated callId
        const token = generateSessionToken({
            userId: blindUserId,
            role: 'blind',
            callId: callRecord.callId,
            ttlMs: CALL_TOKEN_TTL_MS,
        });

        return NextResponse.json(
            {
                callId: callRecord.callId,
                token,
                userId: blindUserId,
                role: 'blind',
                status: callRecord.status,
                createdAt: callRecord.createdAt,
            },
            {
                status: 200,
                headers: {
                    'Cache-Control': 'private, no-store, no-cache, must-revalidate',
                },
            }
        );
    } catch (err) {
        console.error('Error creating server-authoritative call:', err);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}

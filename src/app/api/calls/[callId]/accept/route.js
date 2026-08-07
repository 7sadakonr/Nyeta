import { NextResponse } from 'next/server';
import { verifySessionToken, generateSessionToken } from '@/lib/server/sessionAuth';
import { checkRateLimit } from '@/lib/server/rateLimit';

export async function POST(req, { params }) {
    try {
        const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown-ip';
        const rateLimitResult = await checkRateLimit(clientIp, 'calls-accept');

        if (!rateLimitResult.success) {
            return NextResponse.json(
                { error: 'Rate limit exceeded. Please try again later.' },
                {
                    status: 429,
                    headers: {
                        'Retry-After': String(Math.ceil((rateLimitResult.reset - Date.now()) / 1000)),
                    },
                }
            );
        }

        const authHeader = req.headers.get('authorization') || '';
        const body = await req.json().catch(() => ({}));
        const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : (body?.token || null);

        if (!token) {
            return NextResponse.json(
                { error: 'Missing session token' },
                { status: 401 }
            );
        }

        const payload = verifySessionToken(token);
        if (!payload) {
            return NextResponse.json(
                { error: 'Invalid or expired session token' },
                { status: 401 }
            );
        }

        if (payload.role !== 'volunteer') {
            return NextResponse.json(
                { error: 'Forbidden: Only volunteers can accept incoming calls' },
                { status: 403 }
            );
        }

        const { callId } = await params;
        if (!callId || typeof callId !== 'string' || callId.trim().length === 0 || callId.length > 128) {
            return NextResponse.json(
                { error: 'Invalid callId parameter' },
                { status: 400 }
            );
        }

        const safeCallId = callId.trim();

        const callScopedToken = generateSessionToken({
            userId: payload.userId,
            role: 'volunteer',
            callId: safeCallId,
        });

        return NextResponse.json({
            token: callScopedToken,
            userId: payload.userId,
            role: 'volunteer',
            callId: safeCallId,
        });
    } catch (err) {
        console.error('Call accept token creation error:', err);
        return NextResponse.json(
            { error: 'Failed to issue call token' },
            { status: 500 }
        );
    }
}

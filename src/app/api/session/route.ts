import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { generateSessionToken, verifySessionToken, SessionRole } from '@/server/auth/sessionAuth';
import { createCallState } from '@/server/calls/callStore';
import { checkRateLimit } from '@/server/security/rateLimit';

export async function POST(req: NextRequest) {
    try {
        const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
                         req.headers.get('x-real-ip') ||
                         'anonymous';

        const rateLimitResult = await checkRateLimit(clientIp, 'session');

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

        const body = await req.json().catch(() => ({}));
        const { role, createCall } = body as { role?: SessionRole; createCall?: boolean };

        if (!role || !['blind', 'volunteer'].includes(role)) {
            return NextResponse.json(
                { error: 'Invalid role. Must be "blind" or "volunteer".' },
                { status: 400 }
            );
        }

        // Server-authoritative Identity:
        // Check if the client holds an already verified session token to preserve identity
        const authHeader = req.headers.get('authorization');
        let verifiedUserId: string | null = null;

        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.substring(7).trim();
            const verification = verifySessionToken(token);
            if (verification && verification.role === role) {
                verifiedUserId = verification.userId;
            }
        }

        // Generate server-authoritative random ID if unauthenticated (ignoring untrusted client body)
        const uid = verifiedUserId || `${role}_${crypto.randomBytes(8).toString('hex')}`;

        let assignedCallId: string | null = null;

        // If blind user is requesting a call, create temporary call state in Redis
        if (role === 'blind' && createCall === true) {
            const callRecord = await createCallState({
                blindUserId: uid,
                ttlSeconds: 600, // 10 minutes
            });
            assignedCallId = callRecord.callId;
        }

        const token = generateSessionToken({
            userId: uid,
            role,
            callId: assignedCallId,
        });

        return NextResponse.json({
            token,
            userId: uid,
            role,
            callId: assignedCallId,
        }, {
            headers: {
                'Cache-Control': 'private, no-store, no-cache, must-revalidate',
            },
        });
    } catch (err) {
        console.error('Session token creation error:', err);
        return NextResponse.json(
            { error: 'Failed to create session token' },
            { status: 500 }
        );
    }
}

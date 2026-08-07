import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { generateSessionToken } from '@/lib/server/sessionAuth';
import { checkRateLimit } from '@/lib/server/rateLimit';

export async function POST(req) {
    try {
        const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown-ip';
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
        const { role, createCall, userId } = body;

        if (!role || !['blind', 'volunteer'].includes(role)) {
            return NextResponse.json(
                { error: 'Invalid role. Must be "blind" or "volunteer".' },
                { status: 400 }
            );
        }

        // Server-authoritative callId generation (client CANNOT supply arbitrary callId)
        let assignedCallId = null;
        if (role === 'blind' && (createCall === true || createCall === undefined)) {
            assignedCallId = crypto.randomUUID();
        }

        const uid = userId || `${role}_${crypto.randomBytes(8).toString('hex')}`;
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
        });
    } catch (err) {
        console.error('Session token creation error:', err);
        return NextResponse.json(
            { error: 'Failed to create session token' },
            { status: 500 }
        );
    }
}

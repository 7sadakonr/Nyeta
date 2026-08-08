import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, generateSessionToken, CALL_TOKEN_TTL_MS } from '@/lib/server/sessionAuth';
import { checkRateLimit } from '@/lib/server/rateLimit';
import { claimCallState } from '@/lib/server/callStore';

export async function POST(
    req: NextRequest,
    context: { params: Promise<{ callId: string }> }
) {
    try {
        const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
                         req.headers.get('x-real-ip') ||
                         'anonymous';

        // 1. Rate limiting with dedicated calls_accept policy
        const rateLimitResult = await checkRateLimit(clientIp, 'calls_accept');
        if (!rateLimitResult.success) {
            return NextResponse.json(
                { error: 'Rate limit exceeded. Please try again later.' },
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

        // 2. Authentication: Extract and verify base volunteer token
        const authHeader = req.headers.get('authorization') || '';
        const body = await req.json().catch(() => ({}));
        const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7).trim() : (body?.token || null);

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

        // 3. Validate callId format
        const { callId } = await context.params;
        if (!callId || typeof callId !== 'string' || callId.trim().length === 0 || callId.length > 128) {
            return NextResponse.json(
                { error: 'Invalid callId parameter' },
                { status: 400 }
            );
        }

        const safeCallId = callId.trim();

        // 4. Atomically claim the call in Redis / Call store
        const claimResult = await claimCallState(safeCallId, payload.userId);

        if (!claimResult.success) {
            if (claimResult.reason === 'not_found') {
                return NextResponse.json(
                    { error: 'Call not found or has expired' },
                    { status: 404 }
                );
            }
            if (claimResult.reason === 'claimed' || claimResult.reason === 'already_claimed') {
                return NextResponse.json(
                    { error: 'Call has already been accepted by another volunteer' },
                    { status: 409 }
                );
            }
            if (claimResult.reason === 'ended' || claimResult.reason === 'cancelled') {
                return NextResponse.json(
                    { error: `Call has already ${claimResult.reason}` },
                    { status: 410 }
                );
            }
            return NextResponse.json(
                { error: 'Unable to claim call', reason: claimResult.reason },
                { status: 400 }
            );
        }

        // 5. Issue call-scoped token bound to the claimed callId with 20-minute TTL
        const callScopedToken = generateSessionToken({
            userId: payload.userId,
            role: 'volunteer',
            callId: safeCallId,
            ttlMs: CALL_TOKEN_TTL_MS,
        });

        return NextResponse.json({
            token: callScopedToken,
            userId: payload.userId,
            role: 'volunteer',
            callId: safeCallId,
            status: 'claimed',
        });
    } catch (err) {
        console.error('Call accept token creation error:', err);
        return NextResponse.json(
            { error: 'Failed to accept call' },
            { status: 500 }
        );
    }
}

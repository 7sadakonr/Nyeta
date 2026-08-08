import { NextRequest, NextResponse } from 'next/server';
import { pusherServer } from '@/server/realtime/pusherServer';
import {
    verifySessionToken,
    validateRoleEventPermission,
} from '@/server/auth/sessionAuth';
import { checkRateLimit } from '@/server/security/rateLimit';
import { updateCallStatus } from '@/server/calls/callStore';

export async function POST(request: NextRequest) {
    try {
        const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown-ip';
        const rateLimitResult = await checkRateLimit(clientIp, 'pusher_trigger');

        if (!rateLimitResult.success) {
            return NextResponse.json(
                { error: 'Too many signaling requests. Please wait.' },
                {
                    status: 429,
                    headers: {
                        'Retry-After': String(Math.ceil((rateLimitResult.reset - Date.now()) / 1000)),
                    },
                }
            );
        }

        const body = await request.json().catch(() => null);
        if (!body || typeof body !== 'object') {
            return NextResponse.json({ error: 'Invalid JSON request' }, { status: 400 });
        }

        let { channel, event, data, token } = body;

        if (!token) {
            const authHeader = request.headers.get('authorization');
            if (authHeader && authHeader.startsWith('Bearer ')) {
                token = authHeader.substring(7).trim();
            }
        }

        if (!channel || typeof channel !== 'string' || !event || typeof event !== 'string') {
            return NextResponse.json({ error: 'Missing channel or event name' }, { status: 400 });
        }

        // Token is mandatory for all trigger requests
        if (!token) {
            return NextResponse.json({ error: 'Unauthorized: Session token is required' }, { status: 401 });
        }

        const tokenPayload = verifySessionToken(token);
        if (!tokenPayload) {
            return NextResponse.json({ error: 'Invalid or expired session token' }, { status: 401 });
        }

        // Validate channel and role-based event permissions
        if (!validateRoleEventPermission(tokenPayload, channel, event, data || {})) {
            return NextResponse.json(
                { error: `Forbidden: Role "${tokenPayload.role}" is not authorized for event "${event}" on channel "${channel}"` },
                { status: 403 }
            );
        }

        // Sanitize data payload (prevent oversized payloads)
        const payloadSize = JSON.stringify(data || {}).length;
        if (payloadSize > 64 * 1024) { // 64KB max signal payload (sufficient for SDP / ICE)
            return NextResponse.json({ error: 'Signaling payload too large' }, { status: 413 });
        }

        // Update call store status when call ends or is cancelled
        if (event === 'call-ended' && channel.startsWith('private-call-')) {
            const targetCallId = channel.replace('private-call-', '');
            updateCallStatus(targetCallId, 'ended').catch(err => console.warn('Failed to update call status:', err));
        } else if (event === 'call-cancelled' && data?.callId) {
            updateCallStatus(data.callId, 'cancelled').catch(err => console.warn('Failed to update call status:', err));
        }

        await pusherServer.trigger(channel, event, data ?? {});
        return NextResponse.json({ ok: true });
    } catch (err) {
        console.error('[API /api/pusher/trigger] Error:', err);
        return NextResponse.json({ error: 'Signaling server error' }, { status: 500 });
    }
}

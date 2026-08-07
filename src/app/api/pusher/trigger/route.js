import { NextResponse } from 'next/server';
import { pusherServer } from '@/lib/pusher-server';
import {
    verifySessionToken,
    validateChannelPermission,
    validateEventPermission,
} from '@/lib/server/sessionAuth';
import { checkRateLimit } from '@/lib/server/rateLimit';

export async function POST(request) {
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

        const { channel, event, data, token } = body;

        if (!channel || typeof channel !== 'string' || !event || typeof event !== 'string') {
            return NextResponse.json({ error: 'Missing channel or event name' }, { status: 400 });
        }

        // Validate event whitelist on this channel
        if (!validateEventPermission(channel, event)) {
            return NextResponse.json(
                { error: `Event "${event}" is not allowed on channel "${channel}"` },
                { status: 403 }
            );
        }

        // Validate session token if provided or enforce channel authorization
        if (token) {
            const tokenPayload = verifySessionToken(token);
            if (!tokenPayload) {
                return NextResponse.json({ error: 'Invalid or expired session token' }, { status: 401 });
            }
            if (!validateChannelPermission(tokenPayload, channel)) {
                return NextResponse.json({ error: 'Forbidden: unauthorized channel access' }, { status: 403 });
            }
        }

        // Sanitize data payload (prevent oversized payloads)
        const payloadSize = JSON.stringify(data || {}).length;
        if (payloadSize > 64 * 1024) { // 64KB max signal payload (sufficient for SDP / ICE)
            return NextResponse.json({ error: 'Signaling payload too large' }, { status: 413 });
        }

        await pusherServer.trigger(channel, event, data ?? {});
        return NextResponse.json({ ok: true });
    } catch (err) {
        console.error('[API /api/pusher/trigger] Error:', err);
        return NextResponse.json({ error: 'Signaling server error' }, { status: 500 });
    }
}

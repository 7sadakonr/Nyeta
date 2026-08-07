import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { pusherServer } from '@/lib/pusher-server';
import { verifySessionToken, validateChannelPermission } from '@/lib/server/sessionAuth';

export async function POST(request) {
    try {
        let socketId = null;
        let channel = null;
        let token = null;

        const contentType = request.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
            const json = await request.json().catch(() => ({}));
            socketId = json.socket_id;
            channel = json.channel_name;
            token = json.token;
        } else {
            const formData = await request.formData().catch(() => null);
            if (formData) {
                socketId = formData.get('socket_id');
                channel = formData.get('channel_name');
                token = formData.get('token');
            }
        }

        if (!token) {
            // Also check Authorization header: Bearer <token>
            const authHeader = request.headers.get('authorization');
            if (authHeader && authHeader.startsWith('Bearer ')) {
                token = authHeader.substring(7).trim();
            }
        }

        if (!socketId || !channel) {
            return NextResponse.json({ error: 'Missing socket_id or channel_name' }, { status: 400 });
        }

        // Token is mandatory for all channel authorization
        if (!token) {
            return NextResponse.json({ error: 'Unauthorized: Session token is required' }, { status: 401 });
        }

        const tokenPayload = verifySessionToken(token);
        if (!tokenPayload) {
            return NextResponse.json({ error: 'Invalid or expired session token' }, { status: 401 });
        }

        if (!validateChannelPermission(tokenPayload, channel)) {
            return NextResponse.json({ error: 'Forbidden: unauthorized channel access' }, { status: 403 });
        }

        if (channel.startsWith('presence-')) {
            const userId = tokenPayload.userId || `user_${crypto.randomBytes(6).toString('hex')}`;
            const role = tokenPayload.role || 'volunteer';

            const presenceData = {
                user_id: userId,
                user_info: {
                    role,
                    joinedAt: Date.now(),
                },
            };
            const auth = pusherServer.authorizeChannel(socketId, channel, presenceData);
            return NextResponse.json(auth);
        }

        // private-* channels
        const auth = pusherServer.authorizeChannel(socketId, channel);
        return NextResponse.json(auth);
    } catch (err) {
        console.error('[API /api/pusher/auth] Auth error:', err);
        return NextResponse.json({ error: 'Server authentication error' }, { status: 500 });
    }
}

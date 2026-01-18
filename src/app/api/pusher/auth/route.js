import { pusherServer } from '@/lib/pusher';

export async function POST(req) {
    try {
        // Pusher-js sends data as application/x-www-form-urlencoded
        const body = await req.text();
        const params = new URLSearchParams(body);
        const socketId = params.get('socket_id');
        const channel = params.get('channel_name');

        console.log('Auth request:', { socketId, channel });

        if (!socketId || !channel) {
            return new Response(JSON.stringify({ error: 'Missing socket_id or channel_name' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        const userId = req.headers.get('x-user-id') || `user-${Date.now()}`;
        const userType = req.headers.get('x-user-type') || 'unknown';

        // For presence channels, we need presence data
        if (channel.startsWith('presence-')) {
            const presenceData = {
                user_id: userId,
                user_info: {
                    userType: userType,
                },
            };
            const authResponse = pusherServer.authorizeChannel(socketId, channel, presenceData);
            console.log('Presence auth success:', channel);
            return new Response(JSON.stringify(authResponse), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        // For private channels
        if (channel.startsWith('private-')) {
            const authResponse = pusherServer.authorizeChannel(socketId, channel);
            console.log('Private auth success:', channel);
            return new Response(JSON.stringify(authResponse), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        return new Response(JSON.stringify({ error: 'Invalid channel type' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
        });

    } catch (error) {
        console.error('Auth error:', error);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}

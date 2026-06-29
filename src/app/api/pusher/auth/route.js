import { pusherServer } from '@/lib/pusher-server';

// Authorizes presence and private channels for the browser Pusher client.
export async function POST(request) {
    const formData = await request.formData();
    const socketId = formData.get('socket_id');
    const channel = formData.get('channel_name');

    if (!socketId || !channel) {
        return new Response('Bad Request', { status: 400 });
    }

    try {
        if (channel.startsWith('presence-')) {
            const presenceData = {
                user_id: crypto.randomUUID(),
                user_info: { name: 'volunteer' },
            };
            const auth = pusherServer.authorizeChannel(socketId, channel, presenceData);
            return Response.json(auth);
        }

        // private-* channels (per-call signaling)
        const auth = pusherServer.authorizeChannel(socketId, channel);
        return Response.json(auth);
    } catch (err) {
        console.error('pusher auth error', err);
        return new Response('Server Error', { status: 500 });
    }
}

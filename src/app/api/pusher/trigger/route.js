import { pusherServer } from '@/lib/pusher-server';

// Relays a signaling event to a channel. Used for broadcasting incoming calls
// and relaying the WebRTC handshake (offer/answer/ICE) between the two peers.
export async function POST(request) {
    try {
        const { channel, event, data } = await request.json();

        if (!channel || !event) {
            return new Response('Bad Request', { status: 400 });
        }

        await pusherServer.trigger(channel, event, data ?? {});
        return Response.json({ ok: true });
    } catch (err) {
        console.error('pusher trigger error', err);
        return new Response('Server Error', { status: 500 });
    }
}

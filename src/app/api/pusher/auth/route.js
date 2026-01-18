import { pusherServer } from '@/lib/pusher';

export async function POST(req) {
    const data = await req.formData();
    const socketId = data.get('socket_id');
    const channel = data.get('channel_name');

    // Custom user info from client (sent via headers or body, but here simplify)
    // For simplicity, we trust the client to send their "peerId" in the body if needed,
    // OR we can just generate a random ID if not provided.
    // Ideally, this should be a real user session.

    // Wait, standard pusher-js auth sends socket_id and channel_name.
    // To get creating user info, we can pass it in headers or query params if needed,
    // but for creating the presence auth, we basically just need a "user_id".

    // Let's assume we pass user_id/peer_id via query param or just generate one logic.
    // Better: Client should send 'user_id' in body or we can parse it.

    // Actually, standard auth body is: socket_id, channel_name.
    // We can add more data.

    // Let's rely on a custom header 'x-user-id' for simplicity
    const userId = req.headers.get('x-user-id') || `user-${Date.now()}`;
    const userType = req.headers.get('x-user-type') || 'unknown'; // 'blind' or 'volunteer'

    const presenceData = {
        user_id: userId,
        user_info: {
            userType: userType,
        },
    };

    const authResponse = pusherServer.authorizeChannel(socketId, channel, presenceData);

    return new Response(JSON.stringify(authResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    });
}

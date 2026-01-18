import { pusherServer } from '@/lib/pusher';
import { NextResponse } from 'next/server';

export async function POST(req) {
    try {
        const { event, channel, data, socketId } = await req.json();

        // Trigger the event
        // socketId is optional: used to exclude the sender from receiving the event
        await pusherServer.trigger(channel, event, data, { socket_id: socketId });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Pusher trigger error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

import { pusherServer } from '@/lib/pusher';
import { NextResponse } from 'next/server';

export async function POST(req) {
    try {
        const { event, channel, data, socketId } = await req.json();

        // Special handling for incoming-request: select random volunteer
        if (event === 'incoming-request' && channel === 'presence-volunteers') {
            // Get list of members in presence channel
            const response = await pusherServer.get({
                path: `/channels/presence-volunteers/users`
            });

            const body = await response.json();
            const users = body.users || [];

            if (users.length === 0) {
                return NextResponse.json({ error: 'No volunteers online', volunteersOnline: 0 }, { status: 404 });
            }

            // Randomly select one volunteer
            const randomIndex = Math.floor(Math.random() * users.length);
            const selectedVolunteer = users[randomIndex];

            // Send to the selected volunteer's private channel
            await pusherServer.trigger(
                `private-user-${selectedVolunteer.id}`,
                'incoming-request',
                data,
                { socket_id: socketId }
            );

            return NextResponse.json({
                success: true,
                selectedVolunteer: selectedVolunteer.id,
                totalOnline: users.length
            });
        }

        // Default: trigger to specified channel
        await pusherServer.trigger(channel, event, data, { socket_id: socketId });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Pusher trigger error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

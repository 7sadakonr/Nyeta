import { NextResponse } from 'next/server';
import { getIceServers, IceServerConfig } from '@/server/webrtc/iceConfig';

export type { IceServerConfig };

export async function GET() {
    const iceServers = getIceServers();

    return NextResponse.json(
        { iceServers },
        {
            headers: {
                'Cache-Control': 'private, no-store, no-cache, must-revalidate',
            },
        }
    );
}

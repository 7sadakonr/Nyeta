import { NextResponse } from 'next/server';

export async function GET() {
    const iceServers = [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
    ];

    const turnUrl = process.env.TURN_URL || process.env.NEXT_PUBLIC_TURN_URL;
    const turnUsername = process.env.TURN_USERNAME || process.env.NEXT_PUBLIC_TURN_USERNAME;
    const turnCredential = process.env.TURN_CREDENTIAL || process.env.NEXT_PUBLIC_TURN_CREDENTIAL;

    if (turnUrl && turnUsername && turnCredential) {
        iceServers.push({
            urls: turnUrl,
            username: turnUsername,
            credential: turnCredential,
        });
    } else if (process.env.NODE_ENV !== 'production') {
        // Fallback for local development testing
        iceServers.push({
            urls: 'turn:openrelay.metered.ca:80',
            username: 'openrelay',
            credential: 'openrelay',
        });
        iceServers.push({
            urls: 'turn:openrelay.metered.ca:443',
            username: 'openrelay',
            credential: 'openrelay',
        });
        iceServers.push({
            urls: 'turn:openrelay.metered.ca:443?transport=tcp',
            username: 'openrelay',
            credential: 'openrelay',
        });
    }

    return NextResponse.json(
        { iceServers },
        {
            headers: {
                'Cache-Control': 'private, no-store, no-cache, must-revalidate',
            },
        }
    );
}

// Shared constants for the volunteer help-call feature.

// Presence channel where online volunteers gather and incoming calls are broadcast.
export const VOLUNTEERS_CHANNEL = 'presence-volunteers';

// Private per-call channel used for the WebRTC handshake. callId is appended.
export const callChannel = (callId) => `private-call-${callId}`;

// Signaling event names.
export const EVENTS = {
    INCOMING_CALL: 'incoming-call',   // blind -> volunteers (broadcast)
    CALL_CLAIMED: 'call-claimed',     // a volunteer took the call -> dismiss others
    CALL_CANCELLED: 'call-cancelled', // blind cancelled before anyone answered
    CALL_ACCEPTED: 'call-accepted',   // volunteer -> blind (on private call channel)
    OFFER: 'offer',                   // blind -> volunteer (SDP)
    ANSWER: 'answer',                 // volunteer -> blind (SDP)
    ICE_CANDIDATE: 'ice-candidate',   // both directions
    CALL_ENDED: 'call-ended',         // either side hangs up
};

// WebRTC ICE servers. STUN is free; TURN is needed as a fallback on mobile/4G
// networks. Defaults to the free OpenRelay project when no env TURN is set.
function buildIceServers() {
    const servers = [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
    ];

    const turnUrl = process.env.NEXT_PUBLIC_TURN_URL;
    const turnUser = process.env.NEXT_PUBLIC_TURN_USERNAME;
    const turnCred = process.env.NEXT_PUBLIC_TURN_CREDENTIAL;

    if (turnUrl && turnUser && turnCred) {
        servers.push({ urls: turnUrl, username: turnUser, credential: turnCred });
    } else {
        // Free public OpenRelay TURN (good enough for demos / prototypes).
        servers.push(
            { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
            { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
            { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
        );
    }

    return servers;
}

export const ICE_SERVERS = buildIceServers();

export const RTC_CONFIG = {
    iceServers: ICE_SERVERS,
};

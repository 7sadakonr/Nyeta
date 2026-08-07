let cachedIceServers = null;

/**
 * Fetch ICE server configuration from /api/webrtc/ice
 * @returns {Promise<RTCIceServer[]>}
 */
export async function getIceServers() {
    if (cachedIceServers) return cachedIceServers;

    try {
        const res = await fetch('/api/webrtc/ice');
        if (res.ok) {
            const data = await res.json();
            if (data.iceServers && Array.isArray(data.iceServers)) {
                cachedIceServers = data.iceServers;
                return cachedIceServers;
            }
        }
    } catch (err) {
        console.warn('Failed to fetch ICE servers from API, using default STUN:', err);
    }

    // Default fallback
    cachedIceServers = [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
    ];
    return cachedIceServers;
}

/**
 * Create and configure an RTCPeerConnection
 * @param {Object} options
 * @param {MediaStream} [options.localStream]
 * @param {Function} options.onIceCandidate
 * @param {Function} [options.onTrack]
 * @param {Function} [options.onConnectionStateChange]
 * @returns {Promise<{ pc: RTCPeerConnection, candidateQueue: RTCIceCandidateInit[], addQueuedCandidates: () => Promise<void> }>}
 */
export async function createPeerConnection({
    localStream,
    onIceCandidate,
    onTrack,
    onConnectionStateChange,
}) {
    const iceServers = await getIceServers();
    const pc = new RTCPeerConnection({ iceServers });
    const candidateQueue = [];

    if (localStream) {
        localStream.getTracks().forEach(track => {
            pc.addTrack(track, localStream);
        });
    }

    pc.onicecandidate = (event) => {
        if (event.candidate && onIceCandidate) {
            onIceCandidate(event.candidate);
        }
    };

    if (onTrack) {
        pc.ontrack = (event) => {
            onTrack(event);
        };
    }

    if (onConnectionStateChange) {
        pc.onconnectionstatechange = () => {
            onConnectionStateChange(pc.connectionState);
        };
    }

    const addQueuedCandidates = async () => {
        while (candidateQueue.length > 0) {
            const candidate = candidateQueue.shift();
            try {
                await pc.addIceCandidate(new RTCIceCandidate(candidate));
            } catch (err) {
                console.warn('Error adding queued ICE candidate:', err);
            }
        }
    };

    return { pc, candidateQueue, addQueuedCandidates };
}

/**
 * Cleanly close and release an RTCPeerConnection
 * @param {RTCPeerConnection} pc
 */
export function closePeerConnection(pc) {
    if (!pc) return;
    try {
        pc.ontrack = null;
        pc.onicecandidate = null;
        pc.onconnectionstatechange = null;
        pc.getSenders().forEach(sender => {
            if (sender.track) {
                try { sender.track.stop(); } catch {}
            }
        });
        pc.close();
    } catch (err) {
        console.warn('Error closing peer connection:', err);
    }
}

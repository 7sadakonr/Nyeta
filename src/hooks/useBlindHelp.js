'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { EVENTS, VOLUNTEERS_CHANNEL, callChannel } from '@/lib/call/constants';
import { sendEvent, subscribe, unsubscribe } from '@/lib/call/signaling';
import { getCallSession } from '@/lib/call/sessionClient';
import { createPeerConnection, closePeerConnection } from '@/lib/call/peerConnection';

const generateId = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return Math.random().toString(36).substring(2, 15);
};

const RING_TIMEOUT_MS = 40000;

/**
 * Blind-side calling hook: handles camera capture, session tokens, and WebRTC streaming to volunteers.
 */
export function useBlindHelp() {
    const [status, setStatus] = useState('idle');
    const [error, setError] = useState(null);
    const [dataChannel, setDataChannel] = useState(null);

    const localVideoRef = useRef(null);
    const remoteAudioRef = useRef(null);

    const pcRef = useRef(null);
    const localStreamRef = useRef(null);
    const channelRef = useRef(null);
    const callIdRef = useRef(null);
    const sessionTokenRef = useRef(null);
    const acceptedVolunteerRef = useRef(null);
    const ringTimerRef = useRef(null);
    const candidateQueueRef = useRef([]);
    const statusRef = useRef('idle');

    const setStatusSafe = useCallback((next) => {
        statusRef.current = next;
        setStatus(next);
    }, []);

    const cleanup = useCallback((nextStatus) => {
        if (ringTimerRef.current) {
            clearTimeout(ringTimerRef.current);
            ringTimerRef.current = null;
        }
        if (pcRef.current) {
            closePeerConnection(pcRef.current);
            pcRef.current = null;
        }
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach((t) => t.stop());
            localStreamRef.current = null;
        }
        if (channelRef.current && callIdRef.current) {
            unsubscribe(callChannel(callIdRef.current));
        }
        channelRef.current = null;
        acceptedVolunteerRef.current = null;
        candidateQueueRef.current = [];
        if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
        if (localVideoRef.current) localVideoRef.current.srcObject = null;
        setDataChannel(null);
        if (nextStatus) setStatusSafe(nextStatus);
    }, [setStatusSafe]);

    const endCall = useCallback((announce = true) => {
        const id = callIdRef.current;
        const token = sessionTokenRef.current;
        if (id) {
            sendEvent(callChannel(id), EVENTS.CALL_ENDED, { from: 'blind' }, token);
            sendEvent(VOLUNTEERS_CHANNEL, EVENTS.CALL_CANCELLED, { callId: id }, token);
        }
        callIdRef.current = null;
        cleanup(announce ? 'ended' : 'idle');
    }, [cleanup]);

    const handleAccepted = useCallback(async (data) => {
        if (acceptedVolunteerRef.current || !data?.volunteerId) return;
        acceptedVolunteerRef.current = data.volunteerId;

        if (ringTimerRef.current) {
            clearTimeout(ringTimerRef.current);
            ringTimerRef.current = null;
        }
        setStatusSafe('connecting');

        const token = sessionTokenRef.current;
        sendEvent(VOLUNTEERS_CHANNEL, EVENTS.CALL_CLAIMED, {
            callId: callIdRef.current,
            volunteerId: data.volunteerId,
        }, token);

        try {
            const pc = pcRef.current;
            if (!pc) return;
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            await sendEvent(callChannel(callIdRef.current), EVENTS.OFFER, {
                sdp: pc.localDescription,
                to: data.volunteerId,
            }, token);
        } catch (err) {
            console.error('createOffer error', err);
            setError('เชื่อมต่อไม่สำเร็จ');
            cleanup('error');
        }
    }, [cleanup, setStatusSafe]);

    const handleAnswer = useCallback(async (data) => {
        if (!data?.sdp || (data.from && data.from !== acceptedVolunteerRef.current)) return;
        try {
            const pc = pcRef.current;
            if (!pc) return;
            await pc.setRemoteDescription(data.sdp);
            // Process any queued ICE candidates
            while (candidateQueueRef.current.length > 0) {
                const candidate = candidateQueueRef.current.shift();
                await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
            }
        } catch (err) {
            console.error('setRemoteDescription error', err);
        }
    }, []);

    const handleIce = useCallback(async (data) => {
        if (data?.from !== acceptedVolunteerRef.current || !data?.candidate) return;
        const pc = pcRef.current;
        if (!pc || !pc.remoteDescription) {
            candidateQueueRef.current.push(data.candidate);
            return;
        }
        try {
            await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch (err) {
            console.error('addIceCandidate error', err);
        }
    }, []);

    const startCall = useCallback(async () => {
        if (['calling', 'connecting', 'connected'].includes(statusRef.current)) return;
        setError(null);
        setStatusSafe('calling');

        let stream;
        try {
            stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
                audio: true,
            });
        } catch (err) {
            console.error('getUserMedia error', err);
            setError('ไม่สามารถเข้าถึงกล้องหรือไมโครโฟนได้');
            setStatusSafe('error');
            return;
        }
        localStreamRef.current = stream;
        if (localVideoRef.current) {
            localVideoRef.current.srcObject = stream;
            localVideoRef.current.muted = true;
            localVideoRef.current.play?.().catch(() => {});
        }

        let session;
        try {
            session = await getCallSession({ role: 'blind', createCall: true });
            sessionTokenRef.current = session?.token;
        } catch (err) {
            console.error('Session auth error:', err.message);
            setError('ไม่สามารถสร้างเซสชันการโทรได้');
            setStatusSafe('error');
            return;
        }

        const callId = session?.callId;
        if (!callId) {
            setError('ไม่สามารถรับรหัสการโทรได้');
            setStatusSafe('error');
            return;
        }

        callIdRef.current = callId;
        acceptedVolunteerRef.current = null;
        candidateQueueRef.current = [];

        const { pc } = await createPeerConnection({
            localStream: stream,
            onIceCandidate: (candidate) => {
                if (acceptedVolunteerRef.current) {
                    sendEvent(callChannel(callId), EVENTS.ICE_CANDIDATE, {
                        candidate,
                        from: 'blind',
                        to: acceptedVolunteerRef.current,
                    }, sessionTokenRef.current);
                }
            },
            onTrack: (event) => {
                if (remoteAudioRef.current) {
                    remoteAudioRef.current.srcObject = event.streams[0];
                    remoteAudioRef.current.play?.().catch(() => {});
                }
            },
            onConnectionStateChange: (state) => {
                if (state === 'connected') setStatusSafe('connected');
                else if (['failed', 'closed'].includes(state)) {
                    if (['connected', 'connecting'].includes(statusRef.current)) cleanup('ended');
                }
            },
        });
        pcRef.current = pc;

        const channel = pc.createDataChannel('nyeta-data', { ordered: true });
        setDataChannel(channel);

        const pusherChannel = subscribe(callChannel(callId));
        channelRef.current = pusherChannel;
        if (pusherChannel) {
            pusherChannel.bind(EVENTS.CALL_ACCEPTED, handleAccepted);
            pusherChannel.bind(EVENTS.ANSWER, handleAnswer);
            pusherChannel.bind(EVENTS.ICE_CANDIDATE, handleIce);
            pusherChannel.bind(EVENTS.CALL_ENDED, () => {
                if (callIdRef.current) cleanup('ended');
            });
        }

        await sendEvent(VOLUNTEERS_CHANNEL, EVENTS.INCOMING_CALL, { callId }, sessionTokenRef.current);

        ringTimerRef.current = setTimeout(() => {
            if (!acceptedVolunteerRef.current) {
                if (callIdRef.current) {
                    sendEvent(VOLUNTEERS_CHANNEL, EVENTS.CALL_CANCELLED, { callId: callIdRef.current }, sessionTokenRef.current);
                }
                callIdRef.current = null;
                cleanup('no-answer');
            }
        }, RING_TIMEOUT_MS);
    }, [cleanup, handleAccepted, handleAnswer, handleIce, setStatusSafe]);

    const reset = useCallback(() => {
        setError(null);
        setStatusSafe('idle');
    }, [setStatusSafe]);

    useEffect(() => {
        return () => {
            const id = callIdRef.current;
            const token = sessionTokenRef.current;
            if (id) {
                sendEvent(callChannel(id), EVENTS.CALL_ENDED, { from: 'blind' }, token);
                sendEvent(VOLUNTEERS_CHANNEL, EVENTS.CALL_CANCELLED, { callId: id }, token);
            }
            cleanup();
        };
    }, [cleanup]);

    return { status, error, startCall, endCall, reset, localVideoRef, remoteAudioRef, pcRef, localStreamRef, dataChannel };
}

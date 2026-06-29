'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { RTC_CONFIG, EVENTS, VOLUNTEERS_CHANNEL, callChannel } from '@/lib/call/constants';
import { sendEvent, subscribe, unsubscribe } from '@/lib/call/signaling';

const generateId = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
};

// How long to ring before giving up if no volunteer answers (ms).
const RING_TIMEOUT_MS = 40000;

/**
 * Blind-side calling logic. The blind user is the WebRTC *caller*:
 * streams the rear camera + mic to the volunteer and receives the volunteer's
 * audio back.
 *
 * status: 'idle' | 'calling' | 'connecting' | 'connected' | 'no-answer' | 'ended' | 'error'
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
    const acceptedVolunteerRef = useRef(null);
    const ringTimerRef = useRef(null);
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
            try { pcRef.current.close(); } catch { /* noop */ }
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
        if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
        if (localVideoRef.current) localVideoRef.current.srcObject = null;
        setDataChannel(null);
        if (nextStatus) setStatusSafe(nextStatus);
    }, [setStatusSafe]);

    const endCall = useCallback((announce = true) => {
        const id = callIdRef.current;
        if (id) {
            sendEvent(callChannel(id), EVENTS.CALL_ENDED, { from: 'blind' });
            // Tell any still-ringing volunteers to stop.
            sendEvent(VOLUNTEERS_CHANNEL, EVENTS.CALL_CANCELLED, { callId: id });
        }
        callIdRef.current = null;
        cleanup(announce ? 'ended' : 'idle');
    }, [cleanup]);

    const handleAccepted = useCallback(async (data) => {
        // First volunteer to accept wins.
        if (acceptedVolunteerRef.current) return;
        if (!data?.volunteerId) return;
        acceptedVolunteerRef.current = data.volunteerId;

        if (ringTimerRef.current) {
            clearTimeout(ringTimerRef.current);
            ringTimerRef.current = null;
        }
        setStatusSafe('connecting');

        // Let other volunteers know the call is taken.
        sendEvent(VOLUNTEERS_CHANNEL, EVENTS.CALL_CLAIMED, {
            callId: callIdRef.current,
            volunteerId: data.volunteerId,
        });

        try {
            const pc = pcRef.current;
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            await sendEvent(callChannel(callIdRef.current), EVENTS.OFFER, {
                sdp: pc.localDescription,
                to: data.volunteerId,
            });
        } catch (err) {
            console.error('createOffer error', err);
            setError('เชื่อมต่อไม่สำเร็จ');
            cleanup('error');
        }
    }, [cleanup, setStatusSafe]);

    const handleAnswer = useCallback(async (data) => {
        if (!data?.sdp) return;
        if (data.from && data.from !== acceptedVolunteerRef.current) return;
        try {
            await pcRef.current?.setRemoteDescription(data.sdp);
        } catch (err) {
            console.error('setRemoteDescription(answer) error', err);
        }
    }, []);

    const handleIce = useCallback(async (data) => {
        // Only accept ICE from the volunteer we locked onto.
        if (data?.from !== acceptedVolunteerRef.current) return;
        if (!data?.candidate) return;
        try {
            await pcRef.current?.addIceCandidate(data.candidate);
        } catch (err) {
            console.error('addIceCandidate error', err);
        }
    }, []);

    const startCall = useCallback(async () => {
        if (statusRef.current === 'calling' || statusRef.current === 'connecting' || statusRef.current === 'connected') {
            return;
        }
        setError(null);
        setStatusSafe('calling');

        // 1. Capture rear camera + mic.
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
            localVideoRef.current.play?.().catch(() => { /* noop */ });
        }

        // 2. Set up peer connection.
        const callId = generateId();
        callIdRef.current = callId;
        acceptedVolunteerRef.current = null;

        const pc = new RTCPeerConnection(RTC_CONFIG);
        pcRef.current = pc;
        
        // Create DataChannel immediately!
        const channel = pc.createDataChannel('nyeta-data', { ordered: true });
        setDataChannel(channel);
        
        stream.getTracks().forEach((track) => pc.addTrack(track, stream));

        pc.onicecandidate = (e) => {
            if (e.candidate && acceptedVolunteerRef.current) {
                sendEvent(callChannel(callId), EVENTS.ICE_CANDIDATE, {
                    candidate: e.candidate,
                    from: 'blind',
                    to: acceptedVolunteerRef.current,
                });
            }
        };

        pc.ontrack = (e) => {
            if (remoteAudioRef.current) {
                remoteAudioRef.current.srcObject = e.streams[0];
                remoteAudioRef.current.play?.().catch(() => { /* noop */ });
            }
        };

        pc.onconnectionstatechange = () => {
            const s = pc.connectionState;
            if (s === 'connected') {
                setStatusSafe('connected');
            } else if (s === 'failed' || s === 'closed') {
                if (statusRef.current === 'connected' || statusRef.current === 'connecting') {
                    cleanup('ended');
                }
            }
        };

        // 3. Subscribe to the private call channel and bind handlers.
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

        // 4. Broadcast the help request to all online volunteers.
        await sendEvent(VOLUNTEERS_CHANNEL, EVENTS.INCOMING_CALL, { callId });

        // 5. Ring timeout.
        ringTimerRef.current = setTimeout(() => {
            if (!acceptedVolunteerRef.current) {
                if (callIdRef.current) {
                    sendEvent(VOLUNTEERS_CHANNEL, EVENTS.CALL_CANCELLED, { callId: callIdRef.current });
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

    // Clean up on unmount.
    useEffect(() => {
        return () => {
            const id = callIdRef.current;
            if (id) {
                sendEvent(callChannel(id), EVENTS.CALL_ENDED, { from: 'blind' });
                sendEvent(VOLUNTEERS_CHANNEL, EVENTS.CALL_CANCELLED, { callId: id });
            }
            cleanup();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return { status, error, startCall, endCall, reset, localVideoRef, remoteAudioRef, pcRef, localStreamRef, dataChannel };
}

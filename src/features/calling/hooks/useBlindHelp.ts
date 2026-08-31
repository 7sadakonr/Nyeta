'use client';

import { useCallback, useEffect, useRef, useState, RefObject } from 'react';
import { EVENTS, VOLUNTEERS_CHANNEL, callChannel } from '@/features/calling/constants';
import { sendEvent, subscribe, unsubscribe } from '@/features/calling/client/signaling';
import { getCallSession } from '@/features/calling/client/sessionClient';
import { createPeerConnection, closePeerConnection } from '@/features/calling/client/peerConnection';
import { CallStatus } from '@/features/calling/types';

const RING_TIMEOUT_MS = 40000;

export interface UseBlindHelpResult {
    status: CallStatus;
    error: string | null;
    startCall: () => Promise<void>;
    endCall: (announce?: boolean) => void;
    reset: () => void;
    localVideoRef: RefObject<HTMLVideoElement | null>;
    remoteAudioRef: RefObject<HTMLAudioElement | null>;
    pcRef: RefObject<RTCPeerConnection | null>;
    localStreamRef: RefObject<MediaStream | null>;
    dataChannel: RTCDataChannel | null;
}

/**
 * Blind-side calling hook: handles camera capture, session tokens, and WebRTC streaming to volunteers.
 */
export function useBlindHelp(): UseBlindHelpResult {
    const [status, setStatus] = useState<CallStatus>('idle');
    const [error, setError] = useState<string | null>(null);
    const [dataChannel, setDataChannel] = useState<RTCDataChannel | null>(null);

    const localVideoRef = useRef<HTMLVideoElement | null>(null);
    const remoteAudioRef = useRef<HTMLAudioElement | null>(null);

    const pcRef = useRef<RTCPeerConnection | null>(null);
    const localStreamRef = useRef<MediaStream | null>(null);
    const channelRef = useRef<any>(null);
    const callIdRef = useRef<string | null>(null);
    const sessionTokenRef = useRef<string | null>(null);
    const acceptedVolunteerRef = useRef<string | null>(null);
    const ringTimerRef = useRef<NodeJS.Timeout | null>(null);
    const candidateQueueRef = useRef<RTCIceCandidateInit[]>([]);
    const statusRef = useRef<CallStatus>('idle');
    const mountedRef = useRef(false);
    const operationIdRef = useRef(0);

    const setStatusSafe = useCallback((next: CallStatus) => {
        statusRef.current = next;
        setStatus(next);
    }, []);

    const cleanup = useCallback((nextStatus?: CallStatus) => {
        operationIdRef.current += 1;
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

    const endCall = useCallback((announce: boolean = true) => {
        const id = callIdRef.current;
        const token = sessionTokenRef.current;
        if (id) {
            sendEvent(callChannel(id), EVENTS.CALL_ENDED, { from: 'blind' }, token || undefined);
            sendEvent(VOLUNTEERS_CHANNEL, EVENTS.CALL_CANCELLED, { callId: id }, token || undefined);
        }
        callIdRef.current = null;
        cleanup(announce ? 'ended' : 'idle');
    }, [cleanup]);

    const handleAccepted = useCallback(async (data: any) => {
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
        }, token || undefined);

        try {
            const pc = pcRef.current;
            if (!pc || !callIdRef.current) return;
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            await sendEvent(callChannel(callIdRef.current), EVENTS.OFFER, {
                sdp: pc.localDescription,
                to: data.volunteerId,
            }, token || undefined);
        } catch (err) {
            console.error('createOffer error', err);
            setError('เชื่อมต่อไม่สำเร็จ');
            cleanup('error');
        }
    }, [cleanup, setStatusSafe]);

    const handleAnswer = useCallback(async (data: any) => {
        if (!data?.sdp || (data.from && data.from !== acceptedVolunteerRef.current)) return;
        try {
            const pc = pcRef.current;
            if (!pc) return;
            await pc.setRemoteDescription(data.sdp);
            // Process any queued ICE candidates
            while (candidateQueueRef.current.length > 0) {
                const candidate = candidateQueueRef.current.shift();
                if (candidate) {
                    await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
                }
            }
        } catch (err) {
            console.error('setRemoteDescription error', err);
        }
    }, []);

    const handleIce = useCallback(async (data: any) => {
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
        const operationId = operationIdRef.current + 1;
        operationIdRef.current = operationId;
        setError(null);
        setStatusSafe('calling');

        let stream: MediaStream;
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
        if (!mountedRef.current || operationId !== operationIdRef.current) {
            stream.getTracks().forEach((track) => track.stop());
            return;
        }
        localStreamRef.current = stream;
        if (localVideoRef.current) {
            localVideoRef.current.srcObject = stream;
            localVideoRef.current.muted = true;
            localVideoRef.current.play?.().catch(() => {});
        }

        let session: any;
        try {
            session = await getCallSession({ role: 'blind', createCall: true });
            sessionTokenRef.current = session?.token || null;
        } catch (err: any) {
            console.error('Session auth error:', err.message);
            setError('ไม่สามารถสร้างเซสชันการโทรได้');
            cleanup('error');
            return;
        }
        if (!mountedRef.current || operationId !== operationIdRef.current) {
            stream.getTracks().forEach((track) => track.stop());
            return;
        }

        const callId = session?.callId;
        if (!callId) {
            setError('ไม่สามารถรับรหัสการโทรได้');
            cleanup('error');
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
                    }, sessionTokenRef.current || undefined);
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
        if (!mountedRef.current || operationId !== operationIdRef.current) {
            closePeerConnection(pc);
            stream.getTracks().forEach((track) => track.stop());
            return;
        }
        pcRef.current = pc;

        const channel = pc.createDataChannel('nyeta-data', { ordered: true });
        setDataChannel(channel);

        const pusherChannel = subscribe(callChannel(callId));
        if (!mountedRef.current || operationId !== operationIdRef.current) {
            closePeerConnection(pc);
            stream.getTracks().forEach((track) => track.stop());
            return;
        }
        channelRef.current = pusherChannel;
        if (pusherChannel) {
            pusherChannel.bind(EVENTS.CALL_ACCEPTED, handleAccepted);
            pusherChannel.bind(EVENTS.ANSWER, handleAnswer);
            pusherChannel.bind(EVENTS.ICE_CANDIDATE, handleIce);
            pusherChannel.bind(EVENTS.CALL_ENDED, () => {
                if (callIdRef.current) cleanup('ended');
            });
        }

        await sendEvent(VOLUNTEERS_CHANNEL, EVENTS.INCOMING_CALL, { callId }, sessionTokenRef.current || undefined);

        if (!mountedRef.current || operationId !== operationIdRef.current) return;

        ringTimerRef.current = setTimeout(() => {
            if (!mountedRef.current || operationId !== operationIdRef.current) return;
            if (!acceptedVolunteerRef.current) {
                if (callIdRef.current) {
                    sendEvent(VOLUNTEERS_CHANNEL, EVENTS.CALL_CANCELLED, { callId: callIdRef.current }, sessionTokenRef.current || undefined);
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
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
            operationIdRef.current += 1;
            const id = callIdRef.current;
            const token = sessionTokenRef.current;
            if (id) {
                sendEvent(callChannel(id), EVENTS.CALL_ENDED, { from: 'blind' }, token || undefined);
                sendEvent(VOLUNTEERS_CHANNEL, EVENTS.CALL_CANCELLED, { callId: id }, token || undefined);
            }
            cleanup();
        };
    }, [cleanup]);

    return { status, error, startCall, endCall, reset, localVideoRef, remoteAudioRef, pcRef, localStreamRef, dataChannel };
}

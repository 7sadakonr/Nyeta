'use client';

import { useCallback, useEffect, useRef, useState, RefObject } from 'react';
import { EVENTS, VOLUNTEERS_CHANNEL, callChannel } from '@/lib/call/constants';
import { sendEvent, subscribe, unsubscribe } from '@/lib/call/signaling';
import { getCallSession, acceptCallSession } from '@/lib/call/sessionClient';
import { createPeerConnection, closePeerConnection } from '@/lib/call/peerConnection';
import { CallStatus, IncomingCall } from '@/types/call';

const generateId = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return Math.random().toString(36).substring(2, 15);
};

export interface UseVolunteerHelpResult {
    status: CallStatus;
    online: boolean;
    volunteerCount: number;
    incomingCall: IncomingCall | null;
    error: string | null;
    remoteVideoRef: RefObject<HTMLVideoElement | null>;
    goOnline: () => Promise<void>;
    goOffline: () => void;
    acceptCall: () => Promise<void>;
    endCall: () => void;
    dismissIncoming: () => void;
    pcRef: RefObject<RTCPeerConnection | null>;
    dataChannel: RTCDataChannel | null;
}

/**
 * Volunteer-side logic: receives video/audio stream from blind user and relays voice assistance.
 */
export function useVolunteerHelp(): UseVolunteerHelpResult {
    const [status, setStatus] = useState<CallStatus>('offline');
    const [online, setOnline] = useState<boolean>(false);
    const [volunteerCount, setVolunteerCount] = useState<number>(0);
    const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [dataChannel, setDataChannel] = useState<RTCDataChannel | null>(null);

    const remoteVideoRef = useRef<HTMLVideoElement | null>(null);

    const volunteerIdRef = useRef<string | null>(null);
    const sessionTokenRef = useRef<string | null>(null);
    const presenceRef = useRef<any>(null);
    const callChannelRef = useRef<any>(null);
    const pcRef = useRef<RTCPeerConnection | null>(null);
    const localStreamRef = useRef<MediaStream | null>(null);
    const activeCallIdRef = useRef<string | null>(null);
    const incomingRef = useRef<IncomingCall | null>(null);
    const candidateQueueRef = useRef<RTCIceCandidateInit[]>([]);
    const statusRef = useRef<CallStatus>('offline');
    const onlineRef = useRef<boolean>(false);

    useEffect(() => {
        if (!volunteerIdRef.current) {
            volunteerIdRef.current = generateId();
        }
    }, []);

    const setStatusSafe = useCallback((next: CallStatus) => {
        statusRef.current = next;
        setStatus(next);
    }, []);

    const setIncomingSafe = useCallback((next: IncomingCall | null) => {
        incomingRef.current = next;
        setIncomingCall(next);
    }, []);

    const cleanupCall = useCallback((nextStatus: CallStatus | null) => {
        if (pcRef.current) {
            closePeerConnection(pcRef.current);
            pcRef.current = null;
        }
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach((t) => t.stop());
            localStreamRef.current = null;
        }
        if (callChannelRef.current && activeCallIdRef.current) {
            unsubscribe(callChannel(activeCallIdRef.current));
        }
        callChannelRef.current = null;
        activeCallIdRef.current = null;
        candidateQueueRef.current = [];
        if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
        setDataChannel(null);
        if (nextStatus) setStatusSafe(nextStatus);

        // Reset to base volunteer token when call finishes
        if (onlineRef.current && volunteerIdRef.current) {
            getCallSession({ role: 'volunteer', userId: volunteerIdRef.current })
                .then((s) => {
                    sessionTokenRef.current = s?.token || null;
                })
                .catch(() => {});
        }
    }, [setStatusSafe]);

    const endCall = useCallback(() => {
        const id = activeCallIdRef.current;
        const token = sessionTokenRef.current;
        if (id) sendEvent(callChannel(id), EVENTS.CALL_ENDED, { from: 'volunteer' }, token || undefined);
        cleanupCall(onlineRef.current ? 'online' : 'offline');
    }, [cleanupCall]);

    const dismissIncoming = useCallback(() => {
        setIncomingSafe(null);
        if (statusRef.current === 'ringing') setStatusSafe(onlineRef.current ? 'online' : 'offline');
    }, [setIncomingSafe, setStatusSafe]);

    const acceptCall = useCallback(async () => {
        const call = incomingRef.current;
        if (!call?.callId) return;
        if (['connecting', 'connected'].includes(statusRef.current)) return;

        const callId = call.callId;
        setError(null);
        setStatusSafe('connecting');
        setIncomingSafe(null);

        let stream: MediaStream;
        try {
            stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        } catch (err) {
            console.error('volunteer getUserMedia error', err);
            setError('ไม่สามารถเข้าถึงไมโครโฟนได้');
            setStatusSafe(onlineRef.current ? 'online' : 'offline');
            return;
        }
        localStreamRef.current = stream;

        try {
            const session = await acceptCallSession(callId, sessionTokenRef.current || undefined);
            sessionTokenRef.current = session?.token || null;
        } catch (err: any) {
            console.error('Volunteer accept call session error:', err.message);
            if (err.status === 409) {
                setError('สายนี้ได้รับการช่วยเหลือจากอาสาสมัครท่านอื่นแล้ว');
            } else if (err.status === 404 || err.status === 410) {
                setError('สายนี้ถูกยกเลิกหรือหมดอายุแล้ว');
            } else {
                setError('ไม่สามารถสร้าง Session สำหรับการรับสายได้');
            }
            cleanupCall(onlineRef.current ? 'online' : 'offline');
            return;
        }

        activeCallIdRef.current = callId;
        candidateQueueRef.current = [];

        const { pc } = await createPeerConnection({
            localStream: stream,
            onIceCandidate: (candidate) => {
                if (volunteerIdRef.current) {
                    sendEvent(callChannel(callId), EVENTS.ICE_CANDIDATE, {
                        candidate,
                        from: volunteerIdRef.current,
                        to: 'blind',
                    }, sessionTokenRef.current || undefined);
                }
            },
            onTrack: (event) => {
                if (remoteVideoRef.current) {
                    remoteVideoRef.current.srcObject = event.streams[0];
                    remoteVideoRef.current.play?.().catch(() => {});
                }
            },
            onConnectionStateChange: (state) => {
                if (state === 'connected') setStatusSafe('connected');
                else if (['failed', 'closed'].includes(state)) {
                    if (['connected', 'connecting'].includes(statusRef.current)) {
                        cleanupCall(onlineRef.current ? 'online' : 'offline');
                    }
                }
            },
        });
        pcRef.current = pc;

        pc.ondatachannel = (event) => {
            setDataChannel(event.channel);
        };

        const channel = subscribe(callChannel(callId));
        callChannelRef.current = channel;

        const handleOffer = async (data: any) => {
            if (data?.to && data.to !== volunteerIdRef.current) return;
            if (!data?.sdp) return;
            try {
                await pc.setRemoteDescription(data.sdp);
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                await sendEvent(callChannel(callId), EVENTS.ANSWER, {
                    sdp: pc.localDescription,
                    from: volunteerIdRef.current,
                }, sessionTokenRef.current || undefined);

                while (candidateQueueRef.current.length > 0) {
                    const candidate = candidateQueueRef.current.shift();
                    if (candidate) {
                        await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
                    }
                }
            } catch (err) {
                console.error('handleOffer error', err);
            }
        };

        const handleIce = async (data: any) => {
            if (data?.from !== 'blind' || !data?.candidate) return;
            if (!pc.remoteDescription) {
                candidateQueueRef.current.push(data.candidate);
                return;
            }
            try {
                await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
            } catch (err) {
                console.error('volunteer addIceCandidate error', err);
            }
        };

        if (channel) {
            channel.bind(EVENTS.OFFER, handleOffer);
            channel.bind(EVENTS.ICE_CANDIDATE, handleIce);
            channel.bind(EVENTS.CALL_ENDED, () => {
                cleanupCall(onlineRef.current ? 'online' : 'offline');
            });

            const announce = () => {
                sendEvent(callChannel(callId), EVENTS.CALL_ACCEPTED, {
                    volunteerId: volunteerIdRef.current,
                }, sessionTokenRef.current || undefined);
                sendEvent(VOLUNTEERS_CHANNEL, EVENTS.CALL_CLAIMED, {
                    callId,
                    volunteerId: volunteerIdRef.current,
                }, sessionTokenRef.current || undefined);
            };
            if (channel.subscribed) announce();
            else channel.bind('pusher:subscription_succeeded', announce);
        }
    }, [cleanupCall, setIncomingSafe, setStatusSafe]);

    const goOnline = useCallback(async () => {
        if (online) return;

        try {
            const session = await getCallSession({ role: 'volunteer', userId: volunteerIdRef.current || undefined });
            sessionTokenRef.current = session?.token || null;
        } catch (err: any) {
            console.warn('Volunteer session warning:', err.message);
        }

        const channel = subscribe(VOLUNTEERS_CHANNEL);
        presenceRef.current = channel;
        if (!channel) {
            setError('เชื่อมต่อระบบไม่สำเร็จ');
            return;
        }

        channel.bind('pusher:subscription_succeeded', (members: any) => {
            setVolunteerCount(members?.count ?? 0);
        });
        channel.bind('pusher:member_added', () => {
            setVolunteerCount((c) => c + 1);
        });
        channel.bind('pusher:member_removed', () => {
            setVolunteerCount((c) => Math.max(0, c - 1));
        });

        channel.bind(EVENTS.INCOMING_CALL, (data: any) => {
            if (!data?.callId) return;
            if (['connecting', 'connected'].includes(statusRef.current)) return;
            setIncomingSafe({ callId: data.callId });
            setStatusSafe('ringing');
        });

        channel.bind(EVENTS.CALL_CLAIMED, (data: any) => {
            if (incomingRef.current && data?.callId === incomingRef.current.callId &&
                data?.volunteerId !== volunteerIdRef.current) {
                dismissIncoming();
            }
        });

        channel.bind(EVENTS.CALL_CANCELLED, (data: any) => {
            if (incomingRef.current && data?.callId === incomingRef.current.callId) {
                dismissIncoming();
            }
            if (activeCallIdRef.current && data?.callId === activeCallIdRef.current) {
                cleanupCall('online');
            }
        });

        onlineRef.current = true;
        setOnline(true);
        setStatusSafe('online');
    }, [online, cleanupCall, dismissIncoming, setIncomingSafe, setStatusSafe]);

    const goOffline = useCallback(() => {
        cleanupCall(null);
        setIncomingSafe(null);
        if (presenceRef.current) {
            unsubscribe(VOLUNTEERS_CHANNEL);
            presenceRef.current = null;
        }
        setVolunteerCount(0);
        onlineRef.current = false;
        setOnline(false);
        setStatusSafe('offline');
    }, [cleanupCall, setIncomingSafe, setStatusSafe]);

    useEffect(() => {
        return () => {
            const id = activeCallIdRef.current;
            const token = sessionTokenRef.current;
            if (id) sendEvent(callChannel(id), EVENTS.CALL_ENDED, { from: 'volunteer' }, token || undefined);
            cleanupCall(null);
            if (presenceRef.current) unsubscribe(VOLUNTEERS_CHANNEL);
        };
    }, [cleanupCall]);

    return {
        status,
        online,
        volunteerCount,
        incomingCall,
        error,
        remoteVideoRef,
        goOnline,
        goOffline,
        acceptCall,
        endCall,
        dismissIncoming,
        pcRef,
        dataChannel,
    };
}

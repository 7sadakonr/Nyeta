'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { RTC_CONFIG, EVENTS, VOLUNTEERS_CHANNEL, callChannel } from '@/lib/call/constants';
import { sendEvent, subscribe, unsubscribe } from '@/lib/call/signaling';

/**
 * Volunteer-side logic. The volunteer is the WebRTC *answerer*: receives the
 * blind user's camera video + audio and sends only their own microphone back.
 *
 * status: 'offline' | 'online' | 'ringing' | 'connecting' | 'connected' | 'ended'
 */
export function useVolunteerHelp() {
    const [status, setStatus] = useState('offline');
    const [online, setOnline] = useState(false);
    const [volunteerCount, setVolunteerCount] = useState(0);
    const [incomingCall, setIncomingCall] = useState(null); // { callId }
    const [error, setError] = useState(null);

    const remoteVideoRef = useRef(null);

    const volunteerIdRef = useRef(null);
    const presenceRef = useRef(null);
    const callChannelRef = useRef(null);
    const pcRef = useRef(null);
    const localStreamRef = useRef(null);
    const activeCallIdRef = useRef(null);
    const incomingRef = useRef(null);
    const statusRef = useRef('offline');
    const onlineRef = useRef(false);

    if (!volunteerIdRef.current && typeof window !== 'undefined') {
        volunteerIdRef.current = crypto.randomUUID();
    }

    const setStatusSafe = useCallback((next) => {
        statusRef.current = next;
        setStatus(next);
    }, []);

    const setIncomingSafe = useCallback((next) => {
        incomingRef.current = next;
        setIncomingCall(next);
    }, []);

    const cleanupCall = useCallback((nextStatus) => {
        if (pcRef.current) {
            try { pcRef.current.close(); } catch { /* noop */ }
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
        if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
        if (nextStatus) setStatusSafe(nextStatus);
    }, [setStatusSafe]);

    const endCall = useCallback(() => {
        const id = activeCallIdRef.current;
        if (id) sendEvent(callChannel(id), EVENTS.CALL_ENDED, { from: 'volunteer' });
        cleanupCall(onlineRef.current ? 'online' : 'offline');
    }, [cleanupCall]);

    const dismissIncoming = useCallback(() => {
        setIncomingSafe(null);
        if (statusRef.current === 'ringing') setStatusSafe(onlineRef.current ? 'online' : 'offline');
    }, [setIncomingSafe, setStatusSafe]);

    const acceptCall = useCallback(async () => {
        const call = incomingRef.current;
        if (!call?.callId) return;
        if (statusRef.current === 'connecting' || statusRef.current === 'connected') return;

        const callId = call.callId;
        setError(null);
        setStatusSafe('connecting');
        setIncomingSafe(null);

        // 1. Volunteer mic only.
        let stream;
        try {
            stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        } catch (err) {
            console.error('volunteer getUserMedia error', err);
            setError('ไม่สามารถเข้าถึงไมโครโฟนได้');
            setStatusSafe(onlineRef.current ? 'online' : 'offline');
            return;
        }
        localStreamRef.current = stream;

        // 2. Peer connection.
        const pc = new RTCPeerConnection(RTC_CONFIG);
        pcRef.current = pc;
        activeCallIdRef.current = callId;
        stream.getTracks().forEach((track) => pc.addTrack(track, stream));

        pc.onicecandidate = (e) => {
            if (e.candidate) {
                sendEvent(callChannel(callId), EVENTS.ICE_CANDIDATE, {
                    candidate: e.candidate,
                    from: volunteerIdRef.current,
                    to: 'blind',
                });
            }
        };

        pc.ontrack = (e) => {
            if (remoteVideoRef.current) {
                remoteVideoRef.current.srcObject = e.streams[0];
                remoteVideoRef.current.play?.().catch(() => { /* noop */ });
            }
        };

        pc.onconnectionstatechange = () => {
            const s = pc.connectionState;
            if (s === 'connected') {
                setStatusSafe('connected');
            } else if (s === 'failed' || s === 'closed') {
                if (statusRef.current === 'connected' || statusRef.current === 'connecting') {
                    cleanupCall(onlineRef.current ? 'online' : 'offline');
                }
            }
        };

        // 3. Subscribe to the private call channel, bind handlers.
        const channel = subscribe(callChannel(callId));
        callChannelRef.current = channel;

        const handleOffer = async (data) => {
            if (data?.to && data.to !== volunteerIdRef.current) return;
            if (!data?.sdp) return;
            try {
                await pc.setRemoteDescription(data.sdp);
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                await sendEvent(callChannel(callId), EVENTS.ANSWER, {
                    sdp: pc.localDescription,
                    from: volunteerIdRef.current,
                });
            } catch (err) {
                console.error('handleOffer error', err);
            }
        };

        const handleIce = async (data) => {
            if (data?.from !== 'blind') return;
            if (!data?.candidate) return;
            try {
                await pc.addIceCandidate(data.candidate);
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

            // 4. Announce acceptance only once subscribed, so we don't miss the OFFER.
            const announce = () => {
                sendEvent(callChannel(callId), EVENTS.CALL_ACCEPTED, {
                    volunteerId: volunteerIdRef.current,
                });
                sendEvent(VOLUNTEERS_CHANNEL, EVENTS.CALL_CLAIMED, {
                    callId,
                    volunteerId: volunteerIdRef.current,
                });
            };
            if (channel.subscribed) announce();
            else channel.bind('pusher:subscription_succeeded', announce);
        }
    }, [cleanupCall, setIncomingSafe, setStatusSafe]);

    const goOnline = useCallback(() => {
        if (online) return;
        const channel = subscribe(VOLUNTEERS_CHANNEL);
        presenceRef.current = channel;
        if (!channel) {
            setError('เชื่อมต่อระบบไม่สำเร็จ');
            return;
        }

        channel.bind('pusher:subscription_succeeded', (members) => {
            setVolunteerCount(members?.count ?? 0);
        });
        channel.bind('pusher:member_added', () => {
            setVolunteerCount((c) => c + 1);
        });
        channel.bind('pusher:member_removed', () => {
            setVolunteerCount((c) => Math.max(0, c - 1));
        });

        channel.bind(EVENTS.INCOMING_CALL, (data) => {
            if (!data?.callId) return;
            // Ignore new rings while already handling/:in a call.
            if (statusRef.current === 'connecting' || statusRef.current === 'connected') return;
            setIncomingSafe({ callId: data.callId });
            setStatusSafe('ringing');
        });

        channel.bind(EVENTS.CALL_CLAIMED, (data) => {
            if (incomingRef.current && data?.callId === incomingRef.current.callId &&
                data?.volunteerId !== volunteerIdRef.current) {
                dismissIncoming();
            }
        });

        channel.bind(EVENTS.CALL_CANCELLED, (data) => {
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
            if (id) sendEvent(callChannel(id), EVENTS.CALL_ENDED, { from: 'volunteer' });
            cleanupCall(null);
            if (presenceRef.current) unsubscribe(VOLUNTEERS_CHANNEL);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

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
        pcRef,
    };
}

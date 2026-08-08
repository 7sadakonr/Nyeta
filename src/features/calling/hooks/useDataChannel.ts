'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { UserRole } from '@/server/types';

const CHUNK_SIZE = 16384; // 16KB limit for DataChannel

export interface UseDataChannelResult {
    channelState: RTCDataChannelState | null;
    sendChat: (text: string) => void;
    sendCaptureRequest: (options?: { flash?: boolean }) => void;
    sendToggleFlash: (flash: boolean) => void;
    sendCaptureResponse: (imageBase64: string) => void;
    sendCaptureStatus: (status: string) => void;
    onMessage: (callback: (data: any) => void) => void;
    offMessage: (callback: (data: any) => void) => void;
}

export function useDataChannel(channel: RTCDataChannel | null, role: UserRole): UseDataChannelResult {
    const [channelState, setChannelState] = useState<RTCDataChannelState | null>(null);
    const channelRef = useRef<RTCDataChannel | null>(null);
    const listenersRef = useRef<Set<(data: any) => void>>(new Set());
    const incomingChunksRef = useRef<Record<string, string[]>>({});

    const handleChannel = useCallback((chan: RTCDataChannel) => {
        channelRef.current = chan;
        setChannelState(chan.readyState);

        chan.onopen = () => {
            setChannelState('open');
            console.log('DataChannel open');
        };

        chan.onclose = () => {
            setChannelState('closed');
            console.log('DataChannel closed');
        };

        chan.onmessage = (event: MessageEvent) => {
            try {
                const message = JSON.parse(event.data);
                
                // Handle chunking logic
                if (message.type === 'capture-chunk') {
                    const { id, chunk, index, total } = message.payload;
                    if (!incomingChunksRef.current[id]) {
                        incomingChunksRef.current[id] = new Array(total);
                    }
                    incomingChunksRef.current[id][index] = chunk;
                    
                    // Check if all chunks received
                    if (incomingChunksRef.current[id].filter(Boolean).length === total) {
                        const fullBase64 = incomingChunksRef.current[id].join('');
                        delete incomingChunksRef.current[id];
                        
                        // Notify listeners with full image
                        const reconstructedMessage = { type: 'capture-response', payload: { image: fullBase64 } };
                        listenersRef.current.forEach(callback => callback(reconstructedMessage));
                    }
                    return; // Don't notify listeners for individual chunks
                }

                listenersRef.current.forEach(callback => callback(message));
            } catch (err) {
                console.error('Failed to parse DataChannel message:', err);
            }
        };
    }, []);

    useEffect(() => {
        if (!channel) {
            channelRef.current = null;
            setChannelState(null);
            return;
        }

        handleChannel(channel);
    }, [channel, handleChannel]);

    // Send a generic message
    const sendMessage = useCallback((type: string, payload: any) => {
        const chan = channelRef.current;
        if (chan && chan.readyState === 'open') {
            const data = JSON.stringify({ type, payload });
            chan.send(data);
        } else {
            console.warn('DataChannel not open. Message not sent:', type);
        }
    }, []);

    // Send chat message
    const sendChat = useCallback((text: string) => {
        sendMessage('chat', { text, from: role });
    }, [sendMessage, role]);

    // Send capture request (Volunteer -> Blind)
    const sendCaptureRequest = useCallback((options?: { flash?: boolean }) => {
        sendMessage('capture-request', options || { flash: false });
    }, [sendMessage]);

    // Send toggle flash request (Volunteer -> Blind)
    const sendToggleFlash = useCallback((flash: boolean) => {
        sendMessage('toggle-flash', { flash });
    }, [sendMessage]);

    // Send capture status
    const sendCaptureStatus = useCallback((status: string) => {
        sendMessage('capture-status', { status });
    }, [sendMessage]);

    // Send capture response (Image chunks) (Blind -> Volunteer)
    const sendCaptureResponse = useCallback((imageBase64: string) => {
        const chan = channelRef.current;
        if (!chan || chan.readyState !== 'open') return;

        const id = Date.now().toString();
        const chunks: string[] = [];
        for (let i = 0; i < imageBase64.length; i += CHUNK_SIZE) {
            chunks.push(imageBase64.slice(i, i + CHUNK_SIZE));
        }

        const total = chunks.length;
        let index = 0;
        const BUFFER_THRESHOLD = 64 * 1024; // 64KB threshold

        const sendNext = () => {
            while (index < total) {
                if (chan.bufferedAmount > BUFFER_THRESHOLD) {
                    chan.onbufferedamountlow = sendNext;
                    chan.bufferedAmountLowThreshold = BUFFER_THRESHOLD / 2;
                    return;
                }
                const data = JSON.stringify({
                    type: 'capture-chunk',
                    payload: { id, chunk: chunks[index], index, total }
                });
                chan.send(data);
                index++;
            }
            chan.onbufferedamountlow = null;
        };

        sendNext();
    }, []);

    const onMessage = useCallback((callback: (data: any) => void) => {
        listenersRef.current.add(callback);
    }, []);

    const offMessage = useCallback((callback: (data: any) => void) => {
        listenersRef.current.delete(callback);
    }, []);

    return useMemo(() => ({
        channelState,
        sendChat,
        sendCaptureRequest,
        sendToggleFlash,
        sendCaptureResponse,
        sendCaptureStatus,
        onMessage,
        offMessage
    }), [
        channelState,
        sendChat,
        sendCaptureRequest,
        sendToggleFlash,
        sendCaptureResponse,
        sendCaptureStatus,
        onMessage,
        offMessage
    ]);
}

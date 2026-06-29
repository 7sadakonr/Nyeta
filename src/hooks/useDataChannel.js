'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

const CHUNK_SIZE = 16384; // 16KB limit for DataChannel

export function useDataChannel(channel, role) {
    const [channelState, setChannelState] = useState(null); // null | 'connecting' | 'open' | 'closed'
    const channelRef = useRef(null);
    const listenersRef = useRef(new Set());
    const incomingChunksRef = useRef({});

    const handleChannel = useCallback((channel) => {
        channelRef.current = channel;
        setChannelState(channel.readyState);

        channel.onopen = () => {
            setChannelState('open');
            console.log('DataChannel open');
        };

        channel.onclose = () => {
            setChannelState('closed');
            console.log('DataChannel closed');
        };

        channel.onmessage = (event) => {
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
    const sendMessage = useCallback((type, payload) => {
        const channel = channelRef.current;
        if (channel && channel.readyState === 'open') {
            const data = JSON.stringify({ type, payload });
            channel.send(data);
        } else {
            console.warn('DataChannel not open. Message not sent:', type);
        }
    }, []);

    // Send chat message
    const sendChat = useCallback((text) => {
        sendMessage('chat', { text, from: role });
    }, [sendMessage, role]);

    // Send capture request (Volunteer -> Blind)
    const sendCaptureRequest = useCallback((options = { flash: false }) => {
        sendMessage('capture-request', options);
    }, [sendMessage]);

    // Send toggle flash request (Volunteer -> Blind)
    const sendToggleFlash = useCallback((flash) => {
        sendMessage('toggle-flash', { flash });
    }, [sendMessage]);

    // Send capture status
    const sendCaptureStatus = useCallback((status) => {
        sendMessage('capture-status', { status });
    }, [sendMessage]);

    // Send capture response (Image chunks) (Blind -> Volunteer)
    const sendCaptureResponse = useCallback((imageBase64) => {
        const channel = channelRef.current;
        if (!channel || channel.readyState !== 'open') return;

        const id = Date.now().toString();
        const chunks = [];
        for (let i = 0; i < imageBase64.length; i += CHUNK_SIZE) {
            chunks.push(imageBase64.slice(i, i + CHUNK_SIZE));
        }

        const total = chunks.length;
        chunks.forEach((chunk, index) => {
            const data = JSON.stringify({
                type: 'capture-chunk',
                payload: { id, chunk, index, total }
            });
            channel.send(data);
        });
    }, []);

    const onMessage = useCallback((callback) => {
        listenersRef.current.add(callback);
    }, []);

    const offMessage = useCallback((callback) => {
        listenersRef.current.delete(callback);
    }, []);

    return {
        channelState,
        sendChat,
        sendCaptureRequest,
        sendToggleFlash,
        sendCaptureResponse,
        sendCaptureStatus,
        onMessage,
        offMessage
    };
}

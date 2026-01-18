'use client';

import { useEffect, useState, useRef } from 'react';
// import io from 'socket.io-client'; // Removed
import { createPusherClient } from '@/lib/pusher';
import Peer from 'peerjs';
import Link from 'next/link';
import HapticFeedback from '@/components/HapticFeedback';
import { useWakeLock } from '@/hooks/useWakeLock';

export default function VolunteerPage() {
    const { isSupported: wakeLockSupported, request: requestWakeLock, release: releaseWakeLock } = useWakeLock();
    const [isOnline, setIsOnline] = useState(false);
    const [status, setStatus] = useState('offline'); // offline, online, ringing, connected
    const [blindUserId, setBlindUserId] = useState(null);
    const [remoteStream, setRemoteStream] = useState(null);

    const pusherRef = useRef(null);
    const peerRef = useRef(null);
    const remoteVideoRef = useRef(null);
    const localStreamRef = useRef(null);
    const hapticRef = useRef(null); // Reference to HapticFeedback component
    const dataConnRef = useRef(null); // Data connection for controls

    const [isFlashOn, setIsFlashOn] = useState(false);

    const [logs, setLogs] = useState([]);
    const addLog = (msg) => {
        console.log(msg);
        setLogs(prev => [...prev.slice(-5), msg]);
    };

    // Socket Ref was removed, we use PusherRef now
    const socketRef = useRef(null); // Keep for compatibility if I missed any references, but ideally remove.
    // Actually, I replaced socketRef usage with Pusher logic in previous step, checking...
    // The previous large replace removed socketRef usages logic in useEffect, but I might have missed 'socketRef.current' refs in toggleOnline if I didn't replace them all.
    // I rewrote toggleOnline, so it should be fine.

    useEffect(() => {
        return () => {
            if (pusherRef.current) pusherRef.current.disconnect();
            if (peerRef.current) peerRef.current.destroy();
            if (localStreamRef.current) localStreamRef.current.getTracks().forEach(t => t.stop());
        };
    }, []);

    const setupPusher = (myId) => {
        if (pusherRef.current) return;

        const pusher = createPusherClient(myId, 'volunteer');
        pusherRef.current = pusher;

        // Private channel for receiving volunteer-ready confirmation
        pusher.subscribe(`private-user-${myId}`);
    };

    const toggleOnline = async () => {
        if (isOnline) {
            // GO OFFLINE
            if (pusherRef.current) {
                pusherRef.current.unsubscribe('presence-volunteers');
            }
            setIsOnline(false);
            setStatus('offline');
            addLog('Offline');
        } else {
            // GO ONLINE
            if (!peerRef.current || peerRef.current.destroyed) {
                const peer = new Peer(undefined, {
                    config: {
                        iceServers: [
                            { urls: 'stun:stun.l.google.com:19302' },
                            { urls: 'stun:stun.relay.metered.ca:80' },
                            { urls: 'turn:a.relay.metered.ca:80', username: 'e8dd65f92ae8d30fe9bb0665', credential: 'kPOL/5Bj2rDLMxeu' },
                            { urls: 'turn:a.relay.metered.ca:443', username: 'e8dd65f92ae8d30fe9bb0665', credential: 'kPOL/5Bj2rDLMxeu' }
                        ]
                    }
                });
                peerRef.current = peer;

                peer.on('open', (id) => {
                    setupPusher(id);

                    // Subscribe to presence channel and listen for incoming requests
                    const presenceChannel = pusherRef.current.subscribe('presence-volunteers');

                    presenceChannel.bind('incoming-request', ({ blindPeerId }) => {
                        setBlindUserId(blindPeerId);
                        setStatus('ringing');
                        if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
                    });

                    setIsOnline(true);
                    setStatus('online');
                });

                peer.on('error', (e) => console.error('Peer error:', e));

                // If accepting call logic needs Peer, we should reuse this instance.
            } else {
                // Reuse existing peer
                if (!pusherRef.current) {
                    setupPusher(peerRef.current.id);
                }
                pusherRef.current.subscribe('presence-volunteers');
                setIsOnline(true);
                setStatus('online');
            }
        }
    };

    const answerCall = async () => {
        hapticRef.current?.trigger(3, 80);
        setStatus('connecting');
        addLog('Getting microphone...');

        let myStream = null;
        try {
            myStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            localStreamRef.current = myStream;
        } catch (err) {
            addLog('No mic: ' + err.name);
            // ... fallback to silent stream
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const destination = audioContext.createMediaStreamDestination();
            oscillator.connect(destination);
            oscillator.start();
            oscillator.frequency.value = 0;
            myStream = destination.stream;
        }

        // We already have Peer initialized from toggleOnline
        const peer = peerRef.current;
        if (!peer) {
            addLog('Error: Peer missing');
            return;
        }

        // Notify blind user we are ready via Pusher Trigger
        addLog('Accepting call...');
        try {
            await fetch('/api/pusher/trigger', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    channel: `private-user-${blindUserId}`,
                    event: 'volunteer-ready',
                    data: { volunteerId: peer.id }
                })
            });
        } catch (e) {
            addLog('Accept Err: ' + e.message);
        }

        // Wait for incoming call (or we call them? original logic: they call us)
        // Original logic: socket.emit('volunteer-ready') -> server tells blind -> blind calls us.
        // So we just wait for 'call' event on peer.

        peer.on('call', (call) => {
            addLog('Blind calling us!');
            call.answer(myStream);
            setStatus('connected');

            call.on('stream', (stream) => {
                setRemoteStream(stream);
            });

            call.on('close', () => endCall());

            // ... (keep data conn logic)
            const conn = peer.connect(call.peer);
            conn.on('open', () => { dataConnRef.current = conn; });
        });
    };

    const endCall = () => {
        // Don't destroy peer, just close media?
        // If we destroy peer, we lose our ID and Pusher connection (if we based it on Peer ID).
        // Let's keep Peer alive if we want to remain online.

        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(t => t.stop());
            localStreamRef.current = null;
        }
        setStatus('online');
        setBlindUserId(null);
        setRemoteStream(null);
        addLog('Call ended');

        // We are still subscribed to presence, so we are still "online".
    };

    const rejectCall = () => {
        setBlindUserId(null);
        setStatus('online');
        addLog('Rejected');
    };

    const [isMuted, setIsMuted] = useState(false);

    const toggleMute = () => {
        if (localStreamRef.current) {
            const audioTrack = localStreamRef.current.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = !audioTrack.enabled;
                setIsMuted(!audioTrack.enabled);
                addLog(audioTrack.enabled ? 'Unmuted' : 'Muted');
                hapticRef.current?.trigger(1);
            }
        }
    };

    const toggleFlash = () => {
        if (dataConnRef.current) {
            const newState = !isFlashOn;
            dataConnRef.current.send({ type: 'TOGGLE_FLASH', value: newState });
            setIsFlashOn(newState);
            addLog('Flash: ' + newState);
            hapticRef.current?.trigger(1);
        } else {
            addLog('No data conn');
        }
    };

    // Attach remote stream when connected and element is ready
    useEffect(() => {
        if (status === 'connected' && remoteVideoRef.current && remoteStream) {
            addLog('Attaching stream to video');
            remoteVideoRef.current.srcObject = remoteStream;
            remoteVideoRef.current.onloadedmetadata = () => {
                if (remoteVideoRef.current) {
                    remoteVideoRef.current.play().catch(e => addLog('Play err: ' + e.message));
                }
            };
        }
    }, [status, remoteStream]);

    return (
        <div className="flex flex-col h-screen bg-slate-50 text-slate-900 overflow-hidden relative">
            {/* Hidden Haptic Feedback Component */}
            <HapticFeedback ref={hapticRef} />

            {/* Top Navigation Bar */}
            <div className="absolute top-0 left-0 right-0 p-4 z-40 bg-white/80 backdrop-blur-md flex justify-between items-center shadow-sm">
                <Link href="/" className="px-4 py-2 bg-slate-100 rounded-full font-bold text-slate-600 hover:bg-slate-200 transition-colors">
                    ← Home
                </Link>
                <h1 className="text-lg font-bold text-slate-800">Volunteer Dashboard</h1>
                <div className={`w-3 h-3 rounded-full ${isOnline ? 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.6)]' : 'bg-slate-300'}`}></div>
            </div>



            {(status === 'offline' || status === 'online') && (
                <div className="flex-1 flex flex-col items-center justify-center p-6 text-center relative">

                    {/* Status Display */}
                    <div className="mb-12 relative">
                        {isOnline ? (
                            // Online State - Scanner Animation
                            <div className="relative w-64 h-64 flex items-center justify-center">
                                {/* Sonar Rings */}
                                <div className="absolute inset-0 bg-green-500/20 rounded-full animate-ping" style={{ animationDuration: '3s' }}></div>
                                <div className="absolute inset-4 bg-green-500/20 rounded-full animate-ping" style={{ animationDuration: '3s', animationDelay: '1s' }}></div>

                                <div className="z-10 w-48 h-48 bg-white rounded-full shadow-2xl flex items-center justify-center border-4 border-green-100">
                                    <div className="text-center">
                                        {/* Emoji removed */}
                                        <div className="text-sm font-bold text-green-600 uppercase tracking-widest">Scanning</div>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            // Offline State
                            <div className="w-64 h-64 bg-slate-200 rounded-full flex items-center justify-center shadow-inner">
                                <span className="text-6xl text-slate-400">Offline</span>
                            </div>
                        )}
                    </div>

                    {/* Main Toggle Button */}
                    <div className="flex flex-col items-center gap-4">
                        <button
                            onClick={toggleOnline}
                            className={`
                                relative px-8 py-4 rounded-full text-xl font-bold transition-all duration-300 transform hover:scale-105 active:scale-95 shadow-xl
                                ${isOnline
                                    ? 'bg-red-50 text-red-600 border-2 border-red-100 hover:bg-red-100'
                                    : 'bg-slate-900 text-white hover:bg-slate-800'
                                }
                            `}
                        >
                            {isOnline ? (
                                <div className="flex items-center gap-2">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18.36 6.64a9 9 0 1 1-12.73 0" /><line x1="12" y1="2" x2="12" y2="12" /></svg>
                                    <span>Stop Volunteering</span>
                                </div>
                            ) : (
                                <div className="flex items-center gap-2">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12h10" /><path d="M9 4v16" /><path d="m3 9 3 3-3 3" /><path d="M14 8V7c0-2.94 2.16-5.4 5-5.92V2.5a2.5 2.5 0 0 1 5 0v19a2.5 2.5 0 0 1-5 0v-.6c-2.83-.5-5-3-5-5.9v-1" /></svg>
                                    <span>Start Volunteering</span>
                                </div>
                            )}
                        </button>
                        <p className="text-slate-500 font-medium">
                            {isOnline ? 'Waiting for a blind person to call...' : 'You are currently offline.'}
                        </p>
                    </div>
                </div>
            )}

            {status === 'ringing' && (
                <div className="absolute inset-0 z-50 bg-black/90 backdrop-blur-xl flex flex-col items-center justify-center">
                    <div className="w-full max-w-sm bg-white/10 p-8 rounded-3xl backdrop-blur-md border border-white/20 text-center">
                        <div className="w-24 h-24 bg-linear-to-tr from-yellow-400 to-orange-500 rounded-full mx-auto mb-6 flex items-center justify-center shadow-lg animate-bounce">
                            {/* Emoji removed */}
                        </div>
                        <h2 className="text-3xl font-bold text-white mb-2">Incoming Call</h2>
                        <p className="text-white/60 mb-12">Blind person needs assistance</p>

                        <div className="flex justify-between gap-6">
                            <button
                                onClick={rejectCall}
                                className="flex-1 flex flex-col items-center gap-2 group"
                            >
                                <div className="w-16 h-16 bg-red-500/20 text-red-500 rounded-full flex items-center justify-center border-2 border-red-500 group-active:bg-red-500 group-active:text-white transition-colors">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
                                </div>
                                <span className="text-white/80 text-sm font-medium">Decline</span>
                            </button>

                            <button
                                onClick={answerCall}
                                className="flex-1 flex flex-col items-center gap-2 group"
                            >
                                <div className="w-16 h-16 bg-green-500 text-white rounded-full flex items-center justify-center shadow-[0_0_20px_rgba(34,197,94,0.6)] animate-pulse group-active:scale-95 transition-transform">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" /></svg>
                                </div>
                                <span className="text-white text-sm font-bold">Accept</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {status === 'connecting' && (
                <div className="absolute inset-0 z-50 bg-slate-900 flex flex-col items-center justify-center text-white">
                    <div className="w-16 h-16 border-4 border-white/20 border-t-white rounded-full animate-spin mb-8"></div>
                    <div className="text-2xl font-bold">Connecting...</div>
                    <div className="text-white/40 mt-2">Establishing secure connection</div>
                </div>
            )}

            {status === 'connected' && (
                <div className="absolute inset-0 bg-black flex flex-col">
                    {/* Blind user's camera - FULL SCREEN */}
                    <div className="relative flex-1 bg-black flex items-center justify-center overflow-hidden">
                        <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-contain" />

                        {/* Overlay Controls */}
                        <div className="absolute top-0 left-0 right-0 p-6 bg-linear-to-b from-black/80 to-transparent pointer-events-none">
                            <div className="flex justify-between items-start">
                                <div>
                                    <div className="text-white font-bold text-lg text-shadow-sm">Blind User</div>
                                    <div className="text-green-400 text-sm flex items-center gap-2">
                                        <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                                        Live Video
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Bottom Floating Controls */}
                    <div className="absolute bottom-8 left-0 right-0 flex justify-center items-center gap-6 px-4 pointer-events-auto">
                        <button
                            onClick={toggleMute}
                            className={`flex items-center justify-center w-16 h-16 rounded-full shadow-xl border-2 border-white/20 transition-all active:scale-95 ${isMuted ? 'bg-white text-zinc-900' : 'bg-zinc-800/60 backdrop-blur-md text-white'}`}
                            aria-label={isMuted ? "Unmute Microphone" : "Mute Microphone"}
                        >
                            {isMuted ? (
                                <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="1" y1="1" x2="23" y2="23"></line>
                                    <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"></path>
                                    <path d="M17 16.95A7 7 0 0 1 5 12v-2"></path>
                                    <line x1="12" y1="19" x2="12" y2="23"></line>
                                    <line x1="8" y1="23" x2="16" y2="23"></line>
                                </svg>
                            ) : (
                                <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                                    <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                                    <line x1="12" y1="19" x2="12" y2="23"></line>
                                    <line x1="8" y1="23" x2="16" y2="23"></line>
                                </svg>
                            )}
                        </button>

                        <button
                            onClick={endCall}
                            className="bg-red-600 hover:bg-red-700 text-white px-10 py-4 rounded-full font-bold shadow-xl transform active:scale-95 transition-all flex items-center gap-2"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91" /><path d="M22 2l-7 7" /><path d="M15 2l7 7" /></svg>
                            <span>End Call</span>
                        </button>

                        <button
                            onClick={toggleFlash}
                            className={`w-14 h-14 rounded-full flex items-center justify-center text-white transition-all active:scale-95 border border-white/20 shadow-lg ${isFlashOn ? 'bg-yellow-400 text-black' : 'bg-zinc-800/60 backdrop-blur-md'}`}
                            aria-label={isFlashOn ? "Turn Flashlight Off" : "Turn Flashlight On"}
                        >
                            {isFlashOn ? (
                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" /><path d="M9 18h6" /><path d="M10 22h4" /></svg>
                            ) : (
                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" /><path d="M9 18h6" /><path d="M10 22h4" /><line x1="4" y1="21" x2="20" y2="5" /></svg>
                            )}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );

}

'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
// import io from 'socket.io-client'; // Removed
import { createPusherClient } from '@/lib/pusher';
import Peer from 'peerjs';
import Link from 'next/link';
import HapticFeedback from '@/components/HapticFeedback';
import { useWakeLock } from '@/hooks/useWakeLock';

export default function BlindPage() {
    const [status, setStatus] = useState('idle'); // idle, calling, connected, failed
    const { isSupported: wakeLockSupported, request: requestWakeLock, release: releaseWakeLock } = useWakeLock();
    const [isMuted, setIsMuted] = useState(false);

    const myVideoRef = useRef(null);
    const remoteVideoRef = useRef(null);
    const peerRef = useRef(null);
    const pusherRef = useRef(null); // Added for Pusher
    const socketRef = useRef(null);
    const streamRef = useRef(null);
    const incomingStreamRef = useRef(null);
    const hapticRef = useRef(null);
    const audioContextRef = useRef(null);
    const beepIntervalRef = useRef(null);

    // Helper function to play beep sound - works on iOS
    const playBeepSound = useCallback((volume = 0.3, silent = false) => {
        try {
            if (!audioContextRef.current) {
                audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
            }
            const ctx = audioContextRef.current;

            // Resume if suspended
            if (ctx.state === 'suspended') {
                ctx.resume();
            }

            // Create beep
            const oscillator = ctx.createOscillator();
            const gainNode = ctx.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(ctx.destination);

            oscillator.frequency.value = 880; // A5 note
            oscillator.type = 'sine';

            // Use very low volume for silent unlock, or normal volume for alert
            const actualVolume = silent ? 0.001 : volume;
            gainNode.gain.setValueAtTime(actualVolume, ctx.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);

            oscillator.start(ctx.currentTime);
            oscillator.stop(ctx.currentTime + 0.15);

            if (!silent) {
                console.log('Beep played!');
            }
        } catch (err) {
            console.error('Beep error:', err);
        }
    }, []);

    const [logs, setLogs] = useState([]);
    const addLog = (msg) => {
        console.log(msg);
        // setLogs(prev => [...prev.slice(-8), msg]); // Disabled for production
    };

    const callVolunteerRef = useRef((volunteerId, hapticRefParam) => {
        addLog('callVolunteer: ' + volunteerId.substring(0, 8));

        if (!peerRef.current || !streamRef.current) {
            addLog('Error: No peer or stream');
            return;
        }

        // Disable tracks until confirmed
        streamRef.current.getTracks().forEach(t => t.enabled = false);

        const call = peerRef.current.call(volunteerId, streamRef.current);

        if (!call) {
            addLog('Call failed!');
            return;
        }

        setStatus('confirming');
        // hapticRefParam.current?.trigger(2, 50); // Double tap hint - REMOVED: Managed by useEffect loop now

        call.on('stream', (remoteStream) => {
            addLog('Got volunteer audio!');
            incomingStreamRef.current = remoteStream;

            if (remoteVideoRef.current) {
                remoteVideoRef.current.srcObject = remoteStream;
                remoteVideoRef.current.onloadedmetadata = () => {
                    remoteVideoRef.current.play().catch(e => console.error('Remote play error:', e));
                };
            }
        });

        call.on('close', () => {
            endCall();
        });

        call.on('error', (e) => addLog('Call err: ' + e.message));
    });

    const volunteersRef = useRef([]);

    const setupPusher = useCallback((myPeerId) => {
        if (pusherRef.current) return;

        const pusher = createPusherClient(myPeerId, 'blind');
        pusherRef.current = pusher;

        // Subscribe to my private channel
        const myChannel = pusher.subscribe(`private-user-${myPeerId}`);
        myChannel.bind('volunteer-ready', ({ volunteerId }) => {
            callVolunteerRef.current(volunteerId, hapticRef);
        });

        // Subscribe to presence to get volunteer list
        const presenceChannel = pusher.subscribe('presence-volunteers');
        presenceChannel.bind('pusher:subscription_succeeded', (members) => {
            volunteersRef.current = [];
            members.each((member) => {
                volunteersRef.current.push(member.id);
            });
            console.log('Volunteers online:', volunteersRef.current.length);
        });
        presenceChannel.bind('pusher:member_added', (member) => {
            if (!volunteersRef.current.includes(member.id)) {
                volunteersRef.current.push(member.id);
            }
        });
        presenceChannel.bind('pusher:member_removed', (member) => {
            volunteersRef.current = volunteersRef.current.filter(id => id !== member.id);
        });
    }, []);

    const requestHelp = async (myPeerId) => {
        try {
            // Get current volunteers (excluding self)
            const volunteers = volunteersRef.current.filter(id => id !== myPeerId);

            if (volunteers.length === 0) {
                console.log('No volunteers online');
                // Fallback: broadcast to presence channel
                await fetch('/api/pusher/trigger', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        channel: 'presence-volunteers',
                        event: 'incoming-request',
                        data: { blindPeerId: myPeerId },
                        socketId: pusherRef.current?.connection.socket_id
                    })
                });
                return;
            }

            // Randomly select one volunteer
            const randomIndex = Math.floor(Math.random() * volunteers.length);
            const selectedVolunteer = volunteers[randomIndex];
            console.log('Selected volunteer:', selectedVolunteer);

            // Send to selected volunteer's private channel
            await fetch('/api/pusher/trigger', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    channel: `private-user-${selectedVolunteer}`,
                    event: 'incoming-request',
                    data: { blindPeerId: myPeerId },
                    socketId: pusherRef.current?.connection.socket_id
                })
            });
        } catch (e) {
            console.error('Request error:', e);
        }
    };

    const startCall = async () => {
        setStatus('initializing');
        hapticRef.current?.trigger(1, 40);
        playBeepSound(0.001, true);

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
                audio: true
            });
            streamRef.current = stream;

            if (myVideoRef.current) {
                myVideoRef.current.srcObject = stream;
                myVideoRef.current.onloadedmetadata = () => myVideoRef.current.play().catch(console.error);
            }

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
                setStatus('waiting');
                setupPusher(id);
                requestHelp(id);
            });

            peer.on('connection', (conn) => {
                conn.on('data', async (data) => {
                    if (data.type === 'TOGGLE_FLASH') {
                        if (streamRef.current) {
                            const track = streamRef.current.getVideoTracks()[0];
                            try {
                                await track.applyConstraints({ advanced: [{ torch: data.value }] });
                            } catch (err) {
                                console.error('Torch error:', err);
                            }
                        }
                    }
                });
            });

            peer.on('error', (e) => {
                console.error('Peer error:', e);
                setStatus('idle');
            });

        } catch (err) {
            console.error('Camera Error:', err);
            setStatus('idle');
            alert('Camera Error: ' + err.message);
        }
    };

    const endCall = useCallback(() => {
        if (peerRef.current) peerRef.current.destroy();
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
            streamRef.current = null;
        }
        setStatus('idle');
    }, []);

    const confirmConnection = () => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.enabled = true);
        }
        hapticRef.current?.trigger(5, 80); // Strong vibration
        setStatus('connected');
    };

    // Attach remote audio when connected
    useEffect(() => {
        if (status === 'connected' && incomingStreamRef.current && remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = incomingStreamRef.current;
            remoteVideoRef.current.onloadedmetadata = () => {
                remoteVideoRef.current.play().catch(console.error);
            };
        }
    }, [status]);

    const toggleMute = () => {
        if (streamRef.current) {
            const audioTrack = streamRef.current.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = !audioTrack.enabled; // Toggle actual track
                setIsMuted(!audioTrack.enabled); // Update UI state (enabled=false means muted=true)
                hapticRef.current?.trigger(1);
            }
        }
    };

    // Audio alert when volunteer is found (Loop until confirmed or cancelled)
    useEffect(() => {
        if (status === 'confirming') {
            console.log('STATUS IS CONFIRMING - Starting beep loop');

            // Play beep immediately and loop
            playBeepSound(0.3);
            beepIntervalRef.current = setInterval(() => playBeepSound(0.3), 800);

        } else {
            // Stop beep loop
            if (beepIntervalRef.current) {
                console.log('Stopping beep loop');
                clearInterval(beepIntervalRef.current);
                beepIntervalRef.current = null;
            }
        }

        return () => {
            if (beepIntervalRef.current) {
                clearInterval(beepIntervalRef.current);
                beepIntervalRef.current = null;
            }
        };
    }, [status, playBeepSound]);

    return (
        <div className="flex flex-col h-screen bg-black text-white relative overflow-hidden font-sans">
            <HapticFeedback ref={hapticRef} />

            {/* Back Button - Prominent and Accessible */}
            <div className="absolute top-6 left-6 z-50">
                <Link href="/" className="flex items-center gap-2 bg-black/60 hover:bg-black/80 text-white px-6 py-3 rounded-full backdrop-blur-md transition-all border border-white/20 shadow-lg">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
                    <span className="font-bold text-lg">Back</span>
                </Link>
            </div>



            {/* IDLE STATE */}
            {status === 'idle' && (
                <button
                    onClick={startCall}
                    className="w-full h-full flex flex-col items-center justify-center relative group"
                >
                    <div className="absolute inset-0 bg-linear-to-br from-amber-400 to-orange-600 transition-all duration-500 group-active:scale-[0.98]"></div>

                    {/* Ripple Effect */}
                    <div className="absolute w-[500px] h-[500px] bg-white/10 rounded-full animate-ping opacity-20"></div>

                    <div className="z-10 flex flex-col items-center">
                        <div className="bg-white/20 p-8 rounded-full mb-8 backdrop-blur-sm shadow-2xl">
                            <svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 24 24" fill="currentColor" className="text-white drop-shadow-md">
                                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
                            </svg>
                        </div>
                        <span className="text-6xl font-black uppercase tracking-tighter text-white drop-shadow-lg text-center leading-none">
                            Call<br />Help
                        </span>
                        <span className="mt-4 text-xl font-medium text-white/90 bg-black/10 px-4 py-1 rounded-full">
                            Tap anywhere to start
                        </span>
                    </div>
                </button>
            )}

            {/* INITIALIZING STATE */}
            {status === 'initializing' && (
                <div className="w-full h-full flex items-center justify-center bg-zinc-900">
                    <div className="flex flex-col items-center animate-pulse">
                        <div className="w-16 h-16 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mb-6"></div>
                        <div className="text-2xl font-bold text-amber-500 tracking-widest">STARTING CAMERA...</div>
                    </div>
                </div>
            )}

            {/* WAITING STATE */}
            {status === 'waiting' && (
                <div className="w-full h-full flex flex-col items-center justify-center bg-black relative">
                    <video ref={myVideoRef} autoPlay muted playsInline className="absolute inset-0 w-full h-full object-cover opacity-40 grayscale" />

                    {/* Radar Animation Overlay */}
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,#000_100%)]"></div>

                    <div className="z-10 flex flex-col items-center w-full max-w-md px-6">
                        <div className="relative mb-12">
                            <div className="absolute inset-0 bg-sky-500/30 rounded-full animate-ping"></div>
                            <div className="relative bg-sky-500/20 p-6 rounded-full border border-sky-500/50 backdrop-blur-md">
                                <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-sky-400">
                                    <circle cx="12" cy="12" r="10" /><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" /><path d="M2 12h20" />
                                </svg>
                            </div>
                        </div>

                        <div className="text-3xl font-bold text-center mb-2">Searching...</div>
                        <div className="text-gray-400 text-center mb-12">Finding an available volunteer</div>

                        <button
                            onClick={endCall}
                            className="w-full bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-600 text-white py-6 rounded-2xl text-xl font-bold transition-all border border-zinc-700 shadow-lg flex items-center justify-center gap-3"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M18 6 6 18" />
                                <path d="m6 6 12 12" />
                            </svg>
                            Cancel Request
                        </button>
                    </div>
                </div>
            )}

            {/* CONFIRMING STATE */}
            {status === 'confirming' && (
                <button
                    onClick={confirmConnection}
                    className="w-full h-full flex flex-col items-center justify-center bg-linear-to-b from-emerald-500 to-teal-700 animate-in fade-in duration-300"
                >
                    <div className="bg-white/20 p-8 rounded-full mb-8 backdrop-blur-md animate-bounce">
                        <svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 24 24" fill="currentColor" className="text-white">
                            <path d="M9 11l3 3L22 4"></path>
                            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
                        </svg>
                    </div>
                    <span className="text-4xl font-black uppercase text-center text-white drop-shadow-md mb-2">
                        Volunteer Found!
                    </span>
                    <span className="text-white/80 text-xl font-medium animate-pulse">
                        Tap screen to start talking
                    </span>
                </button>
            )}

            {/* CONNECTED STATE */}
            {status === 'connected' && (
                <div className="w-full h-full relative bg-zinc-900">
                    <video ref={myVideoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
                    <audio ref={remoteVideoRef} autoPlay />

                    {/* Overlay Gradient for contrast */}
                    <div className="absolute inset-x-0 bottom-0 h-48 bg-linear-to-t from-black/90 to-transparent pointer-events-none"></div>

                    {/* Controls */}
                    <div className="absolute bottom-10 inset-x-0 flex items-center justify-center gap-8 z-20">
                        {/* Mute Button */}
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
                            className="group flex items-center justify-center w-24 h-24 bg-red-600 active:bg-red-700 rounded-full shadow-2xl border-4 border-white/10 transition-transform active:scale-95"
                            aria-label="End Call"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-white">
                                <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91" /><path d="M22 2l-7 7" /><path d="M15 2l7 7" />
                            </svg>
                        </button>
                    </div>

                    {/* Live Indicator */}
                    <div className="absolute top-6 left-1/2 -translate-x-1/2 bg-red-600/90 backdrop-blur text-white px-4 py-1 rounded-full text-xs font-bold tracking-wider flex items-center gap-2 shadow-lg">
                        <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
                        LIVE
                    </div>
                </div>
            )}
        </div>
    );
}

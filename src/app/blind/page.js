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

    // AI Assistant State (Simple "Be My AI" Style)
    const [mode, setMode] = useState('volunteer'); // 'volunteer' | 'ai'
    const [aiStatus, setAiStatus] = useState('idle'); // 'idle', 'capturing', 'thinking'
    const [aiReady, setAiReady] = useState(false); // true when camera is ready
    const [aiMessages, setAiMessages] = useState([]); // Chat history: [{role: 'user'|'ai', content: '', image?: ''}]
    const aiStreamRef = useRef(null);


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
    const fallbackTimeoutRef = useRef(null); // Timeout for retry broadcast
    const volunteersRef = useRef([]);
    const triedVolunteersRef = useRef([]); // Track attempted volunteers
    const waitingForVolunteersRef = useRef(false); // Wait for presence before calling

    const currentVolunteerIdRef = useRef(null); // Track connected volunteer

    // Moved endCall up to be accessible by setupPusher
    const endCall = useCallback(async (notifyRemote = true) => {
        if (fallbackTimeoutRef.current) clearTimeout(fallbackTimeoutRef.current); // Clear any pending retry
        if (notifyRemote && currentVolunteerIdRef.current && pusherRef.current) {
            try {
                await fetch('/api/pusher/trigger', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        channel: `private-user-${currentVolunteerIdRef.current}`,
                        event: 'end-call',
                        data: { by: 'blind' },
                        socketId: pusherRef.current?.connection.socket_id
                    })
                });
            } catch (err) {
                console.error('End call notify error:', err);
            }
        }
        currentVolunteerIdRef.current = null;

        // Don't destroy peerRef here, to keep ID alive for next call!
        // if (peerRef.current) peerRef.current.destroy(); 

        // Only close active calls/connections
        // We might need to iterate peerRef.current.connections if we want to be thorough,
        // but typically just stopping tracks and resetting state is enough for the logic.

        if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
            // streamRef.current = null; // We can re-get user media next time or keep it? 
            // Better to stop it to release camera/mic privacy indicator.
        }

        setStatus('idle');
    }, []);

    // Cleanup Peer on unmount ONLY
    useEffect(() => {
        return () => {
            if (peerRef.current) {
                console.log('Component unmounting, destroying peer');
                peerRef.current.destroy();
                peerRef.current = null;
            }
        };
    }, []);

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
        currentVolunteerIdRef.current = volunteerId; // Store ID

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
            endCall(false); // Already closed, no need to notify
        });

        call.on('error', (e) => addLog('Call err: ' + e.message));
    });



    // Moved RequestHelp UP to be accessible by setupPusher
    const requestHelp = async (myPeerId) => {
        try {
            // 1. Filter available volunteers (excluding self and already tried)
            // 1. Filter available volunteers (excluding self and already tried)
            let availableVolunteers = volunteersRef.current.filter(id => id !== myPeerId && !triedVolunteersRef.current.includes(id));

            console.log(`RequestHelp: Total=${volunteersRef.current.length}, Tried=${triedVolunteersRef.current.length}, Available=${availableVolunteers.length}`);

            // 2. If we exhausted the list, reset and loop again
            if (availableVolunteers.length === 0 && volunteersRef.current.filter(id => id !== myPeerId).length > 0) {
                console.log('Tried all volunteers, resetting list and looping...');
                triedVolunteersRef.current = [];
                availableVolunteers = volunteersRef.current.filter(id => id !== myPeerId);
            }

            // 3. If truly no one is online
            if (availableVolunteers.length === 0) {
                console.log('No volunteers online, waiting/retrying...');
                // DO NOT BROADCAST. Just retry in 5s.
                if (fallbackTimeoutRef.current) clearTimeout(fallbackTimeoutRef.current);
                fallbackTimeoutRef.current = setTimeout(() => {
                    console.log('Retrying requestHelp...');
                    // But we need myPeerId? It's passed in.
                    // If we use recursion, ensure we have the ID.
                    // Actually, if nobody is online, just wait. When someone joins, presence channel fixes it?
                    // Nope, we should just retry periodically in case of sync issues
                    requestHelp(myPeerId);
                }, 5000);
                return;
            }

            // 4. Select random volunteer
            const randomIndex = Math.floor(Math.random() * availableVolunteers.length);
            const selectedVolunteer = availableVolunteers[randomIndex];
            console.log('Selected volunteer:', selectedVolunteer);

            // 5. Mark as tried
            triedVolunteersRef.current.push(selectedVolunteer);

            // 6. Send request
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

            // 7. Set 30s Timeout to try next person
            if (fallbackTimeoutRef.current) clearTimeout(fallbackTimeoutRef.current);
            fallbackTimeoutRef.current = setTimeout(() => {
                console.log('No answer in 30s, trying next volunteer...');
                requestHelp(myPeerId); // Recursive call
            }, 30000);

        } catch (e) {
            console.error('Request error:', e);
        }
    };

    // ================== AI ASSISTANT LOGIC (Simple "Be My AI" Style) ==================

    // Play Earcon (Short sound effect for status feedback)
    const playEarcon = useCallback((type) => {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = ctx.createOscillator();
            const gainNode = ctx.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(ctx.destination);

            if (type === 'capture') { // Camera shutter sound
                oscillator.frequency.value = 1200;
                gainNode.gain.setValueAtTime(0.2, ctx.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.08);
                oscillator.start(ctx.currentTime);
                oscillator.stop(ctx.currentTime + 0.08);
            } else if (type === 'success') { // Success chime
                oscillator.frequency.value = 660;
                gainNode.gain.setValueAtTime(0.2, ctx.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
                oscillator.start(ctx.currentTime);
                oscillator.stop(ctx.currentTime + 0.15);
            }
        } catch (e) {
            console.error('Earcon error:', e);
        }
    }, []);

    // Initialize AI Mode - Just request camera permission
    const handleAiConnection = useCallback(() => {
        // HARDCODED KEY FOR DEBUGGING (User provided)
        const apiKey = "AIzaSyAWwFq-LgYjDYnQ7z8wvtCH7CjnOQympUs";

        // const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
        if (!apiKey) {
            addLog('Error: API Key missing!');
            alert('API Key Missing! Please add NEXT_PUBLIC_GEMINI_API_KEY to .env.local');
            return false; // Indicate failure
        }
        return true; // Indicate success
    }, [addLog]);

    const initAiMode = useCallback(async () => {
        setAiReady(false);
        setAiMessages([]);
        addLog('Initializing AI Mode...');

        try {
            // Request Camera AND Microphone Permission (Mic needed for Voice Input)
            addLog('Requesting camera & mic...');
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
                audio: true // CHANGED: Enable audio to get permission prompt
            });
            aiStreamRef.current = stream;

            // Mute the local video element to prevent feedback/echo
            if (myVideoRef.current) {
                myVideoRef.current.srcObject = stream;
                myVideoRef.current.muted = true; // Ensure local preview is muted
                myVideoRef.current.onloadedmetadata = () => myVideoRef.current.play().catch(console.error);
            }

            setAiReady(true);
            addLog('Camera ready! Tap to capture.');

        } catch (err) {
            console.error('AI Init Error:', err);
            addLog('Permission denied or error!');
            alert('Camera permission denied. Please allow access.');
        }
    }, [addLog]);

    // State for Voice Input
    const [isListening, setIsListening] = useState(false);
    const [voiceTranscript, setVoiceTranscript] = useState(''); // To show on UI
    const recognitionRef = useRef(null);
    const captureAndAskRef = useRef(null); // Ref to hold stable function reference
    const askTextOnlyRef = useRef(null); // Ref for text-only chat function

    // Initialize Speech Recognition
    useEffect(() => {
        if (typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition)) {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            recognitionRef.current = new SpeechRecognition();
            recognitionRef.current.continuous = false; // Stop automatically or manually
            recognitionRef.current.interimResults = true; // Show partial results for feedback
            recognitionRef.current.lang = 'th-TH'; // Thai Language
            addLog('Speech API Initialized');

            recognitionRef.current.onstart = () => {
                setIsListening(true);
                setVoiceTranscript('กำลังฟัง...'); // "Listening..."
                playEarcon('capture'); // Sound: Start listening
                hapticRef.current?.trigger(1);
                addLog('Started listening...');
            };

            recognitionRef.current.onend = () => {
                setIsListening(false);
                addLog('Stopped listening.');
            };

            recognitionRef.current.onresult = (event) => {
                // Show interim results for feedback
                let interimTranscript = '';
                let finalTranscript = '';

                for (let i = 0; i < event.results.length; i++) {
                    if (event.results[i].isFinal) {
                        finalTranscript += event.results[i][0].transcript;
                    } else {
                        interimTranscript += event.results[i][0].transcript;
                    }
                }

                // Show what was heard
                if (interimTranscript) {
                    setVoiceTranscript(`🎤 ${interimTranscript}`);
                }

                // If final, send to AI (text only, no image)
                if (finalTranscript && finalTranscript.trim().length > 0) {
                    setVoiceTranscript(`✅ ${finalTranscript}`);
                    addLog(`Recognized: "${finalTranscript}"`);
                    // Use askTextOnly for voice chat (no image)
                    if (askTextOnlyRef.current) {
                        askTextOnlyRef.current(finalTranscript);
                    }
                }
            };

            recognitionRef.current.onerror = (event) => {
                // Ignore benign errors (aborted = user stopped, no-speech = silence)
                if (event.error === 'aborted' || event.error === 'no-speech') {
                    setIsListening(false);
                    setVoiceTranscript('(ไม่ได้ยินเสียง)');
                    return;
                }

                console.error("Speech error:", event.error);
                setIsListening(false);
                setVoiceTranscript(`⚠️ Error: ${event.error}`);
                if (event.error === 'not-allowed') {
                    alert("Microphone access denied. Please allow permission.");
                }
                addLog(`Voice Error: ${event.error}`);
            };
        } else {
            addLog('Speech API not supported');
        }
    }, []);

    // Hold-to-Talk Handlers
    const startListening = useCallback((e) => {
        e?.preventDefault(); // Prevent ghost clicks
        if (!recognitionRef.current) {
            alert("Voice not supported on this browser.");
            return;
        }
        if (isListening) return;

        try {
            recognitionRef.current.start();
        } catch (error) {
            console.error("Mic start error:", error);
        }
    }, [isListening]);

    const stopListening = useCallback((e) => {
        e?.preventDefault();
        if (!recognitionRef.current || !isListening) return;

        try {
            recognitionRef.current.stop();
            // Clear transcript after a short delay if nothing was heard
            setTimeout(() => {
                setVoiceTranscript('');
            }, 2000);
        } catch (error) {
            console.error("Mic stop error:", error);
        }
    }, [isListening]);

    // Capture single image and send to Groq API (Llama 3.2 Vision)
    // Now accepts optional 'customPrompt' from voice input
    const captureAndAsk = useCallback(async (customPrompt = null) => {
        if (!aiReady || aiStatus === 'thinking') return;

        // API Key from Vercel Environment Variable
        const apiKey = process.env.NEXT_PUBLIC_GROQ_API_KEY;

        if (!apiKey) {
            addLog('Error: API Key missing!');
            alert('API Key Missing!');
            return;
        }

        try {
            // 1. Set status and play sound
            setAiStatus('capturing');
            playEarcon('capture');
            hapticRef.current?.trigger(2);
            addLog('Capturing image...');

            // 2. Capture image from video
            if (!myVideoRef.current) {
                addLog('Error: No video stream');
                setAiStatus('idle');
                return;
            }

            const canvas = document.createElement('canvas');
            const video = myVideoRef.current;
            canvas.width = video.videoWidth || 1280;
            canvas.height = video.videoHeight || 720;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const imageBase64 = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];

            // 3. Add user message to chat
            const imageDataUrl = `data:image/jpeg;base64,${imageBase64}`;
            const userQuestion = customPrompt && typeof customPrompt === 'string'
                ? `(พูด): "${customPrompt}"`
                : 'ช่วยบรรยายภาพนี้ให้หน่อย';

            setAiMessages(prev => [...prev, { role: 'user', content: userQuestion, image: imageDataUrl }]);

            // 4. Call Groq API (Llama 3.2 Vision)
            setAiStatus('thinking');
            addLog('Sending to Groq (Llama 3.2)...');

            // API Key from Vercel Environment Variable
            const groqApiKey = process.env.NEXT_PUBLIC_GROQ_API_KEY;

            // Construct Thai System Prompt
            const systemPrompt = `
คุณคือผู้ช่วยคนตาบอดที่ฉลาดและเป็นมิตร "ตอบเป็นภาษาไทยเท่านั้น"
หน้าที่ของคุณคือ:
1. ตอบคำถามของผู้ใช้ หรือบรรยายสิ่งที่เห็นในภาพให้เข้าใจง่าย
2. **สำคัญมาก**: ถ้าภาพไม่ชัด มืดเกินไป หรือวัตถุหลุดเฟรม คุณ **ต้องแนะนำวิธีถ่ายใหม่** ให้ผู้ใช้รู้ตัว เช่น:
   - "ภาพมืดไปครับ ลองเปิดไฟ"
   - "ขยับกล้องถอยหลังหน่อยครับ เห็นแค่มือ"
   - "กล้องสั่นครับ ลองถ่ายใหม่อีกที"

ถ้าภาพชัดเจนดี ให้ตอบคำถามตามปกติ สั้นกระชับ ไม่เยิ่นเย้อ
            `.trim();

            const userTextPrompt = customPrompt && typeof customPrompt === 'string'
                ? customPrompt
                : "ช่วยดูรูปนี้ให้หน่อยครับ ว่าคืออะไร หรือมีอะไรน่าสนใจบ้าง? ตอบเป็นภาษาไทยนะ";

            const response = await fetch(
                'https://api.groq.com/openai/v1/chat/completions',
                {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${groqApiKey}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        model: "meta-llama/llama-4-maverick-17b-128e-instruct", // User specific request
                        messages: [
                            {
                                role: "system",
                                content: systemPrompt
                            },
                            {
                                role: "user",
                                content: [
                                    { type: "text", text: userTextPrompt },
                                    { type: "image_url", image_url: { url: `data:image/jpeg;base64,${imageBase64}` } }
                                ]
                            }
                        ],
                        max_tokens: 500,
                        temperature: 0.5
                    })
                }
            );

            const data = await response.json();
            addLog('Response received!');

            // 5. Handle response
            if (data.error) {
                addLog(`API Error: ${data.error.message || JSON.stringify(data.error)}`);
                setAiMessages(prev => [...prev, { role: 'ai', content: `ขอโทษครับ เกิดข้อผิดพลาด: ${data.error.message}` }]);
            } else if (data.choices && data.choices[0]?.message?.content) {
                const aiText = data.choices[0].message.content;
                addLog('AI responded!');
                setAiMessages(prev => [...prev, { role: 'ai', content: aiText }]);
                playEarcon('success');
                hapticRef.current?.trigger(1);
            } else {
                addLog('No response data');
                setAiMessages(prev => [...prev, { role: 'ai', content: 'ขอโทษครับ AI ไม่ตอบกลับ ลองใหม่อีกทีนะครับ' }]);
            }

        } catch (error) {
            console.error('AI Request Error:', error);
            addLog(`Error: ${error.message}`);
            setAiStatus('idle');
            setAiMessages(prev => [...prev, { role: 'ai', content: 'เกิดข้อผิดพลาดในการเชื่อมต่อครับ' }]);
        } finally {
            setAiStatus('idle');
        }
    }, [aiReady, aiStatus, addLog, playEarcon]);

    // Keep ref updated so onresult callback can access latest function
    captureAndAskRef.current = captureAndAsk;

    // Text-only chat function (no image capture) 
    const askTextOnly = useCallback(async (userText) => {
        if (!aiReady || aiStatus === 'thinking') return;
        if (!userText || userText.trim().length === 0) return;
        // API Key from Vercel Environment Variable
        const groqApiKey = process.env.NEXT_PUBLIC_GROQ_API_KEY;

        try {
            // 1. Add user message to chat
            setAiMessages(prev => [...prev, { role: 'user', content: `🎤 ${userText}` }]);

            // 2. Set status
            setAiStatus('thinking');
            playEarcon('capture');
            hapticRef.current?.trigger(1);
            addLog(`Text Chat: "${userText}"`);

            // 3. Thai System Prompt
            const systemPrompt = `
คุณคือผู้ช่วยคนตาบอดที่ฉลาดและเป็นมิตร "ตอบเป็นภาษาไทยเท่านั้น"
ตอบคำถามอย่างสั้นกระชับ เป็นกันเอง และเข้าใจง่าย
            `.trim();

            // 4. Call Groq API (Text only, no image)
            const response = await fetch(
                'https://api.groq.com/openai/v1/chat/completions',
                {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${groqApiKey}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        model: "meta-llama/llama-4-maverick-17b-128e-instruct",
                        messages: [
                            { role: "system", content: systemPrompt },
                            { role: "user", content: userText }
                        ],
                        max_tokens: 500,
                        temperature: 0.7
                    })
                }
            );

            const data = await response.json();
            addLog('Response received!');

            // 5. Handle response
            if (data.error) {
                addLog(`API Error: ${data.error.message}`);
                setAiMessages(prev => [...prev, { role: 'ai', content: `ขอโทษครับ: ${data.error.message}` }]);
            } else if (data.choices && data.choices[0]?.message?.content) {
                const aiText = data.choices[0].message.content;
                addLog('AI responded!');
                setAiMessages(prev => [...prev, { role: 'ai', content: aiText }]);
                playEarcon('success');
                hapticRef.current?.trigger(1);
            } else {
                setAiMessages(prev => [...prev, { role: 'ai', content: 'ขอโทษครับ ไม่ได้รับคำตอบ' }]);
            }
        } catch (error) {
            console.error('Text Chat Error:', error);
            addLog(`Error: ${error.message}`);
            setAiMessages(prev => [...prev, { role: 'ai', content: 'เกิดข้อผิดพลาดในการเชื่อมต่อครับ' }]);
        } finally {
            setAiStatus('idle');
        }
    }, [aiReady, aiStatus, addLog, playEarcon]);

    // Keep askTextOnly ref updated for voice callback
    askTextOnlyRef.current = askTextOnly;

    const setupPusher = useCallback((myPeerId) => {
        if (pusherRef.current) return;

        const pusher = createPusherClient(myPeerId, 'blind');
        pusherRef.current = pusher;

        // Subscribe to my private channel
        const myChannel = pusher.subscribe(`private-user-${myPeerId}`);
        myChannel.bind('volunteer-ready', ({ volunteerId }) => {
            if (fallbackTimeoutRef.current) clearTimeout(fallbackTimeoutRef.current); // Clear fallback
            callVolunteerRef.current(volunteerId, hapticRef);
        });

        // Listen for end-call event
        myChannel.bind('end-call', () => {
            console.log('Received end-call from volunteer');
            endCall(false); // Don't notify back to avoid loop
        });

        // Listen for rejection (Busy/Declined)
        myChannel.bind('call-rejected', () => {
            console.log('Volunteer rejected/busy, trying next in 1s...');
            if (fallbackTimeoutRef.current) clearTimeout(fallbackTimeoutRef.current);
            // Wait 1s before retrying to ensure state is clean
            setTimeout(() => {
                requestHelp(myPeerId);
            }, 1000);
        });

        // Subscribe to presence to get volunteer list
        const presenceChannel = pusher.subscribe('presence-volunteers');
        presenceChannel.bind('pusher:subscription_succeeded', (members) => {
            volunteersRef.current = [];
            members.each((member) => {
                volunteersRef.current.push(member.id);
            });
            console.log('Volunteers online:', volunteersRef.current.length);

            // Check if we were waiting to call
            if (waitingForVolunteersRef.current) {
                console.log('Presence ready, starting pending call...');
                waitingForVolunteersRef.current = false;
                requestHelp(myPeerId);
            }
        });
        presenceChannel.bind('pusher:member_added', (member) => {
            if (!volunteersRef.current.includes(member.id)) {
                volunteersRef.current.push(member.id);
            }
        });
        presenceChannel.bind('pusher:member_removed', (member) => {
            volunteersRef.current = volunteersRef.current.filter(id => id !== member.id);
        });
    }, [endCall]); // Removed requestHelp from dep array (cyclic), relying on ref closure or hoisting if possible. 
    // In React Component, all consts in body are visible if defined before. We moved requestHelp UP.

    const startCall = async () => {
        setStatus('initializing');
        triedVolunteersRef.current = []; // Reset tried list for new call session
        waitingForVolunteersRef.current = true; // Wait for presence
        hapticRef.current?.trigger(1, 40);
        playBeepSound(0.001, true);

        try {
            // 1. Get User Media FIRST
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
                audio: true
            });
            streamRef.current = stream;

            if (myVideoRef.current) {
                myVideoRef.current.srcObject = stream;
                myVideoRef.current.onloadedmetadata = () => myVideoRef.current.play().catch(console.error);
            }

            // 2. Reuse Peer Connection if valid
            if (peerRef.current && !peerRef.current.destroyed && peerRef.current.id) {
                console.log('Reusing existing Peer connection:', peerRef.current.id);
                // We assume Pusher is already set up if Peer is alive
                setStatus('waiting');
                waitingForVolunteersRef.current = false; // Don't wait, assume ready
                requestHelp(peerRef.current.id);
                return;
            }

            console.log('Creating NEW Peer connection...');
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
                // requestHelp(id) removed here. Triggered by subscription_succeeded
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
                // If ID is taken or fatal error, maybe reset status
                if (e.type === 'peer-unavailable' || e.type === 'network' || e.type === 'server-error') {
                    // Optional: handle specific fatal errors
                }

                // Don't necessarily go to 'idle' on every error, but for critical ones yes.
                // setStatus('idle'); 
            });

        } catch (err) {
            console.error('Camera Error:', err);
            setStatus('idle');
            alert('Camera Error: ' + err.message);
        }
    };



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

            {/* Top Navigation Bar with Mode Toggle */}
            <div className="absolute top-0 inset-x-0 z-50 p-6 flex justify-between items-start pointer-events-none">
                {/* Back Button */}
                <Link href="/" className="pointer-events-auto flex items-center gap-2 bg-black/60 hover:bg-black/80 text-white px-6 py-3 rounded-full backdrop-blur-md transition-all border border-white/20 shadow-lg" aria-label="Back to Home">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
                    <span className="font-bold text-lg hidden sm:inline">Back</span>
                </Link>

                {/* Mode Toggle */}
                <div className="pointer-events-auto bg-zinc-900/80 backdrop-blur-md p-1 rounded-full border border-white/10 shadow-2xl flex relative">
                    {/* Active Indicator Background */}
                    <div className={`absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-full bg-white/10 transition-all duration-300 ease-spring ${mode === 'volunteer' ? 'left-1' : 'left-[calc(50%+2px)]'}`}></div>

                    <button
                        onClick={() => {
                            if (mode !== 'volunteer') {
                                setMode('volunteer');
                                hapticRef.current?.trigger(1);
                                setLogs(prev => [...prev, 'Switched to Volunteer Mode']);

                                // Cleanup AI Resources
                                if (aiStreamRef.current) {
                                    aiStreamRef.current.getTracks().forEach(t => t.stop());
                                    aiStreamRef.current = null;
                                }
                                setAiReady(false); // Reset ready state
                                setAiMessages([]); // Clear chat
                            }
                        }}
                        className={`relative z-10 px-6 py-2 rounded-full font-bold text-sm transition-colors ${mode === 'volunteer' ? 'text-amber-400' : 'text-zinc-400 hover:text-white'}`}
                        aria-pressed={mode === 'volunteer'}
                        aria-label="Switch to Volunteer Mode"
                    >
                        Volunteer
                    </button>
                    <button
                        onClick={() => {
                            if (mode !== 'ai') {
                                setMode('ai');
                                hapticRef.current?.trigger(1);
                                setLogs(prev => [...prev, 'Switched to AI Mode']);
                                // Stop volunteer call if active
                                if (status !== 'idle') endCall();
                                // Initialize AI Mode (request permissions + connect)
                                initAiMode();
                            }
                        }}
                        className={`relative z-10 px-6 py-2 rounded-full font-bold text-sm transition-colors ${mode === 'ai' ? 'text-sky-400' : 'text-zinc-400 hover:text-white'}`}
                        aria-pressed={mode === 'ai'}
                        aria-label="Switch to AI Assistant Mode"
                    >
                        AI Assistant
                    </button>
                </div>
            </div>

            {/* ==================== AI MODE UI (ACCESSIBLE) ==================== */}
            {mode === 'ai' && (
                <main
                    className="w-full h-full flex flex-col relative animate-in fade-in zoom-in duration-300"
                    aria-label="AI Visual Assistant"
                >
                    {/* Live Status Announcer (Hidden visually, read by VoiceOver) */}
                    <div className="sr-only" aria-live="assertive" aria-atomic="true">
                        {!aiReady ? "กำลังขออนุญาตใช้กล้อง" :
                            aiStatus === 'capturing' ? "กำลังถ่ายภาพ" :
                                aiStatus === 'thinking' ? "AI กำลังวิเคราะห์ รอสักครู่" :
                                    aiMessages.length > 0 && aiMessages[aiMessages.length - 1].role === 'ai' ? `AI ตอบกลับว่า: ${aiMessages[aiMessages.length - 1].content}` : ""}
                    </div>

                    {/* Camera View (Top half) - Decorative mainly, but good for partial sighted users */}
                    <div className="relative h-1/3 bg-black" aria-hidden="true">
                        <video
                            ref={myVideoRef}
                            autoPlay
                            muted
                            playsInline
                            className="absolute inset-0 w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-gradient-to-b from-black/40 to-transparent"></div>

                        {/* Status Badge (Visual Only) */}
                        <div className="absolute top-4 left-0 right-0 text-center">
                            <p className="text-zinc-500 text-[10px] mb-1">Groq Llama 4 Maverick (Experimental)</p>
                            <span className={`inline-block px-4 py-1 rounded-full text-sm font-bold shadow-md transition-colors ${!aiReady ? 'bg-zinc-800 text-zinc-400' :
                                aiStatus === 'capturing' ? 'bg-amber-500 text-black' :
                                    aiStatus === 'thinking' ? 'bg-amber-500 text-black animate-pulse' :
                                        'bg-green-500 text-black'
                                }`}>
                                {!aiReady ? "กำลังเริ่มระบบ..." :
                                    aiStatus === 'idle' ? "พร้อมถ่ายภาพ" :
                                        aiStatus === 'capturing' ? "กำลังถ่าย..." :
                                            aiStatus === 'thinking' ? "กำลังคิด..." : "พร้อม"}
                            </span>
                        </div>

                        {/* Voice Transcript Overlay */}
                        {voiceTranscript && (
                            <div className="absolute bottom-4 left-4 right-4 bg-black/70 backdrop-blur-sm p-3 rounded-lg text-center border border-white/20">
                                <p className={`text-lg font-medium ${isListening ? 'text-red-400 animate-pulse' : 'text-white'}`}>
                                    {voiceTranscript}
                                </p>
                            </div>
                        )}
                    </div>

                    {/* Chat Messages Area (Main Content) */}
                    <section
                        className="flex-1 overflow-y-auto p-4 space-y-4 bg-zinc-900"
                        aria-label="Conversation History"
                        tabIndex={0} // Make scrollable area focusable
                        ref={(el) => {
                            // Auo-scroll and focus new messages
                            if (el && aiMessages.length > 0) {
                                el.scrollTop = el.scrollHeight;
                            }
                        }}
                    >
                        {aiMessages.length === 0 && (
                            <div className="flex flex-col items-center justify-center h-full text-zinc-500 text-center p-6">
                                <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mb-4 opacity-50"><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><path d="M12 17h.01" /></svg>
                                <h3 className="text-xl font-bold text-white mb-2">แตะเพื่อมองโลก</h3>
                                <p className="text-sm">กดปุ่มกล้องเพื่อถ่ายภาพ <br /> หรือ <b>กดปุ่มไมค์ค้าง</b> เพื่อพูดถาม</p>
                            </div>
                        )}

                        <ul className="space-y-6">
                            {aiMessages.map((msg, i) => (
                                <li key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                                    {/* User (Image) */}
                                    {msg.role === 'user' && msg.image && (
                                        <div className="bg-zinc-800 rounded-2xl rounded-br-sm p-1 max-w-[85%] border border-zinc-700">
                                            <img
                                                src={msg.image}
                                                alt={`Captured image ${i / 2 + 1}`}
                                                className="rounded-xl max-h-48 w-auto object-contain bg-black"
                                            />
                                            <p className="sr-only">You sent a photo</p>
                                        </div>
                                    )}

                                    {/* AI Response */}
                                    {msg.role === 'ai' && (
                                        <div
                                            className={`mt-2 rounded-2xl rounded-bl-sm p-5 max-w-[95%] shadow-lg ${msg.content.startsWith('Error') ? 'bg-red-900/80 text-white' : 'bg-zinc-800 text-white border border-zinc-700'
                                                }`}
                                            tabIndex={0} // Allow focus to read specifically
                                            ref={(el) => {
                                                // Auto focus latest AI message
                                                if (el && i === aiMessages.length - 1) {
                                                    el.focus();
                                                }
                                            }}
                                        >
                                            <p className="text-base leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                                            <p className="sr-only">End of response</p>
                                        </div>
                                    )}
                                </li>
                            ))}
                        </ul>
                    </section>

                    {/* Bottom Control Bar */}
                    <div className="bg-black border-t border-zinc-800 p-6 flex items-center justify-around pb-10" role="group" aria-label="Controls">
                        {/* Clear Chat Button */}
                        <button
                            onClick={() => {
                                setAiMessages([]);
                                hapticRef.current?.trigger(1);
                            }}
                            className="p-4 rounded-full bg-zinc-900 text-zinc-400 border border-zinc-800 active:bg-zinc-800 focus:ring-2 focus:ring-white focus:outline-none"
                            aria-label="ล้างแชทเก่า"
                        >
                            <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /></svg>
                        </button>

                        {/* Capture Button (Center) */}
                        <button
                            disabled={!aiReady || aiStatus === 'thinking' || isListening}
                            onClick={() => captureAndAsk()}
                            className={`
                                relative w-24 h-24 rounded-full flex items-center justify-center transition-all duration-200 shadow-xl
                                focus:ring-4 focus:ring-sky-300 focus:outline-none 
                                ${(!aiReady || aiStatus === 'thinking') ? 'bg-zinc-800 opacity-50 cursor-not-allowed' : 'bg-sky-500 hover:bg-sky-400 active:scale-95 active:bg-sky-600'}
                            `}
                            aria-label={aiStatus === 'thinking' ? "กำลังคิด..." : "ถ่ายภาพและให้ AI บรรยาย"}
                            aria-busy={aiStatus === 'thinking'}
                        >
                            {aiStatus === 'thinking' ? (
                                <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white animate-spin"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
                            ) : (
                                <div className="flex flex-col items-center">
                                    <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" /><circle cx="12" cy="13" r="3" /></svg>
                                    <span className="sr-only">Snap</span>
                                </div>
                            )}
                        </button>

                        {/* Voice Input Button (Right) - Hold to Talk */}
                        <button
                            onMouseDown={startListening}
                            onMouseUp={stopListening}
                            onMouseLeave={stopListening}
                            onTouchStart={startListening}
                            onTouchEnd={stopListening}
                            className={`p-4 rounded-full border active:bg-zinc-800 focus:ring-2 focus:ring-white focus:outline-none transition-all duration-150 ${isListening ? 'bg-red-600 text-white border-red-500 scale-110 shadow-[0_0_15px_rgba(220,38,38,0.7)]' : 'bg-zinc-900 text-zinc-400 border-zinc-800'
                                }`}
                            aria-label="กดค้างเพื่อพูด (ปล่อยเพื่อส่ง)"
                            aria-pressed={isListening}
                        >
                            {isListening ? (
                                <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-pulse"><line x1="1" y1="1" x2="23" y2="23"></line><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"></path><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>
                            ) : (
                                <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>
                            )}
                        </button>
                    </div>

                    {/* Debug Log (Simplified) */}
                    {logs.length > 0 && (
                        <div className="absolute bottom-32 left-4 right-4 bg-black/90 p-3 rounded-lg border border-white/10 max-h-24 overflow-y-auto pointer-events-none" aria-hidden="true">
                            <div className="font-mono text-[10px] space-y-1">
                                {logs.slice(-3).map((log, i) => (
                                    <p key={i} className="text-zinc-400 truncate">{log}</p>
                                ))}
                            </div>
                        </div>
                    )}
                </main>
            )}

            {/* ==================== VOLUNTEER MODE UI ==================== */}
            {mode === 'volunteer' && (
                <>




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
                </>
            )
            }
        </div >
    );
}

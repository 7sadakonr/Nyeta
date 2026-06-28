'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import Link from 'next/link';
import HapticFeedback from '@/components/HapticFeedback';
import DetectionOverlay from '@/components/DetectionOverlay';
import { useWakeLock } from '@/hooks/useWakeLock';
import { OCR_PROMPT } from '@/lib/visionPrompts';
import { callGroqVision, captureFrameFromVideo, GROQ_MODEL } from '@/lib/groqVision';
import { formatCurrencySpeech, formatCurrencyDisplay } from '@/lib/currencyUtils';
import { detectCurrencyWithGroq } from '@/lib/currencyGroq';
import { analyzePageAlignment, preloadPageScanner } from '@/lib/pageEdgeDetection';
import { speakText, stopSpeaking } from '@/lib/speechChunks';
// useObjectDetector is dynamically imported to avoid SSR issues with TensorFlow.js

const MODE_LABELS = {
    assistant: 'โหมดผู้ช่วย AI',
    currency: 'โหมดดูสกุลเงิน',
    reader: 'โหมดอ่านเอกสาร',
};

const MODE_STORAGE_KEY = 'nyeta-blind-mode';
const VALID_MODES = ['assistant', 'currency', 'reader'];

function readStoredMode() {
    if (typeof window === 'undefined') return 'assistant';
    try {
        const stored = localStorage.getItem(MODE_STORAGE_KEY);
        if (VALID_MODES.includes(stored)) return stored;
    } catch {
        // ignore storage errors (private browsing, etc.)
    }
    return 'assistant';
}

export default function BlindPage() {
    const { isSupported: wakeLockSupported, request: requestWakeLock, release: releaseWakeLock } = useWakeLock();

    // App mode: assistant | currency | reader
    const [mode, setMode] = useState('assistant');
    const [modeAnnouncement, setModeAnnouncement] = useState('');

    // AI Assistant State (Simple "Be My AI" Style)
    const [aiStatus, setAiStatus] = useState('idle'); // 'idle', 'capturing', 'thinking'
    const [aiReady, setAiReady] = useState(false); // true when camera is ready
    const [aiMessages, setAiMessages] = useState([]); // Chat history: [{role: 'user'|'ai', content: '', image?: ''}]
    const aiStreamRef = useRef(null);

    // Object Detection State (TensorFlow.js - Simple Interval Approach)
    const [objectDetectorEnabled, setObjectDetectorEnabled] = useState(false);
    const [detectedObjects, setDetectedObjects] = useState(''); // Text for VoiceOver
    const [guidanceText, setGuidanceText] = useState(''); // Direction guidance text
    const [cocoBoxes, setCocoBoxes] = useState([]);
    const [pageBounds, setPageBounds] = useState(null);
    const [pageCorners, setPageCorners] = useState(null);
    const [readerGuidance, setReaderGuidance] = useState('');
    const [readerAligned, setReaderAligned] = useState(false);
    const [currencyBounds, setCurrencyBounds] = useState(null);
    const detectorModelRef = useRef(null);
    const detectionIntervalRef = useRef(null);

    // Currency mode state
    const [currencyResult, setCurrencyResult] = useState(null);
    const [currencyScanning, setCurrencyScanning] = useState(false);
    const [currencyMonitoring, setCurrencyMonitoring] = useState(false);
    const [currencyHint, setCurrencyHint] = useState('');
    const currencyBusyRef = useRef(false);
    const lastSpokenMoneyRef = useRef('');
    const currencyIntervalRef = useRef(null);
    const stableDetectionRef = useRef({ key: '', count: 0 });
    const notFoundCountRef = useRef(0);
    const currencyErrorCountRef = useRef(0);
    const currencySkipUntilRef = useRef(0);
    const modeRef = useRef(mode);

    // Reader mode state
    const [docText, setDocText] = useState('');
    const [isReading, setIsReading] = useState(false);
    const lastSpokenPageRef = useRef('');
    const alignedCountRef = useRef(0);
    const pageSeenCountRef = useRef(0);
    const pageOverlayActiveRef = useRef(false);
    const scanBusyRef = useRef(false);
    const autoCaptureFiredRef = useRef(false);
    const readDocumentRef = useRef(null);
    const aiStatusRef = useRef('idle');
    const isReadingRef = useRef(false);

    const myVideoRef = useRef(null);
    const cameraContainerRef = useRef(null);
    const hapticRef = useRef(null);
    const lastSpokenRef = useRef('');
    const recognitionRef = useRef(null);
    const captureAndAskRef = useRef(null);
    const askTextOnlyRef = useRef(null);
    const earconCtxRef = useRef(null);
    const tabVisibleRef = useRef(true);

    useEffect(() => {
        initAiMode();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        const stored = readStoredMode();
        if (stored !== 'assistant') {
            setMode(stored);
        }
    }, []);

    useEffect(() => {
        modeRef.current = mode;
    }, [mode]);

    useEffect(() => {
        aiStatusRef.current = aiStatus;
    }, [aiStatus]);

    useEffect(() => {
        isReadingRef.current = isReading;
    }, [isReading]);

    // Load TensorFlow.js model and run detection loop (all modes)
    // Model is loaded once and reused across mode switches to prevent memory leaks
    // that caused the mobile tab to crash and reset back to the assistant view.
    useEffect(() => {
        if (typeof window === 'undefined') return;
        if (!objectDetectorEnabled || !aiReady) return;
        if (!myVideoRef.current) return;

        let isMounted = true;
        tabVisibleRef.current = document.visibilityState === 'visible';

        const handleVisibilityChange = () => {
            tabVisibleRef.current = document.visibilityState === 'visible';
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);

        const startDetection = async () => {
            try {
                if (!detectorModelRef.current) {
                    if (modeRef.current === 'assistant') {
                        setGuidanceText('กำลังโหลดโมเดล AI...');
                    }

                    const tf = await import('@tensorflow/tfjs');
                    const cocoSsd = await import('@tensorflow-models/coco-ssd');

                    const model = await cocoSsd.load();
                    detectorModelRef.current = model;
                }

                if (!isMounted) return;
                if (modeRef.current === 'assistant') {
                    setGuidanceText('โมเดลพร้อมแล้ว กำลังสแกน...');
                }

                detectionIntervalRef.current = setInterval(async () => {
                    if (!isMounted || !myVideoRef.current || !detectorModelRef.current) return;

                    // Pause detection when tab is hidden or not in assistant mode.
                    if (!tabVisibleRef.current || modeRef.current !== 'assistant') return;

                    const video = myVideoRef.current;
                    if (video.readyState < 2) return;

                    try {
                        const predictions = await detectorModelRef.current.detect(video);

                        if (!isMounted || !tabVisibleRef.current || modeRef.current !== 'assistant') return;

                        const boxes = predictions
                            .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
                            .map((p) => ({
                                class: p.class,
                                bbox: p.bbox,
                                score: p.score,
                            }));
                        setCocoBoxes(boxes);

                        if (predictions.length > 0) {
                            // Build object list text
                            const objectNames = predictions
                                .slice(0, 3) // Max 3 objects
                                .map(p => p.class)
                                .join(', ');
                            setDetectedObjects(`เจอ: ${objectNames}`);

                            // Calculate guidance for closest object to center
                            const videoWidth = video.videoWidth;
                            const videoHeight = video.videoHeight;
                            const frameCenterX = videoWidth / 2;
                            const frameCenterY = videoHeight / 2;

                            const closest = predictions
                                .map(p => {
                                    const [x, y, w, h] = p.bbox;
                                    const objCenterX = x + w / 2;
                                    const objCenterY = y + h / 2;
                                    const distance = Math.sqrt(
                                        Math.pow(objCenterX - frameCenterX, 2) +
                                        Math.pow(objCenterY - frameCenterY, 2)
                                    );
                                    return { ...p, objCenterX, objCenterY, distance };
                                })
                                .sort((a, b) => a.distance - b.distance)[0];

                            // Direction guidance
                            const toleranceX = videoWidth * 0.2;
                            const toleranceY = videoHeight * 0.2;
                            const diffX = closest.objCenterX - frameCenterX;
                            const diffY = closest.objCenterY - frameCenterY;

                            let direction = '';
                            if (Math.abs(diffX) < toleranceX && Math.abs(diffY) < toleranceY) {
                                direction = '✅ อยู่ตรงกลางแล้ว พร้อมถ่าย!';
                            } else {
                                direction = '📍 เลื่อนกล้อง';
                                if (diffX < -toleranceX) direction += ' ไปทางซ้าย';
                                else if (diffX > toleranceX) direction += ' ไปทางขวา';
                                if (diffY < -toleranceY) direction += ' ขึ้นบน';
                                else if (diffY > toleranceY) direction += ' ลงล่าง';
                            }
                            setGuidanceText(direction);
                        } else {
                            setDetectedObjects('');
                            setGuidanceText('🔍 ไม่เจอวัตถุ กวาดกล้องช้าๆ');
                        }
                    } catch (err) {
                        console.error('Detection error:', err);
                    }
                }, 1000);

            } catch (error) {
                console.error('Failed to load COCO-SSD:', error);
                if (modeRef.current === 'assistant') {
                    setGuidanceText('ไม่สามารถโหลดโมเดลได้');
                }
            }
        };

        startDetection();

        return () => {
            isMounted = false;
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            if (detectionIntervalRef.current) {
                clearInterval(detectionIntervalRef.current);
            }
            setCocoBoxes([]);
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [objectDetectorEnabled, aiReady]);

    const [logs, setLogs] = useState([]);
    const addLog = useCallback((msg) => {
        console.log(msg);
        // setLogs(prev => [...prev.slice(-8), msg]); // Disabled for production
    }, []);

    // ================== AI ASSISTANT LOGIC (Simple "Be My AI" Style) ==================

    // Play Earcon (Short sound effect for status feedback)
    const playEarcon = useCallback((type) => {
        try {
            if (!earconCtxRef.current) {
                const AudioCtx = window.AudioContext || window.webkitAudioContext;
                earconCtxRef.current = new AudioCtx();
            }
            const ctx = earconCtxRef.current;
            if (ctx.state === 'suspended') {
                ctx.resume().catch(console.error);
            }

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
            setObjectDetectorEnabled(true); // Enable object detection when camera is ready
            addLog('Camera ready! Object detection active.');

        } catch (err) {
            console.error('AI Init Error:', err);
            addLog('Permission denied or error!');
            alert('Camera permission denied. Please allow access.');
        }
    }, [addLog]);

    // State for Voice Input
    const [isListening, setIsListening] = useState(false);
    const [voiceTranscript, setVoiceTranscript] = useState(''); // To show on UI

    const switchMode = useCallback((newMode) => {
        if (newMode === mode) return;

        stopSpeaking();
        if (currencyIntervalRef.current) {
            clearInterval(currencyIntervalRef.current);
            currencyIntervalRef.current = null;
        }
        currencyBusyRef.current = false;
        setCurrencyScanning(false);
        setCurrencyMonitoring(false);

        if (recognitionRef.current) {
            try {
                recognitionRef.current.stop();
            } catch {
                // ignore
            }
        }

        hapticRef.current?.trigger(1);
        setMode(newMode);
        try {
            localStorage.setItem(MODE_STORAGE_KEY, newMode);
        } catch {
            // ignore storage errors
        }
        setModeAnnouncement(MODE_LABELS[newMode]);
        setGuidanceText('');
        setDetectedObjects('');
        setCocoBoxes([]);
        setPageBounds(null);
        setPageCorners(null);
        setReaderGuidance('');
        setReaderAligned(false);
        setCurrencyBounds(null);
        setCurrencyHint('');
        setDocText('');
        lastSpokenPageRef.current = '';
        alignedCountRef.current = 0;
        pageSeenCountRef.current = 0;
        pageOverlayActiveRef.current = false;
        autoCaptureFiredRef.current = false;
        lastSpokenRef.current = '';
        stableDetectionRef.current = { key: '', count: 0 };
        notFoundCountRef.current = 0;
        currencyErrorCountRef.current = 0;
        currencySkipUntilRef.current = 0;
        setVoiceTranscript('');
        setIsReading(false);
    }, [mode]);

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
        e?.preventDefault();
        if (mode !== 'assistant') return;
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
    }, [isListening, mode]);

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
    }, [isListening, mode]);

    // Auto-speak Object Detection Guidance (using Web Speech API) - assistant mode only
    useEffect(() => {
        if (mode !== 'assistant') return;
        if (!objectDetectorEnabled || !guidanceText || isListening || aiStatus === 'thinking') return;
        if (guidanceText === lastSpokenRef.current) return; // Don't repeat same message

        if ('speechSynthesis' in window) {
            speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(guidanceText.replace(/[\u2705\ud83d\udd0d\ud83d\udccd]/g, '')); // Remove emojis
            utterance.lang = 'th-TH';
            utterance.rate = 1.2;
            speechSynthesis.speak(utterance);
            lastSpokenRef.current = guidanceText;
        }
    }, [guidanceText, objectDetectorEnabled, isListening, aiStatus, mode]);

    // Currency mode: Groq vision scan
    useEffect(() => {
        if (mode !== 'currency' || !aiReady) {
            if (currencyIntervalRef.current) {
                clearInterval(currencyIntervalRef.current);
                currencyIntervalRef.current = null;
            }
            currencyBusyRef.current = false;
            setCurrencyScanning(false);
            setCurrencyMonitoring(false);
            stableDetectionRef.current = { key: '', count: 0 };
            return;
        }

        setCurrencyMonitoring(true);
        const apiKey = process.env.NEXT_PUBLIC_GROQ_API_KEY;

        const scanCurrency = async () => {
            if (currencyBusyRef.current || modeRef.current !== 'currency') return;
            if (Date.now() < currencySkipUntilRef.current) return;
            if (!myVideoRef.current || myVideoRef.current.readyState < 2) return;

            if (!apiKey) {
                setCurrencyHint('ไม่พบ NEXT_PUBLIC_GROQ_API_KEY ใน .env.local');
                return;
            }

            currencyBusyRef.current = true;
            setCurrencyScanning(true);

            try {
                const { parsed } = await detectCurrencyWithGroq(myVideoRef.current, apiKey);
                const speechKey = parsed ? `${parsed.type}-${parsed.value}` : 'none';
                currencyErrorCountRef.current = 0;

                if (parsed) {
                    notFoundCountRef.current = 0;

                    if (speechKey === stableDetectionRef.current.key) {
                        stableDetectionRef.current.count += 1;
                    } else {
                        stableDetectionRef.current = { key: speechKey, count: 1 };
                    }

                    const isStable = stableDetectionRef.current.count >= 2;

                    if (isStable) {
                        setCurrencyBounds(null);
                        setCurrencyResult({ ...parsed, source: 'groq' });
                        setCurrencyHint('');

                        if (speechKey !== lastSpokenMoneyRef.current) {
                            const speechText = formatCurrencySpeech(parsed);
                            lastSpokenMoneyRef.current = speechKey;
                            playEarcon('success');
                            hapticRef.current?.trigger(2);
                            speakText(speechText, { rate: 1.1 });
                            setModeAnnouncement(speechText);
                        }
                    } else {
                        setCurrencyHint('กำลังยืนยัน...');
                    }
                } else {
                    stableDetectionRef.current = { key: '', count: 0 };
                    notFoundCountRef.current += 1;

                    if (notFoundCountRef.current >= 2) {
                        setCurrencyResult(null);
                        lastSpokenMoneyRef.current = '';
                    }

                    setCurrencyHint('ยังไม่เจอเงิน — ขยับกล้องให้ใกล้และอยู่กลางจอ');
                }
            } catch (error) {
                console.error('Currency scan error:', error);
                addLog(`Currency scan error: ${error.message}`);
                stableDetectionRef.current = { key: '', count: 0 };
                currencyErrorCountRef.current += 1;

                const isRateLimit = error.status === 429 || /rate limit/i.test(error.message);
                const isNetwork = /failed to fetch|network/i.test(error.message);
                const backoffMs = isRateLimit
                    ? 12000
                    : Math.min(6000 * currencyErrorCountRef.current, 18000);
                currencySkipUntilRef.current = Date.now() + backoffMs;

                if (currencyErrorCountRef.current >= 3) {
                    setCurrencyHint('ไม่สามารถเชื่อมต่อ AI ได้ ตรวจสอบเน็ตหรือ API key');
                } else if (isRateLimit) {
                    setCurrencyHint('AI ทำงานหนัก รอสักครู่...');
                } else if (isNetwork) {
                    setCurrencyHint('ไม่มีการเชื่อมต่อเน็ต ตรวจสอบ Wi‑Fi');
                } else {
                    setCurrencyHint('สแกนไม่สำเร็จ ลองใหม่อีกครั้ง');
                }
            } finally {
                currencyBusyRef.current = false;
                setCurrencyScanning(false);
            }
        };

        setCurrencyResult(null);
        setCurrencyBounds(null);
        setCurrencyHint('');
        lastSpokenMoneyRef.current = '';
        stableDetectionRef.current = { key: '', count: 0 };
        notFoundCountRef.current = 0;
        currencyErrorCountRef.current = 0;
        currencySkipUntilRef.current = 0;

        // Defer first scan so the video frame is ready (fixes mobile readyState < 2 on mount).
        const startTimeout = setTimeout(() => scanCurrency(), 300);

        currencyIntervalRef.current = setInterval(scanCurrency, 4000);

        return () => {
            clearTimeout(startTimeout);
            if (currencyIntervalRef.current) {
                clearInterval(currencyIntervalRef.current);
                currencyIntervalRef.current = null;
            }
            currencyBusyRef.current = false;
            setCurrencyScanning(false);
            setCurrencyMonitoring(false);
            stableDetectionRef.current = { key: '', count: 0 };
            notFoundCountRef.current = 0;
            currencyErrorCountRef.current = 0;
            currencySkipUntilRef.current = 0;
        };
    }, [mode, aiReady]);

    const replayCurrency = useCallback(() => {
        if (!currencyResult) return;
        stopSpeaking();
        const speechText = formatCurrencySpeech(currencyResult);
        speakText(speechText, { rate: 1.1 });
        hapticRef.current?.trigger(1);
    }, [currencyResult]);

    // Capture single image and send to Groq API (Llama 4 Scout Vision)
    // Now accepts optional 'customPrompt' from voice input
    // Helper to format messages for Groq API
    const formatMessagesForApi = (history, currentMessage) => {
        // 1. Convert history to API format
        // Take last 6 messages to avoid token limits
        const formattedHistory = history.slice(-6).map(msg => {
            const role = msg.role === 'ai' ? 'assistant' : 'user';

            if (msg.image) {
                return {
                    role: role,
                    content: [
                        { type: "text", text: msg.content || "" },
                        { type: "image_url", image_url: { url: msg.image } }
                    ]
                };
            } else {
                return {
                    role: role,
                    content: msg.content
                };
            }
        });

        // 2. System Prompt
        const systemPrompt = {
            role: "system",
            content: `
คุณคือ "วิสัยทัศน์อัจฉริยะ" ผู้ช่วยส่วนตัวของผู้พิการทางสายตา หน้าที่ของคุณคือการเป็นดวงตาที่ละเอียด รอบคอบ และพึ่งพาได้

ลำดับความสำคัญในการทำงาน (Priority Framework):

1. ตรวจสอบอุปสรรคทางกายภาพ (Physical Check):
   - หากเห็นนิ้วบังเลนส์ หรือภาพมืด/เบลอจนวิเคราะห์ไม่ได้ ให้รีบแจ้งและแนะนำวิธีแก้ทันที (เช่น "มีนิ้วบังมุมขวาบนครับ", "รบกวนเปิดไฟหรือเปิดม่านเพิ่มครับ")
   - หากวัตถุสำคัญ (เช่น ข้อความ, ใบหน้าคน, สิ่งของ) อยู่ไม่กลางเฟรม ให้บอกทิศทางปรับกล้อง (เช่น "เลื่อนกล้องไปทางขวาช้าๆ", "ถอยกล้องออกมาอีกประมาณหนึ่งช่วงแขน")

2. การอ่านข้อความและเอกสาร (Detailed OCR):
   - หากมีตัวอักษร ให้อ่านเนื้อหาทั้งหมดอย่างถูกต้อง
   - กรณีเป็นฉลากสินค้า/ยา: ต้องระบุ "ชื่อผลิตภัณฑ์", "สรรพคุณ/วิธีใช้", และ "วันหมดอายุ" ให้ชัดเจน
   - หากเป็นเอกสาร: บอกประเภทของเอกสารและหัวข้อสำคัญ
   - หากตัวหนังสือขาดหาย ให้บอกผู้ใช้ว่าส่วนไหนที่หายไป (เช่น "บรรทัดล่างสุดขาดไป รบกวนกดกล้องลงนิดครับ")

3. การวิเคราะห์สภาพแวดล้อมและความปลอดภัย (Spatial Awareness & Safety):
   - แจ้งเตือนสิ่งกีดขวางหรืออันตรายในระยะประชิดทันที (เช่น บันได, พื้นต่างระดับ, สายไฟ, วัตถุที่แหลมคม)
   - บอกตำแหน่งวัตถุโดยใช้ระบบ "หน้าปัดนาฬิกา" หรือ "ซ้าย/ขวา/ตรงหน้า" พร้อมระยะห่างโดยประมาณ
   - ระบุสี สภาพแสง และลักษณะพื้นผิว (เช่น "เสื้อสีน้ำเงินเข้ม ลายทางขาว", "พื้นถนนขรุขระ")

4. การจดจำบริบท (Contextual Memory):
   - เชื่อมโยงข้อมูลจากภาพก่อนหน้าเสมอ หากผู้ใช้ถามถึงสิ่งที่เคยส่องไปแล้ว

โทนเสียงและกฎการตอบ:
- ภาษาไทยเท่านั้น เป็นกันเองแต่สุภาพ (ใช้คำว่า "ครับ/ค่ะ" ตามความเหมาะสม)
- กระชับ ไม่เวิ่นเว้อ แต่ต้อง "ละเอียดในจุดที่จำเป็น"
- หากภาพชัดเจนดีแล้ว ให้เริ่มการบรรยายทันทีโดยไม่ประเมินภาพซ้ำซาก`.trim()
        };

        return [systemPrompt, ...formattedHistory, currentMessage];
    };

    // Capture single image and send to Groq API (Llama 4 Scout Vision)
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
            const imageDataUrl = `data:image/jpeg;base64,${imageBase64}`;

            // 3. Prepare User Message
            const userQuestion = customPrompt && typeof customPrompt === 'string'
                ? `(พูด): "${customPrompt}"`
                : 'ช่วยบรรยายภาพนี้ให้หน่อย';

            // Add to local state immediately
            const newUserMessage = { role: 'user', content: userQuestion, image: imageDataUrl };
            setAiMessages(prev => [...prev, newUserMessage]);

            // 4. Send to API with History
            (async () => {
                try {
                    setAiStatus('thinking');
                    addLog('Sending to Groq (Llama 4 Scout)...');

                    // Use updated history
                    const historyForApi = [...aiMessages, newUserMessage];

                    const apiMessages = formatMessagesForApi(historyForApi, {
                        role: "user",
                        content: [
                            { type: "text", text: userQuestion },
                            { type: "image_url", image_url: { url: imageDataUrl } }
                        ]
                    });

                    const response = await fetch(
                        'https://api.groq.com/openai/v1/chat/completions',
                        {
                            method: 'POST',
                            headers: {
                                'Authorization': `Bearer ${apiKey}`,
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({
                                model: GROQ_MODEL,
                                messages: apiMessages,
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
                        setAiMessages(current => [...current, { role: 'ai', content: `ขอโทษครับ เกิดข้อผิดพลาด: ${data.error.message}` }]);
                    } else if (data.choices && data.choices[0]?.message?.content) {
                        const aiText = data.choices[0].message.content;
                        addLog('AI responded!');
                        setAiMessages(current => [...current, { role: 'ai', content: aiText }]);
                        playEarcon('success');
                        hapticRef.current?.trigger(1);
                    } else {
                        addLog('No response data');
                        setAiMessages(current => [...current, { role: 'ai', content: 'ขอโทษครับ AI ไม่ตอบกลับ ลองใหม่อีกทีนะครับ' }]);
                    }
                } catch (error) {
                    console.error('AI Request Error:', error);
                    addLog(`Error: ${error.message}`);
                    setAiMessages(current => [...current, { role: 'ai', content: 'เกิดข้อผิดพลาดในการเชื่อมต่อครับ' }]);
                } finally {
                    setAiStatus('idle');
                }
            })();

        } catch (error) {
            console.error('Capture Error:', error);
            setAiStatus('idle');
        }
    }, [aiReady, aiStatus, addLog, playEarcon, aiMessages]);

    // Keep ref updated so onresult callback can access latest function
    captureAndAskRef.current = captureAndAsk;

    // Text-only chat function (no image capture) 
    const askTextOnly = useCallback(async (userText) => {
        if (!aiReady || aiStatus === 'thinking') return;
        if (!userText || userText.trim().length === 0) return;

        const apiKey = process.env.NEXT_PUBLIC_GROQ_API_KEY;

        const newUserMessage = { role: 'user', content: `🎤 ${userText}` };

        setAiMessages(prev => [...prev, newUserMessage]);

        (async () => {
            try {
                setAiStatus('thinking');
                playEarcon('capture');
                hapticRef.current?.trigger(1);
                addLog(`Text Chat: "${userText}"`);

                const historyForApi = [...aiMessages, newUserMessage];

                const apiMessages = formatMessagesForApi(historyForApi, {
                    role: "user",
                    content: userText
                });

                const response = await fetch(
                    'https://api.groq.com/openai/v1/chat/completions',
                    {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${apiKey}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            model: GROQ_MODEL,
                            messages: apiMessages,
                            max_tokens: 500,
                            temperature: 0.7
                        })
                    }
                );

                const data = await response.json();

                if (data.error) {
                    addLog(`API Error: ${data.error.message}`);
                    setAiMessages(current => [...current, { role: 'ai', content: `ขอโทษครับ: ${data.error.message}` }]);
                } else if (data.choices && data.choices[0]?.message?.content) {
                    const aiText = data.choices[0].message.content;
                    setAiMessages(current => [...current, { role: 'ai', content: aiText }]);
                    playEarcon('success');
                    hapticRef.current?.trigger(1);
                } else {
                    setAiMessages(current => [...current, { role: 'ai', content: 'ขอโทษครับ ไม่ได้รับคำตอบ' }]);
                }

            } catch (error) {
                console.error('Text Chat Error:', error);
                setAiMessages(current => [...current, { role: 'ai', content: 'เกิดข้อผิดพลาดในการเชื่อมต่อครับ' }]);
            } finally {
                setAiStatus('idle');
            }
        })();

    }, [aiReady, aiStatus, addLog, playEarcon, aiMessages]);

    // Keep askTextOnly ref updated for voice callback
    askTextOnlyRef.current = askTextOnly;

    const readDocument = useCallback(async () => {
        if (!aiReady || aiStatus === 'thinking' || mode !== 'reader') return;

        const apiKey = process.env.NEXT_PUBLIC_GROQ_API_KEY;
        if (!apiKey) {
            alert('API Key Missing!');
            return;
        }

        if (!myVideoRef.current) return;

        try {
            autoCaptureFiredRef.current = true;
            stopSpeaking();
            setIsReading(false);
            setAiStatus('capturing');
            playEarcon('capture');
            hapticRef.current?.trigger(2);
            addLog('Capturing document...');

            const imageDataUrl = captureFrameFromVideo(myVideoRef.current);

            setAiStatus('thinking');
            setDocText('กำลังอ่านเอกสาร รอสักครู่...');

            const text = await callGroqVision({
                apiKey,
                imageDataUrl,
                systemPrompt: OCR_PROMPT,
                userPrompt: 'อ่านข้อความทั้งหมดในภาพนี้',
                maxTokens: 1500,
                temperature: 0,
            });

            setDocText(text);
            playEarcon('success');
            hapticRef.current?.trigger(1);
            setModeAnnouncement(`อ่านเอกสาร: ${text.slice(0, 120)}${text.length > 120 ? '...' : ''}`);

            setIsReading(true);
            speakText(text, {
                rate: 1.0,
                onEnd: () => setIsReading(false),
            });
        } catch (error) {
            console.error('Read document error:', error);
            setDocText(`เกิดข้อผิดพลาด: ${error.message}`);
            addLog(`Read document error: ${error.message}`);
        } finally {
            setAiStatus('idle');
        }
    }, [aiReady, aiStatus, mode, addLog, playEarcon]);

    readDocumentRef.current = readDocument;

    // Page alignment analysis for reader mode (corners + guidance + auto-capture)
    useEffect(() => {
        if (mode !== 'reader' || !aiReady) {
            setPageBounds(null);
            setPageCorners(null);
            setReaderGuidance('');
            setReaderAligned(false);
            alignedCountRef.current = 0;
            pageSeenCountRef.current = 0;
            pageOverlayActiveRef.current = false;
            scanBusyRef.current = false;
            return undefined;
        }

        preloadPageScanner().catch(() => {
            // Scanic unavailable — reader stays silent with no overlay
        });

        const speakPageGuidance = (text) => {
            if (!text || text === lastSpokenPageRef.current) return;
            if (aiStatusRef.current !== 'idle' || isReadingRef.current) return;

            if ('speechSynthesis' in window) {
                speechSynthesis.cancel();
                const utterance = new SpeechSynthesisUtterance(text);
                utterance.lang = 'th-TH';
                utterance.rate = 1.1;
                speechSynthesis.speak(utterance);
                lastSpokenPageRef.current = text;
            }
        };

        const clearPageOverlay = () => {
            if (!pageOverlayActiveRef.current) return;
            pageOverlayActiveRef.current = false;
            setPageBounds(null);
            setPageCorners(null);
            setReaderGuidance('');
            setReaderAligned(false);
        };

        const applyPageOverlay = (result) => {
            pageOverlayActiveRef.current = true;
            setPageBounds(result.bounds);
            setPageCorners(result.corners);
            setReaderGuidance(result.guidance);
            setReaderAligned(result.aligned);
        };

        const analyze = async () => {
            if (scanBusyRef.current) return;
            if (!myVideoRef.current || myVideoRef.current.readyState < 2) return;
            if (aiStatusRef.current === 'thinking' || isReadingRef.current) return;

            scanBusyRef.current = true;
            try {
                const result = await analyzePageAlignment(myVideoRef.current);

                if (!result.detected) {
                    pageSeenCountRef.current = 0;
                    alignedCountRef.current = 0;
                    clearPageOverlay();
                    return;
                }

                pageSeenCountRef.current += 1;
                if (pageSeenCountRef.current < 2) {
                    alignedCountRef.current = 0;
                    clearPageOverlay();
                    return;
                }

                applyPageOverlay(result);

                speakPageGuidance(result.guidance);

                const canAutoCapture = !autoCaptureFiredRef.current && !docText;

                if (result.aligned && canAutoCapture && aiStatusRef.current === 'idle') {
                    alignedCountRef.current += 1;

                    if (alignedCountRef.current >= 3) {
                        autoCaptureFiredRef.current = true;
                        alignedCountRef.current = 0;
                        playEarcon('success');
                        hapticRef.current?.trigger(2);
                        setModeAnnouncement('ตรงแล้ว กำลังถ่ายเอกสาร');
                        readDocumentRef.current?.();
                    }
                } else if (!result.aligned) {
                    alignedCountRef.current = 0;
                }
            } finally {
                scanBusyRef.current = false;
            }
        };

        analyze();
        const interval = setInterval(analyze, 500);

        return () => {
            clearInterval(interval);
            pageOverlayActiveRef.current = false;
            scanBusyRef.current = false;
            setPageBounds(null);
            setPageCorners(null);
            setReaderGuidance('');
            setReaderAligned(false);
            alignedCountRef.current = 0;
            pageSeenCountRef.current = 0;
        };
    }, [mode, aiReady, docText, playEarcon]);

    const replayDocument = useCallback(() => {
        if (!docText || docText.startsWith('กำลังอ่าน') || docText.startsWith('เกิดข้อผิดพลาด')) return;
        stopSpeaking();
        setIsReading(true);
        speakText(docText, {
            rate: 1.0,
            onEnd: () => setIsReading(false),
        });
        hapticRef.current?.trigger(1);
    }, [docText]);

    const stopReading = useCallback(() => {
        stopSpeaking();
        setIsReading(false);
        hapticRef.current?.trigger(1);
    }, []);

    const statusLabel = !aiReady
        ? 'กำลังเริ่ม...'
        : mode === 'currency'
            ? currencyScanning
                ? 'กำลังสแกนเงิน...'
                : currencyMonitoring
                    ? 'กำลังสแกนเงิน...'
                    : 'พร้อมสแกน'
            : mode === 'reader' && aiStatus === 'thinking'
                ? 'กำลังอ่านเอกสาร...'
                : mode === 'reader' && readerAligned
                    ? 'ตรงแล้ว พร้อมถ่าย'
                    : mode === 'reader' && readerGuidance
                        ? 'จัดกล้อง...'
                        : aiStatus === 'thinking'
                            ? 'กำลังคิด...'
                            : 'AI พร้อม';

    const showCapturedText =
        (mode === 'reader' && !!docText) ||
        (mode === 'assistant' && aiMessages.length > 0);

    const cameraHeightClass = showCapturedText ? 'h-[38%]' : 'flex-1 min-h-0';

    return (
        <div className="flex flex-col h-screen bg-black text-white relative overflow-hidden font-sans">
            <HapticFeedback ref={hapticRef} />

            {/* Top Navigation Bar (Simplified - AI First) */}
            <div className="absolute top-0 inset-x-0 z-50 p-4 flex justify-between items-center pointer-events-none">
                {/* Back Button */}
                <Link href="/" className="pointer-events-auto flex items-center gap-2 bg-black/60 hover:bg-black/80 text-white px-5 py-3 rounded-full backdrop-blur-md transition-all border border-white/20 shadow-lg" aria-label="กลับหน้าหลัก">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
                </Link>

                {/* Status Indicator */}
                <div className="pointer-events-none" aria-hidden="true">
                    <span className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold backdrop-blur-md shadow-lg border transition-colors ${!aiReady ? 'bg-zinc-800/80 text-zinc-400 border-zinc-700' :
                        aiStatus === 'thinking' || (mode === 'currency' && (currencyScanning || currencyMonitoring)) ? 'bg-amber-500/90 text-black border-amber-400 animate-pulse' :
                            'bg-emerald-500/90 text-black border-emerald-400'
                        }`}>
                        <span className={`w-2 h-2 rounded-full ${!aiReady ? 'bg-zinc-500' :
                            aiStatus === 'thinking' || (mode === 'currency' && (currencyScanning || currencyMonitoring)) ? 'bg-black animate-ping' :
                                'bg-black'
                            }`}></span>
                        {statusLabel}
                    </span>
                </div>
            </div>

            {/* ==================== MAIN UI ==================== */}
            <main
                    className="w-full h-full flex flex-col relative"
                    aria-label="ผู้ช่วย AI สำหรับผู้พิการทางสายตา"
                >
                    {/* Camera View */}
                    <div ref={cameraContainerRef} className={`relative bg-black flex-shrink-0 transition-all duration-300 ${cameraHeightClass}`} aria-hidden="true">
                        <video
                            ref={myVideoRef}
                            autoPlay
                            muted
                            playsInline
                            className="absolute inset-0 w-full h-full object-cover"
                        />
                        <DetectionOverlay
                            videoRef={myVideoRef}
                            containerRef={cameraContainerRef}
                            cocoBoxes={cocoBoxes}
                            pageBounds={pageBounds}
                            pageCorners={pageCorners}
                            pageAligned={readerAligned}
                            currencyBounds={currencyBounds}
                            mode={mode}
                            showCoco={mode === 'assistant' && objectDetectorEnabled && aiReady}
                            showPage={mode === 'reader'}
                            showCurrency={mode === 'currency'}
                            currencyDetected={!!currencyResult}
                        />
                        <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-black/30 pointer-events-none z-[5]"></div>

                        {/* Guidance overlay: assistant uses COCO, reader uses page alignment */}
                        {mode === 'assistant' && objectDetectorEnabled && guidanceText && !voiceTranscript && (
                            <div
                                className={`absolute bottom-4 left-4 right-4 p-4 rounded-2xl text-center border-2 backdrop-blur-md transition-all duration-300 z-20 ${guidanceText.includes('✅')
                                    ? 'bg-green-500/80 border-green-300 animate-pulse'
                                    : guidanceText.includes('ไม่เจอ')
                                        ? 'bg-zinc-800/80 border-zinc-600'
                                        : 'bg-amber-500/80 border-amber-300'}`}
                                role="status"
                                aria-live="assertive"
                            >
                                <p className="text-xl font-bold text-white drop-shadow-lg">
                                    {guidanceText}
                                </p>
                                {detectedObjects && (
                                    <p className="text-base text-white/80 mt-1">
                                        {detectedObjects}
                                    </p>
                                )}
                            </div>
                        )}

                        {mode === 'reader' && readerGuidance && !voiceTranscript && aiStatus !== 'thinking' && (
                            <div
                                className={`absolute bottom-4 left-4 right-4 p-4 rounded-2xl text-center border-2 backdrop-blur-md transition-all duration-300 z-20 ${readerAligned
                                    ? 'bg-green-500/80 border-green-300 animate-pulse'
                                    : readerGuidance.includes('ยังไม่เจอ')
                                        ? 'bg-zinc-800/80 border-zinc-600'
                                        : 'bg-violet-500/80 border-violet-300'}`}
                                role="status"
                                aria-live="assertive"
                            >
                                <p className="text-xl font-bold text-white drop-shadow-lg">
                                    {readerGuidance}
                                </p>
                            </div>
                        )}

                        {/* Currency Result Overlay */}
                        {mode === 'currency' && (
                            <div
                                className={`absolute inset-0 flex flex-col items-center justify-center p-6 z-20 pointer-events-none ${currencyResult ? 'bg-amber-500/10' : ''}`}
                                role="status"
                                aria-live="assertive"
                            >
                                <p className={`font-black text-center drop-shadow-lg px-4 ${currencyResult
                                    ? 'text-6xl text-amber-300'
                                    : currencyScanning
                                        ? 'text-2xl text-amber-200 animate-pulse'
                                        : currencyHint
                                            ? 'text-xl text-amber-200'
                                            : 'text-2xl text-zinc-400'
                                    }`}>
                                    {currencyResult
                                        ? formatCurrencyDisplay(currencyResult)
                                        : currencyScanning
                                            ? 'กำลังถาม AI...'
                                            : currencyHint || 'ชี้กล้องไปที่ธนบัตรหรือเหรียญ'}
                                </p>
                                {currencyResult && (
                                    <p className="text-lg text-amber-100/80 mt-3">
                                        {formatCurrencySpeech(currencyResult)}
                                    </p>
                                )}
                            </div>
                        )}

                        {mode === 'assistant' && !showCapturedText && objectDetectorEnabled && !guidanceText && !voiceTranscript && (
                            <div className="absolute bottom-24 left-4 right-4 p-3 rounded-xl text-center bg-black/50 backdrop-blur-sm border border-white/10 z-20 pointer-events-none">
                                <p className="text-sm text-zinc-300">กดปุ่มถ่ายภาพหรือกดค้างไมค์เพื่อถาม</p>
                            </div>
                        )}

                        {/* Voice Transcript Overlay */}
                        {voiceTranscript && (
                            <div className="absolute bottom-4 left-4 right-4 bg-black/80 backdrop-blur-md p-4 rounded-2xl text-center border-2 border-white/20 z-20">
                                <p className={`text-xl font-bold ${isListening ? 'text-red-400 animate-pulse' : 'text-white'}`}>
                                    {voiceTranscript}
                                </p>
                            </div>
                        )}
                    </div>

                    {/* Live Status Announcer (Hidden visually, read by VoiceOver) */}
                    <div className="sr-only" aria-live="assertive" aria-atomic="true">
                        {modeAnnouncement ||
                            (!aiReady ? "กำลังขออนุญาตใช้กล้อง" :
                                aiStatus === 'capturing' ? "กำลังถ่ายภาพ" :
                                    aiStatus === 'thinking' ? "AI กำลังวิเคราะห์ รอสักครู่" :
                                        mode === 'reader' && readerGuidance ? readerGuidance :
                                            mode === 'currency' && currencyResult ? formatCurrencySpeech(currencyResult) :
                                                mode === 'reader' && isReading ? "กำลังอ่านเอกสารออกเสียง" :
                                                    mode === 'assistant' && aiMessages.length > 0 && aiMessages[aiMessages.length - 1].role === 'ai'
                                                        ? `AI ตอบกลับว่า: ${aiMessages[aiMessages.length - 1].content}`
                                                        : "")}
                    </div>

                    {/* Mode Switcher — below camera so aiming the lens does not hit tabs */}
                    <div
                        className="flex-shrink-0 px-3 py-2 bg-black border-b border-zinc-800 flex gap-2"
                        role="tablist"
                        aria-label="เลือกโหมดการใช้งาน"
                    >
                        {[
                            { id: 'assistant', label: 'ผู้ช่วย AI' },
                            { id: 'currency', label: 'ดูสกุลเงิน' },
                            { id: 'reader', label: 'อ่านเอกสาร' },
                        ].map((item) => (
                            <button
                                key={item.id}
                                type="button"
                                role="tab"
                                aria-selected={mode === item.id}
                                aria-pressed={mode === item.id}
                                onClick={() => switchMode(item.id)}
                                className={`flex-1 py-3 px-2 rounded-xl text-sm font-bold border-2 transition-all focus:outline-none focus:ring-2 focus:ring-white ${mode === item.id
                                    ? item.id === 'currency'
                                        ? 'bg-amber-500 text-black border-amber-300'
                                        : item.id === 'reader'
                                            ? 'bg-violet-500 text-white border-violet-300'
                                            : 'bg-sky-500 text-black border-sky-300'
                                    : 'bg-zinc-900 text-zinc-400 border-zinc-700 active:bg-zinc-800'
                                    }`}
                                aria-label={`โหมด${item.label}`}
                            >
                                {item.label}
                            </button>
                        ))}
                    </div>

                    {/* Content Area — แสดงหลังถ่ายแล้วเท่านั้น */}
                    {mode === 'assistant' && showCapturedText && (
                    <section
                        className="flex-1 overflow-y-auto p-4 space-y-4 bg-zinc-950 min-h-0"
                        aria-label="ประวัติการสนทนา"
                        tabIndex={0}
                        ref={(el) => {
                            if (el && aiMessages.length > 0) {
                                el.scrollTop = el.scrollHeight;
                            }
                        }}
                    >
                        <ul className="space-y-4">
                            {aiMessages.map((msg, i) => (
                                <li key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                                    {/* User message with image */}
                                    {msg.role === 'user' && msg.image && (
                                        <div className="bg-zinc-800 rounded-2xl rounded-br-sm p-1 max-w-[80%] border border-zinc-700">
                                            <img
                                                src={msg.image}
                                                alt={`ภาพที่ถ่ายครั้งที่ ${Math.floor(i / 2) + 1}`}
                                                className="rounded-xl max-h-40 w-auto object-contain bg-black"
                                            />
                                            <p className="sr-only">คุณส่งภาพถ่าย</p>
                                        </div>
                                    )}

                                    {/* User voice message (no image) */}
                                    {msg.role === 'user' && !msg.image && (
                                        <div className="bg-sky-900/50 rounded-2xl rounded-br-sm px-5 py-3 max-w-[85%] border border-sky-700/50">
                                            <p className="text-base text-sky-100">{msg.content}</p>
                                        </div>
                                    )}

                                    {/* AI Response */}
                                    {msg.role === 'ai' && (
                                        <div
                                            className={`mt-2 rounded-2xl rounded-bl-sm p-5 max-w-[95%] shadow-lg ${msg.content.startsWith('Error') || msg.content.startsWith('ขอโทษ') || msg.content.startsWith('เกิดข้อผิดพลาด')
                                                ? 'bg-red-900/60 text-white border border-red-700/50'
                                                : 'bg-zinc-800 text-white border border-zinc-700'
                                                }`}
                                        >
                                            <p className="text-lg leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                                            <p className="sr-only">จบคำตอบ</p>
                                        </div>
                                    )}
                                </li>
                            ))}
                        </ul>
                    </section>
                    )}

                    {mode === 'reader' && showCapturedText && (
                        <section className="flex-1 overflow-y-auto p-4 bg-zinc-950 min-h-0" aria-label="เนื้อหาเอกสาร" tabIndex={0}>
                            <div className="bg-zinc-900 rounded-2xl p-5 border border-zinc-700">
                                <p className="text-lg leading-relaxed whitespace-pre-wrap text-white">{docText}</p>
                                {isReading && (
                                    <p className="text-violet-400 text-sm mt-4 animate-pulse" aria-live="polite">กำลังอ่านออกเสียง...</p>
                                )}
                            </div>
                        </section>
                    )}

                    {/* Bottom Control Bar (Accessible - Large Touch Targets) */}
                    <div className="bg-black border-t-2 border-zinc-800 px-6 py-5 pb-10" role="group" aria-label="ปุ่มควบคุม">
                        {mode === 'assistant' && (
                        <div className="flex items-center justify-center gap-6">
                            {/* Clear Chat Button (Left - Small) */}
                            <button
                                type="button"
                                onClick={() => {
                                    setAiMessages([]);
                                    hapticRef.current?.trigger(1);
                                }}
                                className="w-14 h-14 rounded-full bg-zinc-900 text-zinc-500 border border-zinc-800 active:bg-zinc-700 focus:ring-2 focus:ring-white focus:outline-none flex items-center justify-center"
                                aria-label="ล้างแชทเก่า"
                            >
                                <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /></svg>
                            </button>

                            {/* Capture Button (Center - LARGE for accessibility) */}
                            <button
                                type="button"
                                disabled={!aiReady || aiStatus === 'thinking' || isListening}
                                onClick={() => captureAndAsk()}
                                className={`
                                    relative w-[88px] h-[88px] rounded-full flex items-center justify-center transition-all duration-200
                                    shadow-[0_0_25px_rgba(56,189,248,0.3)] border-4
                                    focus:ring-4 focus:ring-sky-300 focus:outline-none
                                    ${(!aiReady || aiStatus === 'thinking')
                                        ? 'bg-zinc-800 opacity-50 cursor-not-allowed border-zinc-700'
                                        : 'bg-sky-500 hover:bg-sky-400 active:scale-90 active:bg-sky-600 border-sky-300'}
                                `}
                                aria-label={aiStatus === 'thinking' ? "AI กำลังคิด รอสักครู่" : "ถ่ายภาพเพื่อให้ AI บรรยาย"}
                                aria-busy={aiStatus === 'thinking'}
                            >
                                {aiStatus === 'thinking' ? (
                                    <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-white animate-spin"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
                                ) : (
                                    <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" /><circle cx="12" cy="13" r="3" /></svg>
                                )}
                            </button>

                            {/* Voice Input Button (Right - Hold to Talk) */}
                            <button
                                type="button"
                                onMouseDown={startListening}
                                onMouseUp={stopListening}
                                onMouseLeave={stopListening}
                                onTouchStart={startListening}
                                onTouchEnd={stopListening}
                                className={`w-16 h-16 rounded-full border-2 flex items-center justify-center focus:ring-2 focus:ring-white focus:outline-none transition-all duration-150 ${isListening
                                    ? 'bg-red-600 text-white border-red-400 scale-110 shadow-[0_0_20px_rgba(220,38,38,0.7)]'
                                    : 'bg-zinc-900 text-zinc-400 border-zinc-700 active:bg-zinc-700'
                                    }`}
                                aria-label="กดค้างเพื่อพูดคำถาม ปล่อยเพื่อส่ง"
                                aria-pressed={isListening}
                            >
                                {isListening ? (
                                    <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-pulse"><line x1="1" y1="1" x2="23" y2="23"></line><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"></path><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>
                                ) : (
                                    <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>
                                )}
                            </button>
                        </div>
                        )}

                        {mode === 'currency' && (
                            <div className="flex items-center justify-center gap-6">
                                <div className="flex-1 text-center" aria-live="polite">
                                    <p className="text-amber-400 font-bold text-lg">
                                        {currencyScanning || currencyMonitoring ? 'กำลังสแกนอัตโนมัติ...' : 'พร้อมสแกน'}
                                    </p>
                                    <p className="text-zinc-500 text-sm mt-1">
                                        Groq AI บอกมูลค่าแบงค์และเหรียญ (ต้องมีเน็ต)
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    disabled={!currencyResult}
                                    onClick={replayCurrency}
                                    className={`w-16 h-16 rounded-full border-2 flex items-center justify-center focus:ring-2 focus:ring-white focus:outline-none transition-all ${currencyResult
                                        ? 'bg-amber-500 text-black border-amber-300 active:scale-95'
                                        : 'bg-zinc-900 text-zinc-600 border-zinc-800 cursor-not-allowed'
                                        }`}
                                    aria-label="พูดซ้ำมูลค่าล่าสุด"
                                >
                                    <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M15.54 8.46a5 5 0 0 1 0 7.07" /></svg>
                                </button>
                            </div>
                        )}

                        {mode === 'reader' && (
                            <div className="flex items-center justify-center gap-4">
                                <button
                                    type="button"
                                    disabled={!docText || isReading}
                                    onClick={replayDocument}
                                    className={`w-14 h-14 rounded-full border-2 flex items-center justify-center focus:ring-2 focus:ring-white focus:outline-none ${docText && !isReading
                                        ? 'bg-zinc-900 text-violet-400 border-violet-700 active:bg-zinc-700'
                                        : 'bg-zinc-900 text-zinc-600 border-zinc-800 cursor-not-allowed'
                                        }`}
                                    aria-label="อ่านซ้ำเอกสาร"
                                >
                                    <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M15.54 8.46a5 5 0 0 1 0 7.07" /></svg>
                                </button>

                                <button
                                    type="button"
                                    disabled={!aiReady || aiStatus === 'thinking'}
                                    onClick={readDocument}
                                    className={`
                                        relative w-[88px] h-[88px] rounded-full flex items-center justify-center transition-all duration-200
                                        shadow-[0_0_25px_rgba(139,92,246,0.3)] border-4
                                        focus:ring-4 focus:ring-violet-300 focus:outline-none
                                        ${(!aiReady || aiStatus === 'thinking')
                                            ? 'bg-zinc-800 opacity-50 cursor-not-allowed border-zinc-700'
                                            : 'bg-violet-500 hover:bg-violet-400 active:scale-90 active:bg-violet-600 border-violet-300'}
                                    `}
                                    aria-label={
                                        aiStatus === 'thinking'
                                            ? 'กำลังอ่านเอกสาร รอสักครู่'
                                            : readerAligned
                                                ? 'ตรงแล้ว พร้อมถ่ายหรือกดเพื่อถ่ายใหม่'
                                                : 'ถ่ายหน้าเอกสารเพื่ออ่านออกเสียง'
                                    }
                                    aria-busy={aiStatus === 'thinking'}
                                >
                                    {aiStatus === 'thinking' ? (
                                        <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-white animate-spin"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
                                    ) : (
                                        <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" /></svg>
                                    )}
                                </button>

                                <button
                                    type="button"
                                    disabled={!isReading}
                                    onClick={stopReading}
                                    className={`w-14 h-14 rounded-full border-2 flex items-center justify-center focus:ring-2 focus:ring-white focus:outline-none ${isReading
                                        ? 'bg-red-600 text-white border-red-400 active:scale-95'
                                        : 'bg-zinc-900 text-zinc-600 border-zinc-800 cursor-not-allowed'
                                        }`}
                                    aria-label="หยุดอ่านออกเสียง"
                                >
                                    <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="6" width="12" height="12" rx="1" /></svg>
                                </button>
                            </div>
                        )}
                    </div>

                </main>
        </div >
    );
}

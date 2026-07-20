import { useState, useEffect, useRef, useCallback } from 'react';

export function useSpeechInput(onResult, onFeedback) {
    const [isListening, setIsListening] = useState(false);
    const [transcript, setTranscript] = useState('');
    const recognitionRef = useRef(null);
    const onResultRef = useRef(onResult);
    
    useEffect(() => {
        onResultRef.current = onResult;
    }, [onResult]);

    useEffect(() => {
        if (typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition)) {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            recognitionRef.current = new SpeechRecognition();
            recognitionRef.current.continuous = false;
            recognitionRef.current.interimResults = true;
            recognitionRef.current.lang = 'th-TH';

            recognitionRef.current.onstart = () => {
                setIsListening(true);
                setTranscript('กำลังฟัง...');
                onFeedback?.('start');
            };

            recognitionRef.current.onend = () => {
                setIsListening(false);
            };

            recognitionRef.current.onresult = (event) => {
                let interimTranscript = '';
                let finalTranscript = '';

                for (let i = 0; i < event.results.length; i++) {
                    if (event.results[i].isFinal) {
                        finalTranscript += event.results[i][0].transcript;
                    } else {
                        interimTranscript += event.results[i][0].transcript;
                    }
                }

                if (interimTranscript) {
                    setTranscript(`🎤 ${interimTranscript}`);
                }

                if (finalTranscript && finalTranscript.trim().length > 0) {
                    setTranscript(`✅ ${finalTranscript}`);
                    if (onResultRef.current) {
                        onResultRef.current(finalTranscript);
                    }
                }
            };

            recognitionRef.current.onerror = (event) => {
                if (event.error === 'aborted' || event.error === 'no-speech') {
                    setIsListening(false);
                    setTranscript('(ไม่ได้ยินเสียง)');
                    return;
                }
                console.warn("Speech error:", event.error);
                setIsListening(false);
                setTranscript(`⚠️ Error: ${event.error}`);
            };
        }
    }, [onFeedback]);

    const startListening = useCallback((e) => {
        e?.preventDefault();
        if (!recognitionRef.current) return;
        if (isListening) return;
        try {
            recognitionRef.current.start();
        } catch (error) {
            console.warn("Mic start error:", error);
        }
    }, [isListening]);

    const stopListening = useCallback((e) => {
        e?.preventDefault();
        if (!recognitionRef.current || !isListening) return;
        try {
            recognitionRef.current.stop();
            setTimeout(() => {
                setTranscript('');
            }, 2000);
        } catch (error) {
            console.warn("Mic stop error:", error);
        }
    }, [isListening]);

    return { isListening, transcript, startListening, stopListening, setTranscript };
}

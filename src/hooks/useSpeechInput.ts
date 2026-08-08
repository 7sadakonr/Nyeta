import { useState, useEffect, useRef, useCallback } from 'react';
import speechManager, { Priority } from '@/lib/speechManager';

export interface UseSpeechInputResult {
    isListening: boolean;
    transcript: string;
    startListening: (e?: React.SyntheticEvent | Event) => void;
    stopListening: (e?: React.SyntheticEvent | Event) => void;
    setTranscript: React.Dispatch<React.SetStateAction<string>>;
}

export function useSpeechInput(
    onResult?: (transcript: string) => void,
    onFeedback?: (type: string) => void
): UseSpeechInputResult {
    const [isListening, setIsListening] = useState<boolean>(false);
    const [transcript, setTranscript] = useState<string>('');
    const recognitionRef = useRef<any>(null);
    const onResultRef = useRef(onResult);
    
    useEffect(() => {
        onResultRef.current = onResult;
    }, [onResult]);

    useEffect(() => {
        if (typeof window !== 'undefined' && ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)) {
            const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
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

            recognitionRef.current.onresult = (event: any) => {
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

            recognitionRef.current.onerror = (event: any) => {
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

    const startListening = useCallback((e?: React.SyntheticEvent | Event) => {
        e?.preventDefault();
        if (!recognitionRef.current) {
            onFeedback?.('error');
            speechManager?.speak('เบราว์เซอร์นี้ไม่รองรับการสั่งงานด้วยเสียง', { priority: Priority.HIGH, owner: 'speech-input' });
            return;
        }
        if (isListening) return;
        try {
            recognitionRef.current.start();
        } catch (error) {
            console.warn("Mic start error:", error);
        }
    }, [isListening, onFeedback]);

    const stopListening = useCallback((e?: React.SyntheticEvent | Event) => {
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

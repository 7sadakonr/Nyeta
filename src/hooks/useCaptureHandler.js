'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

export function useCaptureHandler({
    localStreamRef,
    localVideoRef,
    dataChannel
}) {
    const [captureState, setCaptureState] = useState('idle'); // 'idle' | 'flash-on' | 'capturing' | 'sending'
    const audioContextRef = useRef(null);
    const manualTorchRef = useRef(false);

    // Play shutter sound effect
    const playShutterSound = useCallback(() => {
        try {
            if (!audioContextRef.current) {
                audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
            }
            const ctx = audioContextRef.current;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            
            osc.type = 'square';
            osc.frequency.setValueAtTime(150, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 0.1);
            
            gain.gain.setValueAtTime(0.1, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
            
            osc.connect(gain);
            gain.connect(ctx.destination);
            
            osc.start();
            osc.stop(ctx.currentTime + 0.1);
            
            // Trigger vibration if supported
            if (navigator.vibrate) {
                navigator.vibrate(50);
            }
        } catch (e) {
            console.error("AudioContext error", e);
        }
    }, []);

    const captureImage = useCallback(async (options) => {
        if (!localStreamRef.current || !localVideoRef.current || !dataChannel) return;

        setCaptureState('flash-on');
        dataChannel.sendCaptureStatus('flash-on');

        const videoTrack = localStreamRef.current.getVideoTracks()[0];
        let originalTorch = false;
        let turnedOnForCapture = false;
        
        try {
            // Apply torch if requested and not already manually on
            if (options?.flash && !manualTorchRef.current) {
                if (videoTrack && typeof videoTrack.applyConstraints === 'function') {
                    try {
                        const settings = videoTrack.getSettings();
                        originalTorch = settings.torch || false;
                        await videoTrack.applyConstraints({ advanced: [{ torch: true }] });
                        turnedOnForCapture = true;
                    } catch (e) {
                        // Try fallback syntax for some Safari versions
                        try {
                            await videoTrack.applyConstraints({ torch: true });
                            turnedOnForCapture = true;
                        } catch (err2) {
                            console.warn("Torch not supported or failed to apply", err2);
                        }
                    }
                }
                // ALWAYS wait 500ms for the flash (physical or soft-screen flash) to illuminate the scene
                await new Promise(resolve => setTimeout(resolve, 500));
            }
            
            setCaptureState('capturing');
            dataChannel.sendCaptureStatus('capturing');
            
            const video = localVideoRef.current;
            const canvas = document.createElement('canvas');
            const maxDimension = 1280;
            
            let targetWidth = video.videoWidth;
            let targetHeight = video.videoHeight;
            
            // Resize if needed
            if (Math.max(targetWidth, targetHeight) > maxDimension) {
                if (targetWidth > targetHeight) {
                    targetHeight = (targetHeight / targetWidth) * maxDimension;
                    targetWidth = maxDimension;
                } else {
                    targetWidth = (targetWidth / targetHeight) * maxDimension;
                    targetHeight = maxDimension;
                }
            }
            
            canvas.width = targetWidth;
            canvas.height = targetHeight;
            
            const ctx = canvas.getContext('2d');
            ctx.drawImage(video, 0, 0, targetWidth, targetHeight);
            
            playShutterSound();
            
            setCaptureState('sending');
            dataChannel.sendCaptureStatus('sending');
            
            const base64Image = canvas.toDataURL('image/jpeg', 0.85);
            dataChannel.sendCaptureResponse(base64Image);
            
            setCaptureState('idle');
            dataChannel.sendCaptureStatus('idle');

        } catch (err) {
            console.error('Error during capture:', err);
            setCaptureState('idle');
            dataChannel.sendCaptureStatus('idle');
        } finally {
            // Turn off torch if we turned it on for this capture
            if (turnedOnForCapture && videoTrack) {
                try {
                    await videoTrack.applyConstraints({ advanced: [{ torch: originalTorch }] });
                } catch (e) {
                    try {
                        await videoTrack.applyConstraints({ torch: originalTorch });
                    } catch (err3) {
                        console.error("Error turning off torch", err3);
                    }
                }
            }
        }
    }, [localStreamRef, localVideoRef, dataChannel, playShutterSound]);

    useEffect(() => {
        if (!dataChannel) return;

        const handleMessage = async (message) => {
            if (message.type === 'capture-request') {
                captureImage(message.payload);
            } else if (message.type === 'toggle-flash') {
                const shouldFlash = message.payload.flash;
                manualTorchRef.current = shouldFlash;
                const videoTrack = localStreamRef.current?.getVideoTracks()[0];
                if (videoTrack && typeof videoTrack.applyConstraints === 'function') {
                    try {
                        await videoTrack.applyConstraints({ advanced: [{ torch: shouldFlash }] });
                    } catch (e) {
                        try {
                            await videoTrack.applyConstraints({ torch: shouldFlash });
                        } catch (err2) {
                            console.warn("Torch not supported or failed to apply manually", err2);
                        }
                    }
                }
            }
        };

        dataChannel.onMessage(handleMessage);
        
        return () => {
            dataChannel.offMessage(handleMessage);
        };
    }, [dataChannel, captureImage]);

    return {
        captureState
    };
}

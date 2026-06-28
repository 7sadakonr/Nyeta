'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

export function useCaptureHandler({
    localStreamRef,
    localVideoRef,
    dataChannel
}) {
    const [captureState, setCaptureState] = useState('idle'); // 'idle' | 'flash-on' | 'capturing' | 'sending'
    const audioContextRef = useRef(null);

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
        
        try {
            // Apply torch if requested and supported
            if (options?.flash && videoTrack && typeof videoTrack.getCapabilities === 'function') {
                const capabilities = videoTrack.getCapabilities();
                if (capabilities.torch) {
                    const settings = videoTrack.getSettings();
                    originalTorch = settings.torch || false;
                    await videoTrack.applyConstraints({ advanced: [{ torch: true }] });
                    // Wait for the camera to adjust to the light
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
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
            // Turn off torch if we turned it on
            if (options?.flash && videoTrack) {
                try {
                    await videoTrack.applyConstraints({ advanced: [{ torch: originalTorch }] });
                } catch (e) {
                    console.error("Error turning off torch", e);
                }
            }
        }
    }, [localStreamRef, localVideoRef, dataChannel, playShutterSound]);

    useEffect(() => {
        if (!dataChannel) return;

        const handleMessage = (message) => {
            if (message.type === 'capture-request') {
                captureImage(message.payload);
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

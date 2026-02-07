'use client';

import { useEffect, useState, useRef, useCallback } from 'react';

/**
 * useObjectDetector Hook
 * Provides real-time object detection using TensorFlow.js COCO-SSD model
 * for assisting visually impaired users in framing their shots.
 */
export function useObjectDetector(videoRef, enabled = false) {
    const [isLoading, setIsLoading] = useState(true);
    const [detections, setDetections] = useState([]);
    const [centerObject, setCenterObject] = useState(null); // Object closest to center
    const [guidance, setGuidance] = useState(null); // Direction guidance

    const modelRef = useRef(null);
    const animationFrameRef = useRef(null);
    const lastSpeakTimeRef = useRef(0);

    // Load model only when enabled (client-side only)
    useEffect(() => {
        // Skip on server-side
        if (typeof window === 'undefined') return;
        // Don't load until explicitly enabled
        if (!enabled) return;
        // Already loaded
        if (modelRef.current) {
            setIsLoading(false);
            return;
        }

        let isMounted = true;

        const loadModel = async () => {
            try {
                // Dynamic import to avoid SSR issues
                const tf = await import('@tensorflow/tfjs');
                const cocoSsd = await import('@tensorflow-models/coco-ssd');

                console.log('Loading COCO-SSD model...');
                const model = await cocoSsd.load();

                if (isMounted) {
                    modelRef.current = model;
                    setIsLoading(false);
                    console.log('COCO-SSD model loaded!');
                }
            } catch (error) {
                console.error('Failed to load model:', error);
                if (isMounted) {
                    setIsLoading(false);
                }
            }
        };

        loadModel();

        return () => {
            isMounted = false;
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
            }
        };
    }, [enabled]);

    // Calculate guidance direction based on bounding box position
    const calculateGuidance = useCallback((detection, videoWidth, videoHeight) => {
        if (!detection) return null;

        const [x, y, width, height] = detection.bbox;
        const centerX = x + width / 2;
        const centerY = y + height / 2;

        const frameCenterX = videoWidth / 2;
        const frameCenterY = videoHeight / 2;

        // Define center zone (20% of frame)
        const toleranceX = videoWidth * 0.2;
        const toleranceY = videoHeight * 0.2;

        const diffX = centerX - frameCenterX;
        const diffY = centerY - frameCenterY;

        // Check if object is centered
        if (Math.abs(diffX) < toleranceX && Math.abs(diffY) < toleranceY) {
            return { direction: 'center', message: 'อยู่ตรงกลางแล้ว พร้อมถ่าย' };
        }

        // Determine direction
        let direction = '';
        let message = 'เลื่อนกล้อง';

        if (diffX < -toleranceX) {
            direction = 'left';
            message += 'ไปทางซ้าย';
        } else if (diffX > toleranceX) {
            direction = 'right';
            message += 'ไปทางขวา';
        }

        if (diffY < -toleranceY) {
            direction += direction ? '-up' : 'up';
            message += ' และขึ้นบน';
        } else if (diffY > toleranceY) {
            direction += direction ? '-down' : 'down';
            message += ' และลงล่าง';
        }

        return { direction, message };
    }, []);

    // Run detection loop
    useEffect(() => {
        if (!enabled || isLoading || !modelRef.current || !videoRef?.current) {
            return;
        }

        const video = videoRef.current;

        const detect = async () => {
            if (video.readyState < 2) {
                animationFrameRef.current = requestAnimationFrame(detect);
                return;
            }

            try {
                const predictions = await modelRef.current.detect(video);
                setDetections(predictions);

                // Find object closest to center
                if (predictions.length > 0) {
                    const videoWidth = video.videoWidth;
                    const videoHeight = video.videoHeight;
                    const frameCenterX = videoWidth / 2;
                    const frameCenterY = videoHeight / 2;

                    // Sort by distance to center
                    const sorted = predictions
                        .map(p => {
                            const [x, y, w, h] = p.bbox;
                            const objCenterX = x + w / 2;
                            const objCenterY = y + h / 2;
                            const distance = Math.sqrt(
                                Math.pow(objCenterX - frameCenterX, 2) +
                                Math.pow(objCenterY - frameCenterY, 2)
                            );
                            return { ...p, distance };
                        })
                        .sort((a, b) => a.distance - b.distance);

                    const closest = sorted[0];
                    setCenterObject(closest);

                    // Calculate and set guidance
                    const newGuidance = calculateGuidance(closest, videoWidth, videoHeight);
                    setGuidance(newGuidance);
                } else {
                    setCenterObject(null);
                    setGuidance({ direction: 'none', message: 'ไม่เจอวัตถุ กวาดกล้องช้าๆ' });
                }
            } catch (error) {
                console.error('Detection error:', error);
            }

            // Run at ~10 FPS for performance
            setTimeout(() => {
                animationFrameRef.current = requestAnimationFrame(detect);
            }, 100);
        };

        detect();

        return () => {
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
            }
        };
    }, [enabled, isLoading, videoRef, calculateGuidance]);

    // Speak guidance (throttled)
    const speakGuidance = useCallback((text) => {
        const now = Date.now();
        if (now - lastSpeakTimeRef.current < 2000) return; // Throttle to 2s

        if ('speechSynthesis' in window) {
            // Cancel any ongoing speech
            speechSynthesis.cancel();

            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = 'th-TH';
            utterance.rate = 1.2;
            utterance.pitch = 1.0;
            speechSynthesis.speak(utterance);
            lastSpeakTimeRef.current = now;
        }
    }, []);

    return {
        isLoading,
        detections,
        centerObject,
        guidance,
        speakGuidance
    };
}

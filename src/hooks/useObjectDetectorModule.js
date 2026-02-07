/**
 * Object Detector Module (Not a Hook - for Dynamic Import)
 * This module provides object detection functionality using TensorFlow.js COCO-SSD
 * Designed to be dynamically imported to avoid SSR issues with TensorFlow.js
 */

export async function useObjectDetectorModule(videoElement) {
    if (typeof window === 'undefined' || !videoElement) {
        return null;
    }

    try {
        // Import TensorFlow.js and COCO-SSD
        const tf = await import('@tensorflow/tfjs');
        const cocoSsd = await import('@tensorflow-models/coco-ssd');

        console.log('Loading COCO-SSD model...');
        const model = await cocoSsd.load();
        console.log('COCO-SSD model loaded!');

        let animationFrameId = null;
        let lastSpeakTime = 0;
        let currentGuidance = null;
        let currentCenterObject = null;
        let currentDetections = [];

        // Calculate guidance direction
        const calculateGuidance = (detection, videoWidth, videoHeight) => {
            if (!detection) return null;

            const [x, y, width, height] = detection.bbox;
            const centerX = x + width / 2;
            const centerY = y + height / 2;

            const frameCenterX = videoWidth / 2;
            const frameCenterY = videoHeight / 2;

            const toleranceX = videoWidth * 0.2;
            const toleranceY = videoHeight * 0.2;

            const diffX = centerX - frameCenterX;
            const diffY = centerY - frameCenterY;

            if (Math.abs(diffX) < toleranceX && Math.abs(diffY) < toleranceY) {
                return { direction: 'center', message: 'อยู่ตรงกลางแล้ว พร้อมถ่าย' };
            }

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
        };

        // Speak guidance (throttled)
        const speakGuidance = (text) => {
            const now = Date.now();
            if (now - lastSpeakTime < 2000) return;

            if ('speechSynthesis' in window) {
                speechSynthesis.cancel();
                const utterance = new SpeechSynthesisUtterance(text);
                utterance.lang = 'th-TH';
                utterance.rate = 1.2;
                utterance.pitch = 1.0;
                speechSynthesis.speak(utterance);
                lastSpeakTime = now;
            }
        };

        // Detection loop
        const detect = async () => {
            if (videoElement.readyState < 2) {
                animationFrameId = requestAnimationFrame(detect);
                return;
            }

            try {
                const predictions = await model.detect(videoElement);
                currentDetections = predictions;

                if (predictions.length > 0) {
                    const videoWidth = videoElement.videoWidth;
                    const videoHeight = videoElement.videoHeight;
                    const frameCenterX = videoWidth / 2;
                    const frameCenterY = videoHeight / 2;

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

                    currentCenterObject = sorted[0];
                    currentGuidance = calculateGuidance(currentCenterObject, videoWidth, videoHeight);
                } else {
                    currentCenterObject = null;
                    currentGuidance = { direction: 'none', message: 'ไม่เจอวัตถุ กวาดกล้องช้าๆ' };
                }
            } catch (error) {
                console.error('Detection error:', error);
            }

            setTimeout(() => {
                animationFrameId = requestAnimationFrame(detect);
            }, 100);
        };

        // Start detection
        detect();

        // Return detector interface
        return {
            get detections() { return currentDetections; },
            get centerObject() { return currentCenterObject; },
            get guidance() { return currentGuidance; },
            speakGuidance,
            cleanup: () => {
                if (animationFrameId) {
                    cancelAnimationFrame(animationFrameId);
                }
                speechSynthesis.cancel();
            }
        };

    } catch (error) {
        console.error('Failed to initialize object detector:', error);
        return null;
    }
}

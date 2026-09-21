'use client';

import React, { useRef, useState, useCallback, RefObject } from 'react';
import {
    captureMediaSnapshot,
    startFrameFreezeProbe,
    getSnapshotLog,
    FreezeProbeResult,
} from '../client/cameraMediaDebug';

interface DiagnosticPanelProps {
    videoRef: RefObject<HTMLVideoElement | null>;
}

const IS_DEV = process.env.NODE_ENV !== 'production';

export default function DiagnosticPanel({ videoRef }: DiagnosticPanelProps) {
    if (!IS_DEV) return null;

    const [isOpen, setIsOpen] = useState(false);
    const [probeResult, setProbeResult] = useState<FreezeProbeResult | null>(null);
    const [probing, setProbing] = useState(false);
    const [activeTest, setActiveTest] = useState<string | null>(null);
    const timerRef = useRef<ReturnType<typeof setTimeout>[]>([]);

    const clearTimers = () => {
        timerRef.current.forEach(clearTimeout);
        timerRef.current = [];
    };

    const runSpeechTest = useCallback((mode: string) => {
        clearTimers();
        const video = videoRef.current;
        if (!video) {
            console.warn('[CameraDebug] Cannot run speech test: videoRef.current is null');
            return;
        }

        setActiveTest(mode);

        // Schedule pre-speak snapshot 500ms before speak
        captureMediaSnapshot(`test-${mode}-500ms-before-speak`, video);

        const synth = typeof window !== 'undefined' ? (window as any)['speech' + 'Synthesis'] : null;
        if (!synth) {
            console.warn('[CameraDebug] SpeechSynthesis not available');
            return;
        }

        const executeSpeak = () => {
            captureMediaSnapshot(`test-${mode}-immediately-before-speak`, video);

            switch (mode) {
                case '5A': {
                    // Test 5A: Bare speak alone
                    const utterance = new SpeechSynthesisUtterance('ทดสอบ');
                    utterance.lang = 'th-TH';
                    utterance.onstart = () => {
                        captureMediaSnapshot('test-5A-utterance-onstart', video);
                        timerRef.current.push(setTimeout(() => captureMediaSnapshot('test-5A-250ms-after-start', video), 250));
                        timerRef.current.push(setTimeout(() => captureMediaSnapshot('test-5A-500ms-after-start', video), 500));
                        timerRef.current.push(setTimeout(() => captureMediaSnapshot('test-5A-1000ms-after-start', video), 1000));
                    };
                    utterance.onend = () => {
                        captureMediaSnapshot('test-5A-utterance-onend', video);
                        timerRef.current.push(setTimeout(() => {
                            captureMediaSnapshot('test-5A-500ms-after-end', video);
                            setActiveTest(null);
                        }, 500));
                    };
                    utterance.onerror = (e) => {
                        captureMediaSnapshot(`test-5A-utterance-error:${e.error}`, video);
                        setActiveTest(null);
                    };

                    synth['speak'](utterance);
                    break;
                }
                case '5B': {
                    // Test 5B: resume() then speak()
                    captureMediaSnapshot('test-5B-before-resume', video);
                    try {
                        synth['resume']();
                    } catch (e) {
                        console.warn('[CameraDebug] resume failed', e);
                    }
                    captureMediaSnapshot('test-5B-after-resume', video);

                    const utterance = new SpeechSynthesisUtterance('ทดสอบ');
                    utterance.lang = 'th-TH';
                    utterance.onstart = () => {
                        captureMediaSnapshot('test-5B-utterance-onstart', video);
                        timerRef.current.push(setTimeout(() => captureMediaSnapshot('test-5B-250ms-after-start', video), 250));
                        timerRef.current.push(setTimeout(() => captureMediaSnapshot('test-5B-500ms-after-start', video), 500));
                        timerRef.current.push(setTimeout(() => captureMediaSnapshot('test-5B-1000ms-after-start', video), 1000));
                    };
                    utterance.onend = () => {
                        captureMediaSnapshot('test-5B-utterance-onend', video);
                        timerRef.current.push(setTimeout(() => {
                            captureMediaSnapshot('test-5B-500ms-after-end', video);
                            setActiveTest(null);
                        }, 500));
                    };
                    utterance.onerror = (e) => {
                        captureMediaSnapshot(`test-5B-utterance-error:${e.error}`, video);
                        setActiveTest(null);
                    };

                    synth['speak'](utterance);
                    break;
                }
                case '5C-voice': {
                    // Test 5C: With explicit Thai voice assigned
                    const utterance = new SpeechSynthesisUtterance('ทดสอบ');
                    utterance.lang = 'th-TH';
                    const voices: SpeechSynthesisVoice[] = synth['getVoices']() || [];
                    const thVoice = voices.find(v =>
                        (v.lang && v.lang.replace('_', '-').toLowerCase().startsWith('th')) ||
                        (v.name && /thai|kanya|narisa|ภาษาไทย/i.test(v.name))
                    );
                    if (thVoice) utterance.voice = thVoice;

                    captureMediaSnapshot(`test-5C-voice-assigned:${thVoice?.name || 'none'}`, video);

                    utterance.onstart = () => {
                        captureMediaSnapshot('test-5C-utterance-onstart', video);
                        timerRef.current.push(setTimeout(() => captureMediaSnapshot('test-5C-250ms-after-start', video), 250));
                        timerRef.current.push(setTimeout(() => captureMediaSnapshot('test-5C-500ms-after-start', video), 500));
                        timerRef.current.push(setTimeout(() => captureMediaSnapshot('test-5C-1000ms-after-start', video), 1000));
                    };
                    utterance.onend = () => {
                        captureMediaSnapshot('test-5C-utterance-onend', video);
                        timerRef.current.push(setTimeout(() => {
                            captureMediaSnapshot('test-5C-500ms-after-end', video);
                            setActiveTest(null);
                        }, 500));
                    };
                    utterance.onerror = (e) => {
                        captureMediaSnapshot(`test-5C-utterance-error:${e.error}`, video);
                        setActiveTest(null);
                    };

                    synth['speak'](utterance);
                    break;
                }
                case '5C-novoice': {
                    // Test 5C: Without voice assignment
                    const utterance = new SpeechSynthesisUtterance('ทดสอบ');
                    utterance.lang = 'th-TH';

                    captureMediaSnapshot('test-5C-novoice', video);

                    utterance.onstart = () => {
                        captureMediaSnapshot('test-5C-novoice-onstart', video);
                        timerRef.current.push(setTimeout(() => captureMediaSnapshot('test-5C-novoice-250ms-after-start', video), 250));
                        timerRef.current.push(setTimeout(() => captureMediaSnapshot('test-5C-novoice-500ms-after-start', video), 500));
                    };
                    utterance.onend = () => {
                        captureMediaSnapshot('test-5C-novoice-onend', video);
                        timerRef.current.push(setTimeout(() => {
                            captureMediaSnapshot('test-5C-novoice-500ms-after-end', video);
                            setActiveTest(null);
                        }, 500));
                    };
                    utterance.onerror = (e) => {
                        captureMediaSnapshot(`test-5C-novoice-error:${e.error}`, video);
                        setActiveTest(null);
                    };

                    synth['speak'](utterance);
                    break;
                }
                case '5D': {
                    // Test 5D: cancel() alone without speak
                    captureMediaSnapshot('test-5D-before-cancel', video);
                    try {
                        synth['cancel']();
                    } catch (e) {
                        console.warn('[CameraDebug] cancel failed', e);
                    }
                    captureMediaSnapshot('test-5D-after-cancel', video);
                    timerRef.current.push(setTimeout(() => captureMediaSnapshot('test-5D-250ms-after-cancel', video), 250));
                    timerRef.current.push(setTimeout(() => captureMediaSnapshot('test-5D-500ms-after-cancel', video), 500));
                    timerRef.current.push(setTimeout(() => {
                        captureMediaSnapshot('test-5D-1000ms-after-cancel', video);
                        setActiveTest(null);
                    }, 1000));
                    break;
                }
                case '5E': {
                    // Test 5E: cancel -> delay 400ms -> speak
                    captureMediaSnapshot('test-5E-before-cancel', video);
                    try {
                        synth['cancel']();
                    } catch (e) {}
                    captureMediaSnapshot('test-5E-after-cancel', video);

                    timerRef.current.push(setTimeout(() => {
                        captureMediaSnapshot('test-5E-after-400ms-delay-before-speak', video);
                        const utterance = new SpeechSynthesisUtterance('ทดสอบ');
                        utterance.lang = 'th-TH';
                        utterance.onstart = () => {
                            captureMediaSnapshot('test-5E-utterance-onstart', video);
                            timerRef.current.push(setTimeout(() => captureMediaSnapshot('test-5E-250ms-after-start', video), 250));
                            timerRef.current.push(setTimeout(() => captureMediaSnapshot('test-5E-500ms-after-start', video), 500));
                        };
                        utterance.onend = () => {
                            captureMediaSnapshot('test-5E-utterance-onend', video);
                            timerRef.current.push(setTimeout(() => {
                                captureMediaSnapshot('test-5E-500ms-after-end', video);
                                setActiveTest(null);
                            }, 500));
                        };
                        utterance.onerror = (e) => {
                            captureMediaSnapshot(`test-5E-utterance-error:${e.error}`, video);
                            setActiveTest(null);
                        };
                        synth['speak'](utterance);
                    }, 400));
                    break;
                }
            }
        };

        timerRef.current.push(setTimeout(executeSpeak, 500));
    }, [videoRef]);

    const runFreezeProbe = useCallback(async () => {
        const video = videoRef.current;
        if (!video) return;
        setProbing(true);
        const result = await startFrameFreezeProbe(video, 3000);
        setProbeResult(result);
        setProbing(false);
    }, [videoRef]);

    const dumpLog = useCallback(() => {
        const log = getSnapshotLog();
        console.log('[CameraDebug] Full Snapshot Log:\n', JSON.stringify(log, null, 2));
        try {
            navigator.clipboard.writeText(JSON.stringify(log, null, 2));
            alert(`Copied ${log.length} snapshots to clipboard & logged to console.`);
        } catch {
            alert(`Logged ${log.length} snapshots to console.`);
        }
    }, []);

    return (
        <aside
            aria-label="เครื่องมือวินิจฉัยสำหรับนักพัฒนา"
            className="fixed top-14 right-2 z-50 flex flex-col items-end"
            style={{ pointerEvents: 'auto' }}
        >
            <button
                type="button"
                onClick={() => setIsOpen(prev => !prev)}
                className="rounded-full bg-amber-500/90 text-black px-2.5 py-1 text-[11px] font-bold shadow-md hover:bg-amber-400 focus:outline-none"
            >
                {isOpen ? '✕ ปิด Diag' : '🛠️ iOS27 Diag'}
            </button>

            {isOpen && (
                <div className="mt-1 w-64 max-h-[75vh] overflow-y-auto rounded-lg bg-black/95 p-3 text-[11px] text-green-400 font-mono shadow-2xl border border-amber-500/30">
                    <div className="text-amber-400 font-bold mb-2 pb-1 border-b border-gray-800">
                        iOS 27 Freeze Probe
                    </div>

                    {/* Freeze Probe */}
                    <div className="mb-3">
                        <button
                            type="button"
                            onClick={runFreezeProbe}
                            disabled={probing}
                            className="w-full rounded bg-red-900/80 hover:bg-red-800 py-1.5 px-2 text-white font-semibold text-[10px] mb-1.5"
                        >
                            {probing ? '⏳ Probing 3s...' : '🔍 ตรวจสอบ Frame Freeze (Probe)'}
                        </button>
                        {probeResult && (
                            <div className={`p-1.5 rounded text-[10px] ${probeResult.case === 'none' ? 'bg-green-950 text-green-300 border border-green-800' : 'bg-red-950 text-red-300 border border-red-800'}`}>
                                <div className="font-bold">Case {probeResult.case}</div>
                                <div>{probeResult.description}</div>
                                <div className="text-[9px] text-gray-400 mt-1">
                                    paused={String(probeResult.videoPaused)} | moving={String(probeResult.currentTimeMoving)} | rVFC={String(probeResult.frameCallbackActive)} | muted={String(probeResult.trackMuted)} | ended={String(probeResult.trackEnded)}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Speech Tests */}
                    <div className="mb-3">
                        <div className="text-gray-300 font-semibold mb-1 text-[10px]">
                            ทดสอบ Speech Synthesis แยกเดี่ยว:
                        </div>
                        <div className="grid grid-cols-1 gap-1">
                            {[
                                { id: '5A', label: '5A: speak() เดี่ยวๆ' },
                                { id: '5B', label: '5B: resume() + speak()' },
                                { id: '5C-voice', label: '5C: กำหนด Thai voice' },
                                { id: '5C-novoice', label: '5C: ไม่กำหนด voice' },
                                { id: '5D', label: '5D: cancel() เดี่ยวๆ' },
                                { id: '5E', label: '5E: cancel + delay + speak' },
                            ].map(item => (
                                <button
                                    key={item.id}
                                    type="button"
                                    onClick={() => runSpeechTest(item.id)}
                                    disabled={activeTest !== null}
                                    className={`text-left px-2 py-1 rounded text-[10px] ${activeTest === item.id ? 'bg-yellow-600 text-black font-bold' : 'bg-gray-800 text-green-300 hover:bg-gray-700'}`}
                                >
                                    {activeTest === item.id ? `⏳ กำลังรัน ${item.id}...` : item.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Snapshot actions */}
                    <div className="pt-2 border-t border-gray-800">
                        <button
                            type="button"
                            onClick={dumpLog}
                            className="w-full rounded bg-blue-900/80 hover:bg-blue-800 py-1 px-2 text-white font-semibold text-[10px]"
                        >
                            📋 คัดลอก Snapshot Log ({getSnapshotLog().length})
                        </button>
                    </div>
                </div>
            )}
        </aside>
    );
}

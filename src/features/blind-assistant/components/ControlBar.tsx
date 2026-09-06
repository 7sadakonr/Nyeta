import React from 'react';
import { BlindMode, AssistantStatus } from '@/features/blind-assistant/types/assistant';
import { CapturedCurrency } from '@/features/blind-assistant/hooks/useCurrencyScanner';
import { MicIcon, SendIcon, Volume2Icon, VolumeXIcon, TrashIcon, RotateCcwIcon } from '@/shared/ui/icons/ControlBarIcons';

export interface ControlBarProps {
    mode: BlindMode;
    aiReady: boolean;
    aiStatus: AssistantStatus;
    isSpeaking: boolean;
    isListening: boolean;
    docText: string | null;
    isReading?: boolean;
    isProcessingDoc: boolean;
    currencyResult: CapturedCurrency | null;
    currencyScanning: boolean;
    currencyMonitoring: boolean;
    totalAmount?: number;
    hasAssistantMessages?: boolean;
    isGuidanceMuted?: boolean;
    isBlocked?: boolean;
    readerAligned: boolean;
    onCapture: () => void;
    onStopSpeaking: () => void;
    onToggleGuidance?: () => void;
    onStartListening: () => void;
    onStopListening: () => void;
    onCurrencyCapture: () => void;
    onReplayCurrencyDetails: () => void;
    onClearTotal: () => void;
    onClearMessages?: () => void;
    onReadAgain?: () => void;
    onReadDocument: () => void;
    onReplayDocument?: () => void;
    onStopReading?: () => void;
}

interface ActionButtonProps extends React.HTMLAttributes<HTMLDivElement> {
    tone?: 'primary' | 'secondary' | 'danger';
    wide?: boolean;
    disabled?: boolean;
}

const ActionButton = React.forwardRef<HTMLDivElement, ActionButtonProps>(function ActionButton({ tone = 'secondary', wide = false, className = '', children, onClick, ...props }, ref) {
    const toneClass = tone === 'primary'
        ? 'bg-[#0A84FF] text-white active:bg-[#0070DF]'
        : tone === 'danger'
            ? 'bg-[#3A1418] text-[#FF453A] active:bg-[#4A1A1F]'
            : 'bg-[#2C2C2E] text-white active:bg-[#3A3A3C]';

    const disabled = props.disabled;
    const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (!disabled && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            onClick?.(e as any);
        }
    };

    return (
        <div
            ref={ref}
            role="button"
            tabIndex={disabled ? -1 : 0}
            className={`${wide ? 'w-full' : 'min-w-0'} flex min-h-[3.5rem] items-center justify-center rounded-xl px-4 text-[17px] font-semibold transition-colors cursor-pointer ${disabled ? 'cursor-not-allowed opacity-40' : ''} ${toneClass} ${className}`}
            onClick={disabled ? undefined : onClick}
            onKeyDown={handleKeyDown}
            {...props}
        >
            {children}
        </div>
    );
});

export default function ControlBar({
    mode,
    aiReady,
    aiStatus,
    isSpeaking,
    isListening,
    docText,
    isReading,
    isProcessingDoc,
    currencyResult,
    currencyScanning,
    totalAmount = 0,
    hasAssistantMessages = false,
    isGuidanceMuted = false,
    readerAligned,
    onCapture,
    onStopSpeaking,
    onToggleGuidance,
    onStartListening,
    onStopListening,
    onCurrencyCapture,
    onReplayCurrencyDetails,
    onClearTotal,
    onClearMessages,
    onReadAgain,
    onReadDocument,
    onReplayDocument,
    onStopReading,
}: ControlBarProps) {
    const isBusy = aiStatus === 'thinking';
    const canCapture = aiReady && !isBusy && !isListening;
    const canRead = aiReady && !isProcessingDoc && !isBusy;
    const describeSceneRef = React.useRef<HTMLDivElement | null>(null);
    const hasFocusedDescribeSceneRef = React.useRef(false);

    React.useEffect(() => {
        if (mode !== 'assistant') {
            hasFocusedDescribeSceneRef.current = false;
            return;
        }
        if (canCapture && !hasFocusedDescribeSceneRef.current) {
            hasFocusedDescribeSceneRef.current = true;
            // Delay focus so it doesn't overlap with the audio-activation announcement.
            const timerId = setTimeout(() => describeSceneRef.current?.focus(), 800);
            return () => clearTimeout(timerId);
        }
    }, [canCapture, mode]);

    return (
        <div data-testid="blind-action-dock" className="relative z-20 shrink-0 border-t border-white/[0.15] bg-black/80 px-4 pb-4 pt-3 backdrop-blur-2xl" role="group" aria-label="ปุ่มควบคุม">
            {mode === 'assistant' && (
                <div className="mx-auto w-full max-w-xl space-y-3">
                    <ActionButton
                        ref={describeSceneRef}
                        wide
                        tone="primary"
                        disabled={!canCapture}
                        onClick={onCapture}
                        aria-busy={isBusy}
                        aria-label={isBusy ? 'AI กำลังคิด รอสักครู่' : 'บรรยายสิ่งที่เห็น'}
                    >
                        {isBusy ? 'กำลังประมวลผล...' : 'บรรยายสิ่งที่เห็น'}
                    </ActionButton>
                    <div className="grid grid-cols-3 gap-3">
                        <ActionButton
                            tone={isListening ? 'danger' : 'secondary'}
                            onClick={isListening ? onStopListening : onStartListening}
                            aria-label={isListening ? 'หยุดและส่ง' : 'ถามด้วยเสียง'}
                            aria-pressed={isListening}
                        >
                            {isListening ? <SendIcon className="size-7" /> : <MicIcon className="size-7" />}
                            <span className="sr-only">{isListening ? 'หยุดและส่ง' : 'ถามด้วยเสียง'}</span>
                        </ActionButton>
                        {hasAssistantMessages ? (
                            <ActionButton disabled={!hasAssistantMessages || isBusy} onClick={onReadAgain} aria-label="อ่านใหม่">
                                <RotateCcwIcon className="size-7" />
                                <span className="sr-only">อ่านใหม่</span>
                            </ActionButton>
                        ) : (
                            <ActionButton
                                tone={isGuidanceMuted ? 'danger' : 'secondary'}
                                onClick={onToggleGuidance || onStopSpeaking}
                                aria-label={isGuidanceMuted ? 'เปิดเสียง' : 'หยุดเสียง'}
                                aria-pressed={isGuidanceMuted}
                            >
                                {isGuidanceMuted ? <VolumeXIcon className="size-7" /> : <Volume2Icon className="size-7" />}
                                <span className="sr-only">{isGuidanceMuted ? 'เปิดเสียง' : 'หยุดเสียง'}</span>
                            </ActionButton>
                        )}
                        <ActionButton disabled={!hasAssistantMessages} onClick={onClearMessages} aria-label="ล้างแชท">
                            <TrashIcon className="size-7" />
                            <span className="sr-only">ล้างแชท</span>
                        </ActionButton>
                    </div>
                </div>
            )}

            {mode === 'currency' && (
                <div className="mx-auto w-full max-w-xl space-y-3">
                    <ActionButton wide tone="primary" disabled={!aiReady || currencyScanning} onClick={onCurrencyCapture} aria-label="ถ่ายเองเพื่อสแกนเงินตอนนี้">ถ่ายเอง</ActionButton>
                    <div className="grid grid-cols-2 gap-3">
                        <ActionButton disabled={!currencyResult} onClick={onReplayCurrencyDetails} aria-label="ฟังรายละเอียดเงินล่าสุด">ฟังรายละเอียด</ActionButton>
                        <ActionButton tone="danger" disabled={totalAmount === 0 && !currencyResult} onClick={onClearTotal} aria-label={`ล้างยอดเงินสะสม ปัจจุบัน ${totalAmount} บาท`}>ล้างยอด</ActionButton>
                    </div>
                </div>
            )}

            {mode === 'reader' && (
                <div className="mx-auto w-full max-w-xl space-y-3">
                    <ActionButton wide tone="primary" disabled={!canRead} onClick={onReadDocument} aria-busy={isProcessingDoc || isBusy} aria-label={isProcessingDoc || isBusy ? 'กำลังอ่านเอกสาร รอสักครู่' : readerAligned ? 'อ่านเอกสาร' : 'ถ่ายหน้าเอกสารเพื่ออ่าน'}>{isProcessingDoc || isBusy ? 'กำลังประมวลผล...' : 'อ่านเอกสาร'}</ActionButton>
                </div>
            )}
        </div>
    );
}

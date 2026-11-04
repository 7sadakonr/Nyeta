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
    /** Called when a locked (aria-disabled) button is pressed, so the press is never silent. */
    onDisabledPress?: () => void;
}

interface ActionButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'disabled'> {
    tone?: 'primary' | 'secondary' | 'danger';
    wide?: boolean;
    disabled?: boolean;
    onDisabledPress?: () => void;
}

const ActionButton = React.forwardRef<HTMLButtonElement, ActionButtonProps>(function ActionButton({ tone = 'secondary', wide = false, disabled = false, className = '', children, onClick, onDisabledPress, ...props }, ref) {
    const toneClass = tone === 'primary'
        ? 'bg-[#0A84FF] text-white active:bg-[#0070DF]'
        : tone === 'danger'
            ? 'bg-[#3A1418] text-[#FF453A] active:bg-[#4A1A1F]'
            : 'bg-[#2C2C2E] text-white active:bg-[#3A3A3C]';

    return (
        <button
            ref={ref}
            type="button"
            aria-disabled={disabled || undefined}
            className={`${wide ? 'w-full' : 'min-w-0'} flex min-h-[3.5rem] items-center justify-center rounded-xl px-4 text-[17px] font-semibold transition-colors cursor-pointer ${disabled ? 'cursor-not-allowed opacity-40' : ''} ${toneClass} ${className}`}
            onClick={disabled ? () => onDisabledPress?.() : onClick}
            {...props}
        >
            {children}
        </button>
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
    onDisabledPress,
}: ControlBarProps) {
    const isBusy = aiStatus === 'thinking';
    const canCapture = aiReady && !isBusy && !isListening;
    const canRead = aiReady && !isProcessingDoc && !isBusy;
    const describeSceneRef = React.useRef<HTMLButtonElement | null>(null);
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
        <div data-testid="blind-action-dock" className="relative z-20 shrink-0 bg-[#090909]/80 px-4 pb-4 pt-3 backdrop-blur-2xl">
            {mode === 'assistant' && (
                <div className="mx-auto w-full max-w-xl space-y-3">
                    <ActionButton
                        ref={describeSceneRef}
                        wide
                        tone="primary"
                        disabled={!canCapture}
                        onClick={onCapture}
                        onDisabledPress={onDisabledPress}
                        aria-busy={isBusy}
                        aria-label={isBusy
                            ? 'AI กำลังคิด รอสักครู่'
                            : !aiReady
                                ? 'กล้องยังไม่พร้อม รอสักครู่'
                                : isListening
                                    ? 'กำลังฟังอยู่ กดหยุดและส่งก่อน'
                                    : 'บรรยายสิ่งที่เห็น'}
                    >
                        {isBusy ? 'กำลังประมวลผล...' : !aiReady ? 'กำลังเปิดกล้อง...' : 'บรรยายสิ่งที่เห็น'}
                    </ActionButton>
                    <div className="grid grid-cols-3 gap-3">
                        <ActionButton
                            tone={isListening ? 'danger' : 'secondary'}
                            onClick={isListening ? onStopListening : onStartListening}
                            aria-label={isListening ? 'หยุดและส่ง' : 'ถามด้วยเสียง'}
                            aria-pressed={isListening}
                        >
                            {isListening ? <SendIcon className="size-7" /> : <MicIcon className="size-7" />}
                        </ActionButton>
                        {hasAssistantMessages ? (
                            <ActionButton disabled={!hasAssistantMessages || isBusy} onClick={onReadAgain} aria-label="อ่านใหม่">
                                <RotateCcwIcon className="size-7" />
                            </ActionButton>
                        ) : (
                            <ActionButton
                                tone={isGuidanceMuted ? 'danger' : 'secondary'}
                                onClick={onToggleGuidance || onStopSpeaking}
                                aria-label={isGuidanceMuted ? 'เปิดเสียง' : 'หยุดเสียง'}
                                aria-pressed={isGuidanceMuted}
                            >
                                {isGuidanceMuted ? <VolumeXIcon className="size-7" /> : <Volume2Icon className="size-7" />}
                            </ActionButton>
                        )}
                        <ActionButton disabled={!hasAssistantMessages} onClick={onClearMessages} aria-label="ล้างแชท">
                            <TrashIcon className="size-7" />
                        </ActionButton>
                    </div>
                </div>
            )}

            {mode === 'currency' && (
                <div className="mx-auto w-full max-w-xl space-y-3">
                    <ActionButton wide tone="primary" disabled={!aiReady} onClick={onCurrencyCapture} aria-label="ถ่ายเองเพื่อสแกนเงินตอนนี้">ถ่ายเอง</ActionButton>
                    <div className="grid grid-cols-2 gap-3">
                        <ActionButton disabled={!currencyResult} onClick={onReplayCurrencyDetails} aria-label="ฟังรายละเอียดเงินล่าสุด">ฟังรายละเอียด</ActionButton>
                        <ActionButton tone="danger" disabled={totalAmount === 0 && !currencyResult} onClick={onClearTotal} aria-label={`ล้างยอดเงินสะสม ปัจจุบัน ${totalAmount} บาท`}>ล้างยอด</ActionButton>
                    </div>
                </div>
            )}

            {mode === 'reader' && (
                <div className="mx-auto w-full max-w-xl space-y-3">
                    <ActionButton wide tone="primary" disabled={!canRead} onClick={onReadDocument} onDisabledPress={onDisabledPress} aria-busy={isProcessingDoc || isBusy} aria-label={isProcessingDoc || isBusy ? 'กำลังอ่านเอกสาร รอสักครู่' : docText ? 'อ่านหน้าใหม่' : readerAligned ? 'อ่านเอกสาร' : 'ถ่ายหน้าเอกสารเพื่ออ่าน'}>{isProcessingDoc || isBusy ? 'กำลังประมวลผล...' : docText ? 'อ่านหน้าใหม่' : 'อ่านเอกสาร'}</ActionButton>
                </div>
            )}
        </div>
    );
}

import React from 'react';
import { BlindMode, AssistantStatus } from '@/features/blind-assistant/types/assistant';
import { CapturedCurrency } from '@/features/blind-assistant/hooks/useCurrencyScanner';
import { focusProgrammatically } from '@/shared/accessibility/programmaticFocus';
import { MicIcon, SendIcon, Volume2Icon, VolumeXIcon, TrashIcon, RotateCcwIcon } from '@/shared/ui/icons/ControlBarIcons';

export interface ControlBarProps {
    mode: BlindMode;
    aiReady: boolean;
    aiStatus: AssistantStatus;
    isListening: boolean;
    docText: string | null;
    isProcessingDoc: boolean;
    currencyResult: CapturedCurrency | null;
    currencyScanning: boolean;
    totalAmount?: number;
    hasAssistantMessages?: boolean;
    isGuidanceMuted?: boolean;
    readerAligned: boolean;
    /** The camera could not be opened: the main button becomes "try again" instead of waiting forever. */
    cameraError?: boolean;
    onCapture: () => void;
    onToggleGuidance?: () => void;
    onStartListening: () => void;
    onStopListening: () => void;
    onCurrencyCapture: () => void;
    onReplayCurrencyDetails: () => void;
    onClearTotal: () => void;
    onClearMessages?: () => void;
    onReadAgain?: () => void;
    onReadDocument: () => void;
    onRetryCamera?: () => void;
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

// The describe button is focused once, the first time the app opens. Doing it on every return to the AI tab
// would yank the VoiceOver cursor away from wherever the user had navigated to.
let hasAutoFocusedDescribeScene = false;

export default function ControlBar({
    mode,
    aiReady,
    aiStatus,
    isListening,
    docText,
    isProcessingDoc,
    currencyResult,
    currencyScanning,
    totalAmount = 0,
    hasAssistantMessages = false,
    isGuidanceMuted = false,
    readerAligned,
    cameraError = false,
    onCapture,
    onToggleGuidance,
    onStartListening,
    onStopListening,
    onCurrencyCapture,
    onReplayCurrencyDetails,
    onClearTotal,
    onClearMessages,
    onReadAgain,
    onReadDocument,
    onRetryCamera,
    onDisabledPress,
}: ControlBarProps) {
    const isBusy = aiStatus === 'thinking';
    const canCapture = aiReady && !isBusy && !isListening;
    const canRead = aiReady && !isProcessingDoc && !isBusy;
    const describeSceneRef = React.useRef<HTMLButtonElement | null>(null);

    React.useEffect(() => {
        if (mode !== 'assistant' || !canCapture || hasAutoFocusedDescribeScene) return;
        // Delay focus so it doesn't overlap with the audio-activation announcement.
        const timerId = setTimeout(() => {
            if (hasAutoFocusedDescribeScene) return;
            // Only when nothing else has focus yet: never steal it from a control the user already reached.
            if (document.activeElement && document.activeElement !== document.body) return;
            hasAutoFocusedDescribeScene = true;
            focusProgrammatically(describeSceneRef.current);
        }, 800);
        return () => clearTimeout(timerId);
    }, [canCapture, mode]);

    const describeLabel = cameraError
        ? 'เปิดกล้องไม่ได้ กดเพื่อลองอีกครั้ง'
        : isBusy
            ? 'AI กำลังคิด รอสักครู่'
            : !aiReady
                ? 'กล้องยังไม่พร้อม รอสักครู่'
                : isListening
                    ? 'กำลังฟังอยู่ กดหยุดและส่งก่อน'
                    : 'บรรยายสิ่งที่เห็น';

    const readLabel = cameraError
        ? 'เปิดกล้องไม่ได้ กดเพื่อลองอีกครั้ง'
        : isProcessingDoc || isBusy
            ? 'กำลังอ่านเอกสาร รอสักครู่'
            : docText
                ? 'อ่านหน้าใหม่'
                : 'อ่านเอกสาร';

    // One switch for every camera mode: the setting is global, so it must be visible and reversible everywhere.
    const guidanceSwitch = (
        <ActionButton
            role="switch"
            aria-checked={!isGuidanceMuted}
            aria-label="เสียงนำทาง"
            tone={isGuidanceMuted ? 'danger' : 'secondary'}
            onClick={onToggleGuidance}
        >
            {isGuidanceMuted ? <VolumeXIcon className="size-7" aria-hidden="true" /> : <Volume2Icon className="size-7" aria-hidden="true" />}
        </ActionButton>
    );

    return (
        <div data-testid="blind-action-dock" className="relative z-20 shrink-0 bg-[#090909]/80 px-4 pb-4 pt-3 backdrop-blur-2xl">
            {mode === 'assistant' && (
                <div className="mx-auto w-full max-w-xl space-y-3">
                    <ActionButton
                        ref={describeSceneRef}
                        wide
                        tone="primary"
                        disabled={cameraError ? false : !canCapture}
                        onClick={cameraError ? onRetryCamera : onCapture}
                        onDisabledPress={onDisabledPress}
                        aria-busy={isBusy}
                    >
                        {describeLabel}
                    </ActionButton>
                    <div className="grid grid-cols-4 gap-3">
                        <ActionButton
                            tone={isListening ? 'danger' : 'secondary'}
                            disabled={isBusy}
                            onClick={isListening ? onStopListening : onStartListening}
                            onDisabledPress={onDisabledPress}
                            aria-label={isListening ? 'หยุดและส่งคำถาม' : 'ถามด้วยเสียง'}
                        >
                            {isListening ? <SendIcon className="size-7" aria-hidden="true" /> : <MicIcon className="size-7" aria-hidden="true" />}
                        </ActionButton>
                        {guidanceSwitch}
                        <ActionButton
                            disabled={!hasAssistantMessages || isBusy}
                            onClick={onReadAgain}
                            onDisabledPress={onDisabledPress}
                            aria-label="อ่านใหม่"
                        >
                            <RotateCcwIcon className="size-7" aria-hidden="true" />
                        </ActionButton>
                        <ActionButton
                            disabled={!hasAssistantMessages}
                            onClick={onClearMessages}
                            onDisabledPress={onDisabledPress}
                            aria-label="ล้างแชท"
                        >
                            <TrashIcon className="size-7" aria-hidden="true" />
                        </ActionButton>
                    </div>
                </div>
            )}

            {mode === 'currency' && (
                <div className="mx-auto w-full max-w-xl space-y-3">
                    <ActionButton
                        wide
                        tone="primary"
                        disabled={cameraError ? false : !aiReady}
                        onClick={cameraError ? onRetryCamera : onCurrencyCapture}
                        onDisabledPress={onDisabledPress}
                        aria-label={cameraError ? 'เปิดกล้องไม่ได้ กดเพื่อลองอีกครั้ง' : currencyScanning ? 'กำลังตรวจเงิน กดเพื่อถ่ายเองใหม่' : 'ถ่ายเอง'}
                    >
                        {cameraError ? 'เปิดกล้องไม่ได้ กดเพื่อลองอีกครั้ง' : currencyScanning ? 'กำลังตรวจเงิน กดเพื่อถ่ายเองใหม่' : 'ถ่ายเอง'}
                    </ActionButton>
                    <div className="grid grid-cols-3 gap-3">
                        <ActionButton disabled={!currencyResult} onClick={onReplayCurrencyDetails} onDisabledPress={onDisabledPress}>ฟังรายละเอียด</ActionButton>
                        <ActionButton tone="danger" disabled={totalAmount === 0 && !currencyResult} onClick={onClearTotal} onDisabledPress={onDisabledPress}>ล้างผล</ActionButton>
                        {guidanceSwitch}
                    </div>
                </div>
            )}

            {mode === 'reader' && (
                <div className="mx-auto w-full max-w-xl space-y-3">
                    <ActionButton
                        wide
                        tone="primary"
                        disabled={cameraError ? false : !canRead}
                        onClick={cameraError ? onRetryCamera : onReadDocument}
                        onDisabledPress={onDisabledPress}
                        aria-busy={isProcessingDoc || isBusy}
                        data-aligned={readerAligned || undefined}
                    >
                        {readLabel}
                    </ActionButton>
                    <div className="grid grid-cols-1 gap-3">
                        {guidanceSwitch}
                    </div>
                </div>
            )}
        </div>
    );
}

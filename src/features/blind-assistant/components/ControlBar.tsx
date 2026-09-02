import React from 'react';
import { BlindMode, AssistantStatus } from '@/features/blind-assistant/types/assistant';
import { CapturedCurrency } from '@/features/blind-assistant/hooks/useCurrencyScanner';

export interface ControlBarProps {
    mode: BlindMode;
    aiReady: boolean;
    aiStatus: AssistantStatus;
    isSpeaking: boolean;
    isListening: boolean;
    docText: string | null;
    isReading: boolean;
    isProcessingDoc: boolean;
    currencyResult: CapturedCurrency | null;
    currencyScanning: boolean;
    currencyMonitoring: boolean;
    totalAmount?: number;
    hasAssistantMessages?: boolean;
    isBlocked?: boolean;
    readerAligned: boolean;
    onCapture: () => void;
    onStopSpeaking: () => void;
    onStartListening: () => void;
    onStopListening: () => void;
    onCurrencyCapture: () => void;
    onReplayCurrencyDetails: () => void;
    onClearTotal: () => void;
    onClearMessages?: () => void;
    onReadDocument: () => void;
    onReplayDocument: () => void;
    onStopReading: () => void;
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
    readerAligned,
    onCapture,
    onStopSpeaking,
    onStartListening,
    onStopListening,
    onCurrencyCapture,
    onReplayCurrencyDetails,
    onClearTotal,
    onClearMessages,
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
                    {isListening ? (
                        <ActionButton wide tone="danger" onClick={onStopListening} aria-label="หยุดและส่งคำถาม" aria-pressed="true">หยุดและส่ง</ActionButton>
                    ) : (
                        <ActionButton ref={describeSceneRef} wide tone="primary" disabled={!canCapture} onClick={onCapture} aria-busy={isBusy} aria-label={isBusy ? 'AI กำลังคิด รอสักครู่' : 'บรรยายสิ่งที่เห็น'}>{isBusy ? 'กำลังประมวลผล...' : 'บรรยายสิ่งที่เห็น'}</ActionButton>
                    )}
                    <div className="grid grid-cols-3 gap-3">
                        <ActionButton onClick={isListening ? onStopListening : onStartListening} aria-label={isListening ? 'กำลังฟัง กดอีกครั้งเพื่อหยุดและส่งคำถาม' : 'ถามด้วยเสียง'} aria-pressed={isListening}>{isListening ? 'กำลังฟัง...' : 'ถามด้วยเสียง'}</ActionButton>
                        <ActionButton tone="danger" disabled={!isSpeaking} onClick={onStopSpeaking} aria-label="หยุดเสียง">หยุดเสียง</ActionButton>
                        <ActionButton disabled={!hasAssistantMessages} onClick={onClearMessages} aria-label="ล้างแชท">ล้างแชท</ActionButton>
                    </div>
                </div>
            )}

            {mode === 'currency' && (
                <div className="mx-auto w-full max-w-xl space-y-3">
                    <ActionButton wide tone="primary" disabled={!aiReady || currencyScanning} onClick={onCurrencyCapture} aria-label="ถ่ายเองเพื่อสแกนเงินตอนนี้">ถ่ายเอง</ActionButton>
                    <div className="grid grid-cols-2 gap-3">
                        <ActionButton disabled={!currencyResult} onClick={onReplayCurrencyDetails} aria-label="ฟังรายละเอียดเงินล่าสุด">ฟังรายละเอียด</ActionButton>
                        <ActionButton tone="danger" disabled={totalAmount === 0} onClick={onClearTotal} aria-label={`ล้างยอดเงินสะสม ปัจจุบัน ${totalAmount} บาท`}>ล้างยอด</ActionButton>
                    </div>
                </div>
            )}

            {mode === 'reader' && (
                <div className="mx-auto w-full max-w-xl space-y-3">
                    <ActionButton wide tone="primary" disabled={!canRead} onClick={onReadDocument} aria-busy={isProcessingDoc || isBusy} aria-label={isProcessingDoc || isBusy ? 'กำลังอ่านเอกสาร รอสักครู่' : readerAligned ? 'อ่านเอกสาร' : 'ถ่ายหน้าเอกสารเพื่ออ่านออกเสียง'}>{isProcessingDoc || isBusy ? 'กำลังประมวลผล...' : 'อ่านเอกสาร'}</ActionButton>
                    <div className="grid grid-cols-2 gap-3">
                        <ActionButton disabled={!docText || isReading} onClick={onReplayDocument} aria-label="อ่านซ้ำเอกสาร">อ่านซ้ำ</ActionButton>
                        <ActionButton tone="danger" disabled={!isReading} onClick={onStopReading} aria-label="หยุดอ่านออกเสียง">หยุดอ่าน</ActionButton>
                    </div>
                </div>
            )}
        </div>
    );
}

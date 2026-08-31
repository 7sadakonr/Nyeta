import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

const readTypeScriptSources = (path: string): string[] => readdirSync(resolve(process.cwd(), path), { withFileTypes: true })
    .flatMap((entry) => {
        const relativePath = join(path, entry.name);
        if (entry.isDirectory()) return readTypeScriptSources(relativePath);
        return /\.tsx?$/.test(entry.name) ? [readSource(relativePath)] : [];
    });

const TTS_OWNED_SURFACES = [
    'src/features/blind-assistant/BlindAssistScreen.tsx',
    'src/features/blind-assistant/components/ControlBar.tsx',
    'src/features/calling/BlindCallScreen.tsx',
    'src/features/calling/components/BlindChatOverlay.tsx',
];

describe('TTS and VoiceOver announcement ownership', () => {
    it('does not give TTS-owned realtime surfaces a second live-announcement channel', () => {
        for (const path of TTS_OWNED_SURFACES) {
            const source = readSource(path);
            expect(source).not.toMatch(/\baria-live\s*=/);
            expect(source).not.toMatch(/\brole\s*=\s*["'](?:status|alert)["']/);
        }
    });

    it('keeps TTS paths while removing their duplicate live regions', () => {
        const screen = readSource('src/features/blind-assistant/BlindAssistScreen.tsx');
        const blindShell = readSource('src/features/blind-app/BlindAppShell.tsx');
        const callScreen = readSource('src/features/calling/BlindCallScreen.tsx');
        const chatOverlay = readSource('src/features/calling/components/BlindChatOverlay.tsx');
        const currencyScanner = readSource('src/features/blind-assistant/hooks/useCurrencyScanner.ts');

        expect(screen).toContain("'realtime'");
        expect(screen).toContain("'result'");
        expect(screen).toContain("speechController.stop();");
        expect(screen).not.toContain('ผู้ช่วย AI สำหรับผู้พิการทางสายตา');
        expect(blindShell).toContain("localStorage.setItem('nyeta_blind_mode', nextTab)");
        expect(blindShell).toContain('void hapticRef.current?.trigger(1);');
        expect(screen).not.toMatch(/VoiceOver|voiceover|accessibilitySupport|screenReader/i);
        expect(currencyScanner).not.toContain('โหมดดูสกุลเงินพร้อมแล้ว');
        expect(currencyScanner).toContain("speechController.speak('พร้อมสแกนใบถัดไป'");
        expect(callScreen).toContain("'status'");
        expect(chatOverlay).toContain("'result'");
    });

    it('preserves focus and navigation accessibility', () => {
        const cameraView = readSource('src/features/blind-assistant/components/CameraView.tsx');
        const modeSwitcher = readSource('src/features/blind-assistant/components/ModeSwitcher.tsx');
        const controlBar = readSource('src/features/blind-assistant/components/ControlBar.tsx');
        const chatHistory = readSource('src/features/blind-assistant/components/ChatHistory.tsx');
        const screen = readSource('src/features/blind-assistant/BlindAssistScreen.tsx');
        const topNav = readSource('src/features/blind-assistant/components/TopNavBar.tsx');

        expect(cameraView).toContain('aria-hidden="true"');
        expect(cameraView).not.toMatch(/<(?:button|a|input|select|textarea)\b/i);
        expect(modeSwitcher).toContain('role="tablist"');
        expect(modeSwitcher).toContain('role="tab"');
        expect(modeSwitcher).toContain('aria-selected={mode === item.id}');
        expect(controlBar).toContain('role="group" aria-label="ปุ่มควบคุม"');
        expect(controlBar).toContain('aria-pressed={isListening}');
        expect(controlBar).not.toMatch(/on(?:Mouse|Touch)(?:Down|Up|Start|End|Leave)=/);
        expect(chatHistory).toContain('aria-label="ประวัติการสนทนา"');
        expect(chatHistory).toContain('<details');
        expect(chatHistory).not.toContain('tabIndex={0}');
        expect(topNav).toContain('aria-hidden="true"');
        expect(screen).not.toContain('role="dialog"');
        expect(screen).not.toContain('aria-modal="true"');
        expect(screen).not.toContain('restoreDetailsFocusRef');
        expect(controlBar).not.toContain('onShowCurrencyDetails');
        expect(controlBar).toContain('onReplayCurrencyDetails');
    });

    it('keeps direct Web Speech API calls inside the shared coordinator', () => {
        const featureSources = [
            'src/features/blind-assistant',
            'src/features/calling',
        ];
        for (const path of featureSources) {
            for (const source of readTypeScriptSources(path)) {
                expect(source).not.toMatch(/speechSynthesis\.(?:speak|cancel)/);
            }
        }
    });
});

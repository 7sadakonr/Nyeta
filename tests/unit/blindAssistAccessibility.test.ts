import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

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
        const home = readSource('src/app/page.tsx');
        const callScreen = readSource('src/features/calling/BlindCallScreen.tsx');
        const chatOverlay = readSource('src/features/calling/components/BlindChatOverlay.tsx');
        const currencyScanner = readSource('src/features/blind-assistant/hooks/useCurrencyScanner.ts');
        const objectDetector = readSource('src/features/blind-assistant/hooks/useObjectDetector.ts');

        expect(screen).toContain("owner: 'object-detector'");
        expect(screen).toContain("owner: 'ai-response'");
        expect(screen).not.toContain("owner: 'mode-switch'");
        expect(screen).not.toContain("owner: 'page-mount'");
        expect(screen).not.toContain("owner: 'camera-ready'");
        expect(screen).not.toContain('accessibilityStatus');
        expect(screen).toContain("useAccessibilitySpeechNavigation(undefined, 'preserve')");
        expect(screen).not.toContain("owner: 'assistant-ready'");
        expect(screen).not.toContain('assistantReadyAnnouncedRef');
        expect(screen).not.toContain('ผู้ช่วย AI สำหรับผู้พิการทางสายตา');
        expect(screen).not.toContain('<main');
        expect(home).not.toContain("owner: 'assistant-ready'");
        expect(home).toContain("localStorage.setItem('nyeta_blind_mode', 'assistant')");
        expect(home).toContain('void hapticRef.current?.trigger(5, 100);');
        expect(home).not.toContain('await hapticRef.current?.trigger(5, 100);');
        expect(screen).toContain("useObjectDetector(videoRef, mode === 'assistant')");
        expect(objectDetector).not.toContain('|| !videoRef.current) return;');
        expect(screen).toContain('pendingObjectAnnouncementRef.current = null;');
        expect(screen).toContain("activateFromUserGesture('ผู้ช่วยพร้อม'");
        expect(home).toContain("activateFromUserGesture('ผู้ช่วยพร้อม'");
        expect(screen).toContain('speechManager?.interruptForAccessibilityNavigation();');
        expect(screen).not.toMatch(/VoiceOver|voiceover|accessibilitySupport|screenReader/i);
        expect(currencyScanner).not.toContain('โหมดดูสกุลเงินพร้อมแล้ว');
        expect(currencyScanner).toContain("speechManager?.speak('พร้อมสแกนใบถัดไป'");
        expect(callScreen).toContain("owner: 'call-status'");
        expect(callScreen).toContain('useAccessibilitySpeechNavigation()');
        expect(callScreen).not.toMatch(/<h1[^>]*aria-hidden/);
        expect(chatOverlay).toContain("owner: 'volunteer-message'");
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
        expect(topNav).toContain('<h1 aria-hidden="true"');
        expect(screen).toContain('role="dialog"');
        expect(screen).toContain('aria-modal="true"');
        expect(screen).toContain('restoreDetailsFocusRef');
    });

    it('keeps direct Web Speech API calls inside the shared coordinator', () => {
        const featureSources = [
            'src/features/blind-assistant',
            'src/features/calling',
        ];
        for (const path of featureSources) {
            const result = spawnSync('rg', ['-l', 'speechSynthesis\\.(?:speak|cancel)', path], { cwd: process.cwd(), encoding: 'utf8' });
            expect(result.status).toBe(1);
        }
    });
});

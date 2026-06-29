# Nyeta Project Architecture & Coding Guidelines

## 1. Project Overview
This is a Next.js (App Router) project designed specifically to assist visually impaired users and provide a platform for volunteers to help them.
- **`src/app/blind`**: The core AI assistant interface for the blind.
- **`src/app/volunteer`**: The dashboard for volunteers to receive calls and assist.
- **`src/app/call`**: The WebRTC call room bridging blind users and volunteers.

## 2. Core Architectural Rules (CRITICAL)
If you are tasked to add features or modify code in this project, you MUST adhere to the following rules to prevent the codebase from devolving into an unreadable "God Component" spaghetti:

### A. Strict Separation of Concerns
1. **No God Components**: `src/app/blind/page.js` (and similar entry points) MUST remain as an "Orchestrator" only. It should only glue together state, hooks, and UI components. It should ideally not exceed 200-300 lines.
2. **Business Logic lives in Custom Hooks**: Any complex logic (WebRTC signaling, Camera access, AI calling, Audio synthesis, looping mechanics) MUST be extracted into `src/hooks/`.
   - Examples: `useCamera.js`, `useAiAssistant.js`, `useCurrencyScanner.js`, `useSpeechInput.js`.
3. **UI Elements live in Components**: Visual and interactive elements MUST be extracted to `src/components/` or a sub-folder like `src/components/blind/`.
   - Examples: `CameraView.js`, `TopNavBar.js`, `ModeSwitcher.js`, `ControlBar.js`.
4. **Shared Utilities live in Lib**: Pure functions, constants, and API wrappers MUST go to `src/lib/`.
   - Examples: `audio.js` (Earcons), `tts.js` (Text-to-Speech), `groqVision.js`.

### B. Accessibility & UX Requirements
- **Audio Feedback First**: Every interaction must provide auditory feedback via `playEarcon` (from `@/lib/audio`) or `speakThai` (from `@/lib/tts`).
- **Haptic Feedback**: Use the `HapticFeedback` component (`hapticRef.current?.trigger()`) to provide physical confirmation of actions.
- **Screen Reader Compatibility**: Always include `aria-live`, `aria-label`, and `sr-only` elements for state announcements (e.g., "AI is thinking", "Camera ready").
- **Do NOT rely on visual only**: Do not assume the user can see error messages on the screen. Read them out loud or play an error sound.

### C. Styling & UI
- Use Tailwind CSS.
- Large touch targets for interactive elements (minimum 44x44px, preferably much larger for blind users).
- High contrast colors (e.g., black background, vibrant borders/text).

## 3. Modification Workflow
Before making any changes to main pages like `blind/page.js` or `volunteer/page.js`:
1. Check if the logic can be added to an existing hook or requires a new hook.
2. Check if the UI addition requires a new component in `src/components/`.
3. Avoid inline styles or inline complex functions inside the `render` return block.

By following these rules, the codebase will remain clean, modular, and easily maintainable for all future AI agents and human developers.

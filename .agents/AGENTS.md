# Nyeta Project Architecture & Coding Guidelines

## 1. Project Overview
Nyeta is a Next.js (App Router) + React 19 + TypeScript application designed specifically to assist visually impaired users and provide a platform for volunteers to assist them in real-time.
- **`src/app/blind`**: Core AI vision and assistant interface for blind users.
- **`src/app/volunteer`**: Dashboard for volunteers to receive and manage incoming assistance calls.
- **`src/app/call`**: WebRTC call room bridging blind users and volunteers with live video, audio, and chat.

---

## 2. Architectural Design: Feature-First Structure

The codebase is organized using a **Domain-Driven / Feature-First (Vertical Slice)** architecture:

```text
src/
├── app/                  # Next.js App Router (Routes & Route Handlers only)
│   ├── blind/page.tsx    # Thin orchestrator for blind assistant
│   ├── volunteer/page.tsx# Thin orchestrator for volunteer screen
│   ├── call/[id]/page.tsx# Thin orchestrator for WebRTC call screen
│   └── api/              # Thin route handlers delegating to src/server/
│
├── features/             # Domain-specific features (Vertical slices)
│   ├── blind-assistant/  # AI vision, OCR reader, currency scanner, speech input
│   │   ├── components/   # Feature-specific UI components
│   │   ├── hooks/        # Feature business logic & custom hooks
│   │   ├── client/       # Client-side AI / Gemini vision / OCR utilities
│   │   ├── types/        # Assistant domain types
│   │   └── index.ts      # Public feature exports
│   │
│   └── calling/          # WebRTC, Pusher signaling, video/audio calls, chat
│       ├── components/   # Call UI (ImageViewer, ChatPanel, CaptureControls, etc.)
│       ├── hooks/        # WebRTC hooks (useBlindHelp, useVolunteerHelp, useDataChannel)
│       ├── client/       # Signaling, peer connections, session clients
│       ├── types/        # Call domain types
│       ├── BlindCallScreen.tsx
│       ├── VolunteerScreen.tsx
│       └── index.ts
│
├── shared/               # Truly shared utilities, accessibility, & common UI
│   ├── accessibility/    # Central SpeechManager, TTS, HapticFeedback, Audio earcons
│   ├── audio/            # Audio sound cues and earcon playback
│   ├── speech/           # SpeechManager singleton and TTS synthesis
│   ├── hooks/            # Shared hooks (useWakeLock, useSpeechStatus)
│   ├── ui/               # ErrorBoundary, icons, shared visual components
│   └── types/            # Shared interfaces and type definitions
│
└── server/               # Server-only logic (Secrets, Redis, Pusher, AI Prompts)
    ├── ai/               # Vision prompts and server AI instructions
    ├── auth/             # Session authentication and token signing
    ├── calls/            # Upstash Redis call session store
    ├── realtime/         # Pusher server triggers and channel auth
    ├── security/         # Rate limiting and request validation
    ├── webrtc/           # ICE/TURN server configuration
    └── types.ts          # Server-specific types
```

---

## 3. Core Architectural Rules (CRITICAL)

### A. Strict Separation of Concerns & File Placement
1. **No God Components**: Entry points in `src/app/` MUST remain thin orchestrators (typically under 100-200 lines), delegating UI and lifecycle management to feature components.
2. **Feature Colocation**: Code specific to a domain must live in `src/features/<feature-name>/`.
3. **Shared Rule**: Move code to `src/shared/` ONLY when multiple independent domains genuinely use it.
4. **Server-Only Isolation**: Anything accessing Redis (`@upstash/redis`), server Pusher instances, authentication token signing, API secrets, or server-only environment variables MUST live exclusively in `src/server/`.

### B. TypeScript & Code Standards
- Maintain strict TypeScript mode (`tsc --noEmit` must pass with 0 errors).
- Prefer explicit types for functions, hook returns, and component props.
- Use path aliases configured in `tsconfig.json` (`@/features/...`, `@/shared/...`, `@/server/...`).

### C. Accessibility & UX Requirements
- **Audio Feedback First**: Every interaction must provide auditory feedback via `playEarcon` (from `@/shared/audio/audio`) or `speakThai` (from `@/shared/speech/tts`).
- **Haptic Feedback**: Use `HapticFeedback` (`hapticRef.current?.trigger()`) to provide physical confirmation of actions.
- **Screen Reader Compatibility**: Always include `aria-live`, `aria-label`, and `sr-only` elements for state announcements (e.g., "AI is thinking", "Camera ready").
- **Never Rely on Visuals Alone**: Do not assume the user can see error messages on the screen. Always read them out loud or play an auditory cue.

### D. Styling & UI
- Use Tailwind CSS.
- Large touch targets for interactive elements (minimum 44x44px, preferably larger for blind users).
- High contrast colors (e.g., black background `#000000`, vibrant borders and text).

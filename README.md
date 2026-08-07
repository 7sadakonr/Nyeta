# Nyeta: Real-time Visual Assistance System for the Visually Impaired with AI Integration

**Graduation Project** | **Rajamangala University of Technology Suvarnabhumi Hantra**

---

## 📄 Abstract

**Nyeta** is a modern, accessible web platform designed to empower visually impaired individuals through real-time assistive technology. Built with a **Serverless Vercel-First Architecture**, Nyeta combines **Gemini AI Vision** and **Low-Latency WebRTC Video/Audio Streaming** to deliver two primary capabilities:
1. **AI-Powered Visual Interpretation**: Scene description, Thai banknote and coin scanning with cumulative tallying, and document text reading.
2. **Peer-to-Peer Volunteer Calling**: Low-latency video calls bridging blind users and volunteers with remote assistive controls (flash, capture snapshots, audio).

---

## 🏗 Serverless Architecture & Security Model

Nyeta is engineered to deploy entirely on **Vercel** with zero standalone servers (no VPS, Express, or Railway dependencies):

- **Frontend & App Router**: Next.js 16 + React 19 + Tailwind CSS.
- **AI Vision (Server-Side Only)**: Next.js Route Handler (`/api/gemini`) manages Google Gemini AI Vision calls securely. Client applications never hold Gemini API keys and request assistance via predefined mode aliases (`assistant`, `currency`, `reader`).
- **Realtime Signaling**: Managed WebSockets via **Pusher** for presence, incoming calls, and WebRTC SDP/ICE exchange.
- **Session Security & Authorization**:
  - HMAC-SHA256 authenticated session tokens generated via `/api/session`.
  - Strict channel and event allowlists preventing spoofed signaling.
- **Rate Limiting**: Serverless sliding window rate limiter backed by **Upstash Redis** (via Vercel Marketplace) with automatic in-memory fallback.
- **WebRTC ICE/TURN Fallback**: Dynamic ICE credential distribution via `/api/webrtc/ice` ensuring reliable connections across restrictive mobile NATs/firewalls.

---

## 🔑 Key Features & Interfaces

### 1. Blind Interface (`/blind`)
- **Three Specialized Modes**:
  - **AI Assistant**: Scene description and conversational visual Q&A.
  - **Currency Scanner**: Real-time recognition of Thai banknotes (20, 50, 100, 500, 1000฿) and coins (1, 2, 5, 10฿) with automatic running total and camera obstruction detection.
  - **Document Reader**: Page boundary edge detection and high-accuracy Thai OCR text reading.
- **Voice & Accessibility First**:
  - Web Speech API and responsive audio cues (Earcons).
  - Tactile confirmation via Vibration/Haptic Feedback.
  - High contrast buttons with minimum 44px+ touch targets.

### 2. Volunteer Dashboard (`/volunteer`)
- **Presence & Incoming Call Alerts**: Audio ringtones and instant notifications when a user requests assistance.
- **Live Two-Way Stream**: Full WebRTC video and bidirectional voice communication.
- **Volunteer Tools**: Remote flashlight toggle, high-resolution snapshot capture, and in-call chat.

---

## 🛠 Technology Stack

| Category | Technology | Purpose |
| :--- | :--- | :--- |
| **Framework** | Next.js 16 (App Router) | Fullstack serverless application |
| **Styling** | Tailwind CSS | High-contrast accessible design |
| **AI Vision** | Google Gemini API (`gemini-3.1-flash-lite`) | Scene description, currency, OCR |
| **Signaling** | Pusher Channels | Realtime call discovery and WebRTC handshake |
| **WebRTC Media** | Native WebRTC PeerConnection + TURN | Low-latency audio/video calling |
| **Rate Limiting** | Upstash Redis | API abuse protection on Vercel |
| **Testing** | Vitest, React Testing Library, Playwright | Unit, integration, and E2E validation |

---

## 🚀 Environment Configuration & Setup

### 1. Prerequisites
- **Node.js**: Version 20.x or higher
- **Vercel CLI** (optional for local deployment)

### 2. Environment Variables (`.env.local`)
Create a `.env.local` file based on `.env.local.example`:

```env
# Gemini API (Server-side ONLY)
GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini-3.1-flash-lite

# Pusher Signaling
PUSHER_APP_ID=your_pusher_app_id
NEXT_PUBLIC_PUSHER_KEY=your_pusher_key
PUSHER_SECRET=your_pusher_secret
NEXT_PUBLIC_PUSHER_CLUSTER=ap1

# Session Security
SESSION_SECRET=your_random_32_character_secret

# Upstash Redis (Rate Limiting)
UPSTASH_REDIS_REST_URL=https://your-instance.upstash.io
UPSTASH_REDIS_REST_TOKEN=your_token

# Optional TURN WebRTC Relay
TURN_URL=turn:global.relay.metered.ca:443?transport=tcp
TURN_USERNAME=your_username
TURN_CREDENTIAL=your_credential
```

### 3. Local Development

```bash
# Install dependencies
npm install

# Start local server with HTTPS support (required for camera/microphone permissions)
npm run dev

# Or HTTP mode for testing
npm run dev:http
```

### 4. Running Tests

```bash
# Run unit tests (Vitest)
npm run test

# Run End-to-End tests (Playwright)
npm run test:e2e
```

---

## 🔒 Vercel Deployment Guide

1. Push your repository to GitHub.
2. Import the project into **Vercel**.
3. Under Project Settings -> **Environment Variables**, add all keys from `.env.local`.
4. In the Vercel Integrations / Marketplace tab, optionally attach **Upstash Redis** for distributed rate limiting.
5. Deploy!

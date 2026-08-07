<div align="center">

# Nyeta

### Real-Time Visual Assistance for Blind and Visually Impaired Users

A graduation project combining accessible interfaces, human volunteer assistance, on-device object detection, and Google Gemini AI vision features.

[![Live Demo](https://img.shields.io/badge/Live_Demo-8B5CF6?style=for-the-badge&logo=vercel&logoColor=white)](https://nyeta.vercel.app)
[![Next.js](https://img.shields.io/badge/Next.js_16-000000?style=for-the-badge&logo=nextdotjs&logoColor=white)](https://nextjs.org/)
[![Gemini](https://img.shields.io/badge/Gemini_3.1_Flash_Lite-4285F4?style=for-the-badge&logo=googlegemini&logoColor=white)](https://ai.google.dev/)

</div>

---

## 📄 Overview

**Nyeta** is a web-based visual-assistance platform designed to help blind and visually impaired users understand their surroundings and request help in real time. Built with a **Serverless Vercel-First Architecture**, Nyeta combines **Gemini AI Vision** and **Low-Latency WebRTC Video/Audio Streaming** to deliver two primary capabilities:

1. **Human assistance** through live video and audio calls between a blind user and an available volunteer with remote controls (flash, snapshot captures).
2. **AI-assisted vision** through Google Gemini for scene descriptions, Thai currency recognition with running totals, and document reading.

The interface is designed for eyes-free operation with spoken feedback, voice input, vibration patterns, audio cues, large controls, and screen-reader-friendly interactions.

---

## 🏗 Serverless Architecture & Security Model

Nyeta is engineered to deploy entirely on **Vercel** with zero standalone servers (no VPS, Express, or Railway dependencies):

- **Frontend & App Router**: Next.js 16 + React 19 + Tailwind CSS 4.
- **AI Vision (Server-Side Only)**: Next.js Route Handler (`/api/gemini`) manages Google Gemini AI Vision calls securely. Client applications never hold Gemini API keys and request assistance via predefined mode aliases (`assistant`, `currency`, `reader`).
- **Realtime Signaling**: Managed WebSockets via **Pusher** for presence, incoming calls, and WebRTC SDP/ICE exchange.
- **Server-Authoritative Call Lifecycle & Redis State**:
  - Temporary call state stored in **Upstash Redis** (`nyeta:call:<callId>`) with automatic 10-minute TTL.
  - Server generates cryptographically random `callId` and server-authoritative identities.
  - Atomic volunteer call claiming via Redis Lua scripts (guaranteeing that two simultaneous volunteers cannot claim the same call; second volunteer receives HTTP 409 Conflict).
- **Session Security & Token Segregation**:
  - HMAC-SHA256 authenticated session tokens generated via `/api/session` and `/api/calls`.
  - **Base session token**: 4-hour TTL for anonymous presence.
  - **Call-scoped token**: 20-minute TTL strictly bound to the specific `callId`. Generic tokens with `callId: null` are strictly blocked from private call channels.
  - Strict channel and event allowlists preventing spoofed signaling.
- **Rate Limiting**: Serverless sliding window rate limiter backed by **Upstash Redis** (with automatic in-memory fallback):
  - `gemini`: 20 req / 60s
  - `pusher_trigger`: 60 req / 60s
  - `session`: 30 req / 60s
  - `calls_accept`: 10 req / 60s
- **WebRTC ICE/TURN Fallback**: Dynamic ICE credential distribution via `/api/webrtc/ice` with private cache headers (`Cache-Control: private, no-store, no-cache`) ensuring reliable connections across restrictive mobile NATs/firewalls.

---

## 🔄 Call Lifecycle Flow

```mermaid
sequenceDiagram
    autonumber
    actor Blind as Blind User
    participant Server as Next.js API (/api/calls)
    participant Redis as Upstash Redis (nyeta:call:*)
    participant Pusher as Pusher Channels
    actor Vol1 as Volunteer A
    actor Vol2 as Volunteer B

    Note over Blind,Server: 1. Server-Authoritative Call Creation
    Blind->>Server: POST /api/calls
    Server->>Server: Generate UUID (callId) & blind userId
    Server->>Redis: SET nyeta:call:<callId> {status: "pending", blindUserId, createdAt} (EX: 600s)
    Server-->>Blind: 200 OK { callId, token (call-scoped, TTL: 20m), userId }
    
    Blind->>Pusher: Trigger "incoming-call" on presence-volunteers { callId }
    Pusher-->>Vol1: Event "incoming-call" { callId }
    Pusher-->>Vol2: Event "incoming-call" { callId }

    Note over Vol1,Vol2: 2. Atomic Volunteer Acceptance Race
    Vol1->>Server: POST /api/calls/<callId>/accept (Bearer volunteer token)
    Vol2->>Server: POST /api/calls/<callId>/accept (Bearer volunteer token)

    Server->>Redis: Atomic Claim via Lua Script (Volunteer A wins)
    Redis-->>Server: Status updated to "claimed", claimedBy: Vol1
    Server-->>Vol1: 200 OK { token (call-scoped, TTL: 20m), callId, role: "volunteer" }

    Server->>Redis: Atomic Claim for Volunteer B (already claimed)
    Redis-->>Server: Conflict: status is "claimed"
    Server-->>Vol2: 409 Conflict { error: "Call has already been accepted" }

    Note over Blind,Vol1: 3. Direct WebRTC P2P Media
    Vol1->>Pusher: Trigger "call-accepted" on private-call-<callId>
    Blind->>Pusher: Trigger "offer" on private-call-<callId>
    Vol1->>Pusher: Trigger "answer" on private-call-<callId>
    Blind->>Vol1: Direct WebRTC Audio/Video Streaming + DataChannel
```

---

## 🔑 Core Features

### Human Assistance
- One-tap help requests from the blind-user interface (`/blind`)
- Volunteer availability and incoming-call handling (`/volunteer`)
- Rear-camera video and microphone streaming via native WebRTC
- Remote flashlight and call controls through WebRTC data channels
- Real-time signaling and presence events through Pusher Channels

### Gemini Visual Assistance
- Scene descriptions and visual questions in Thai (`assistant` mode)
- Thai banknote (20, 50, 100, 500, 1000฿) and coin (1, 2, 5, 10฿) recognition with running total (`currency` mode)
- Camera-obstruction detection before AI processing
- Document page-edge detection, text extraction, and spoken reading (`reader` mode)

### Real-Time Object Guidance
- Browser-side object detection using TensorFlow.js and COCO-SSD
- Spoken guidance for moving an object toward the center of the frame

### Accessibility Features
- Speech input through the Web Speech API
- Spoken responses through SpeechSynthesis
- Haptic feedback through the Vibration API
- Wake Lock support during active sessions
- Audio cues (Earcons) for system states

---

## 🛠 Verified Technology Stack

| Category | Technology | Usage |
|---|---|---|
| **Framework** | Next.js 16.1.1 | App Router, pages, and server API routes |
| **UI Runtime** | React 19 | Components, state, refs, and custom hooks |
| **Language** | JavaScript | Client and server application logic |
| **Styling** | Tailwind CSS 4 | Responsive and accessible UI |
| **Generative AI** | Google Gemini API (`gemini-3.1-flash-lite`) | Scene understanding, currency recognition, document OCR |
| **Real-Time Signaling** | Pusher 5.3.4 and Pusher JS 8.5 | Presence, call events, SDP, and ICE signaling |
| **Video & Audio** | Native WebRTC | Peer-to-peer media streaming and data-channel controls |
| **Object Detection** | TensorFlow.js 4.22 & COCO-SSD 2.2.3 | Browser-side object detection and framing guidance |
| **Document Detection** | Scanic 1.0.8 | Rust/WASM page-edge and alignment detection |
| **State & Rate Limiting** | Upstash Redis | Serverless call state and distributed rate limiting |
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

# Upstash Redis (Call State & Rate Limiting)
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

# Start development server with HTTPS (required for camera/mic permissions)
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
4. In the Vercel Integrations / Marketplace tab, attach **Upstash Redis** for distributed call state and rate limiting.
5. Deploy!

---

## Project Context

**Graduation Project**  
Rajamangala University of Technology Suvarnabhumi, Huntra Campus

Developed by [@7sadakonr](https://github.com/7sadakonr)

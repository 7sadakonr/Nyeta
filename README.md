<div align="center">

# Nyeta

### Real-Time Visual Assistance for Blind and Visually Impaired Users

A graduation project combining accessible interfaces, human assistance, on-device object detection, and Google Gemini vision features.

[![Live Demo](https://img.shields.io/badge/Live_Demo-8B5CF6?style=for-the-badge&logo=vercel&logoColor=white)](https://nyeta.vercel.app)
[![Next.js](https://img.shields.io/badge/Next.js_16-000000?style=for-the-badge&logo=nextdotjs&logoColor=white)](https://nextjs.org/)
[![Gemini](https://img.shields.io/badge/Gemini_3.1_Flash_Lite-4285F4?style=for-the-badge&logo=googlegemini&logoColor=white)](https://ai.google.dev/)

</div>

---

## Overview

**Nyeta** is a web-based visual-assistance platform designed to help blind and visually impaired users understand their surroundings and request help in real time.

The system supports two complementary forms of assistance:

1. **Human assistance** through live video and audio calls between a blind user and an available volunteer.
2. **AI-assisted vision** through Google Gemini for scene descriptions, Thai currency recognition, and document reading.

The interface is designed for eyes-free operation with spoken feedback, voice input, vibration patterns, audio cues, large controls, and screen-reader-friendly interactions.

---

## Core Features

### Human Assistance

- One-tap help requests from the blind-user interface
- Volunteer availability and incoming-call handling
- Rear-camera video and microphone streaming
- Volunteer audio returned to the blind user
- Remote flashlight and call controls through a WebRTC data channel
- Real-time signaling and presence events through Pusher Channels

### Gemini Visual Assistance

- Scene descriptions and visual questions in Thai
- Image-and-text conversation through a Next.js API route
- Thai banknote and coin recognition
- Running total for scanned currency
- Camera-obstruction detection before AI processing
- Document capture, text extraction, and spoken reading

### Real-Time Object Guidance

- Browser-side object detection using TensorFlow.js and COCO-SSD
- Spoken guidance for moving an object toward the center of the frame
- Detection loop optimized for interactive camera use

### Accessibility Features

- Speech input through the Web Speech API
- Spoken responses through SpeechSynthesis
- Haptic feedback through the Vibration API
- Wake Lock support during active sessions
- Audio cues for system states
- Camera and microphone access through MediaDevices

---

## System Architecture

### Frontend and Application Layer

- **Next.js 16.1.1 App Router** for routing, pages, and server API routes
- **React 19** with custom hooks for camera, calls, AI modes, speech, and feedback
- **JavaScript** for application logic
- **Tailwind CSS 4** for responsive and accessible interfaces

### Real-Time Communication Layer

- **Native WebRTC APIs** using `RTCPeerConnection`, media tracks, ICE candidates, and `RTCDataChannel`
- **Pusher Channels** for volunteer presence, call requests, SDP exchange, ICE signaling, and call-state events
- No PeerJS dependency is used in the current implementation

### AI and Computer-Vision Layer

- **Google Gemini API** through the `/api/gemini` Next.js route
- Default model: **`gemini-3.1-flash-lite`**
- **TensorFlow.js 4.22** with **COCO-SSD 2.2.3** for client-side object detection
- **Scanic 1.0.8**, a Rust/WASM contour scanner, for document-edge and page-alignment detection
- Canvas-based frame capture, cropping, resizing, and camera-obstruction checks

---

## Verified Technology Stack

| Category | Technology | Current Usage |
|---|---|---|
| Framework | Next.js 16.1.1 | App Router, pages, and API routes |
| UI Runtime | React 19 | Components, state, refs, and custom hooks |
| Language | JavaScript | Client and server application logic |
| Styling | Tailwind CSS 4 | Responsive and accessible UI |
| Generative AI | Google Gemini API | Scene understanding, currency recognition, and document reading |
| AI Model | `gemini-3.1-flash-lite` | Default multimodal model configured by the application |
| Real-Time Signaling | Pusher 5.3.4 and Pusher JS 8.5 | Presence, call events, SDP, and ICE signaling |
| Video and Audio | Native WebRTC | Peer-to-peer media streaming and data-channel controls |
| Object Detection | TensorFlow.js 4.22 and COCO-SSD 2.2.3 | Browser-side object detection and framing guidance |
| Document Detection | Scanic 1.0.8 | Rust/WASM page-edge and alignment detection |
| Browser APIs | MediaDevices, Web Speech, SpeechSynthesis, Wake Lock, Vibration, Canvas | Camera, voice, spoken feedback, haptics, and frame processing |
| Deployment | Vercel | Production web deployment |

---

## Main Routes

| Route | Purpose |
|---|---|
| `/blind` | Accessible interface for requesting human help and using AI vision modes |
| `/volunteer` | Volunteer dashboard for receiving calls and assisting through live video |
| `/api/gemini` | Server route that sends text and images to the Gemini API |
| `/api/pusher/auth` | Authorizes private and presence channels |
| `/api/pusher/trigger` | Publishes signaling and call-state events |

---

## Installation

### 1. Clone the repository

```bash
git clone https://github.com/7sadakonr/Nyeta.git
cd Nyeta
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Create `.env.local` in the project root:

```env
# Google Gemini
GEMINI_API_KEY=your_gemini_api_key
NEXT_PUBLIC_GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini-3.1-flash-lite

# Pusher Channels
PUSHER_APP_ID=your_pusher_app_id
PUSHER_KEY=your_pusher_key
PUSHER_SECRET=your_pusher_secret
PUSHER_CLUSTER=your_pusher_cluster
NEXT_PUBLIC_PUSHER_KEY=your_pusher_key
NEXT_PUBLIC_PUSHER_CLUSTER=your_pusher_cluster
```

`NEXT_PUBLIC_GEMINI_API_KEY` is currently checked by the currency-scanning mode, while Gemini requests are processed through the server route.

### 4. Start the HTTPS development server

```bash
npm run dev
```

Camera and microphone features require a secure context. The project development command starts Next.js with experimental HTTPS enabled.

For HTTP-only development:

```bash
npm run dev:http
```

---

## Available Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Start the Next.js development server with experimental HTTPS |
| `npm run dev:http` | Start the development server over HTTP |
| `npm run build` | Create a production build |
| `npm run start` | Start the production server |
| `npm run lint` | Run ESLint |
| `npm run tunnel` | Expose the HTTPS development server through Cloudflare Tunnel |

---

## Project Context

**Graduation Project**  
Rajamangala University of Technology Suvarnabhumi, Huntra Campus

Developed by [@7sadakonr](https://github.com/7sadakonr)
